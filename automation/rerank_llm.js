#!/usr/bin/env node
/*
 * Kids Activities — LLM re-rank of the digest shortlist (TASK-231).
 *
 * The deterministic scorer filters age/date/distance well but can't judge real
 * family appeal. This module asks the configured model (no hardcoded model — it
 * uses the `sonnet` alias (KA_RERANK_MODEL_ALIAS), falling back to the OpenClaw default) to re-rank a
 * SMALL, already-filtered candidate pool (~15-20 events, not the full 1800) by
 * genuine appeal for Johan's family, applying the taste rules in TASTE-FEEDBACK.md.
 *
 * It is fully FALLBACK-SAFE: any error, timeout, non-zero exit, or unparseable
 * output makes rerankShortlist() resolve to null so the caller keeps the
 * deterministic order. It never throws and never blocks the digest.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OPENCLAW_BIN = process.env.OPENCLAW_BIN || '/home/isaak/.npm-global/bin/openclaw';
const DEFAULT_TIMEOUT_MS = Number(process.env.KA_RERANK_TIMEOUT_MS || 150000);

const DESC_MAX = Number(process.env.KA_RERANK_DESC_CHARS || 220);
// Compact projection so the prompt stays cheap regardless of description length.
function candidateLine(item, i) {
  const e = item.event;
  const s = item.score || {};
  const tags = (e.tags || []).slice(0, 6).join(',');
  const taste = (s.taste && s.taste.flags && s.taste.flags.length) ? ` flags=${s.taste.flags.join(',')}` : '';
  const date = (e.startDate || '').slice(0, 10) || 'date?';
  const loc = (e.locationText || e.city || '').split(',')[0];
  const time = (String(e.startDate || '').match(/T(\d{2}:\d{2})/) || [])[1];
  const when = time && time !== '00:00' ? `${date} ${time}` : date;
  const meta = [e.ageText ? `âge=${e.ageText}` : '', e.priceText ? `prix=${String(e.priceText).slice(0, 40)}` : ''].filter(Boolean).join(' | ');
  // Short summary (TASK-231 follow-up): lets the model judge real content, not just the title.
  const desc = String(e.description || '').replace(/\s+/g, ' ').trim().slice(0, DESC_MAX);
  const head = `${i + 1}. id=${e.id} | ${e.title} | ${when} | ${loc} | source=${e.source} | score=${s.total}${taste} | tags=${tags}${meta ? ' | ' + meta : ''}`;
  return desc ? `${head}\n   résumé: ${desc}` : head;
}

function ageOn(birth, now = new Date()) {
  const b = new Date(birth);
  let a = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a -= 1;
  return a;
}

function buildPrompt(candidates, window) {
  const win = window
    ? `${window.friday ? `vendredi ${window.friday} dès 17h + ` : ''}${window.start} → ${window.endExclusive} (exclu)`
    : 'ce week-end';
  const list = candidates.map(candidateLine).join('\n');
  return [
    "Tu es le curateur du digest « Activités en famille » pour la famille de Johan (Yverdon, Suisse).",
    `Famille avec deux filles : Andy (${ageOn('2019-07-01')} ans, intello, sciences, ateliers), Lennon (${ageOn('2021-11-03')} ans, animaux, nature, exploration), Johan & Daisy.`,
    "",
    "Règles de goût (source : TASTE-FEEDBACK.md) — applique-les strictement :",
    "- Priorité forte aux NOUVEAUTÉS et événements PONCTUELS datés ce week-end ; malus aux expos permanentes/récurrentes.",
    "- Bonifie : festivals, fêtes de village, terroir, plein-air, ateliers enfants concrets, nature/animaux/science, eau, découverte.",
    "- Déprioriser l'ART (expos d'art, vernissages, ateliers purement artistiques) sauf angle enfant/famille marqué.",
    "- Déprioriser les BALADES / VISITES GUIDÉES génériques sans accroche forte.",
    "- Écarte le civique/administratif (conseils, votations) et le passe-partout.",
    "- Champ-Pittet (Pro Natura) : correct mais jamais en tête, jamais chaque semaine.",
    "",
    `Fenêtre cible : ${win}. Voici les ${candidates.length} candidats pré-filtrés (déjà valides âge/date/distance) :`,
    list,
    "",
    "Appuie-toi sur le « résumé » quand il existe : le titre seul peut tromper (ex. un tournoi n'est pas une journée nature). Si une inscription est requise ou l'horaire est très matinal, mentionne-le dans le pourquoi.",
    "Classe-les du PLUS au MOINS pertinent pour une vraie sortie famille ce week-end.",
    "Pour chacun donne un « pourquoi » court (max ~14 mots, en français, concret, pas de remplissage).",
    "Réponds UNIQUEMENT avec un tableau JSON valide, sans texte autour, de la forme :",
    '[{"id":"<id>","keep":true,"why":"<raison courte>"}]',
    "Ordre du tableau = ordre de classement (meilleur en premier). keep=false pour un candidat à écarter."
  ].join('\n');
}

// Model chosen by ALIAS (never a hardcoded id): the alias is resolved against
// agents.defaults.models in openclaw.json at run time, so it follows whatever model
// the alias points to. Unknown alias / unreadable config → OpenClaw default model.
const MODEL_ALIAS = process.env.KA_RERANK_MODEL_ALIAS || 'sonnet';
const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG_PATH || path.join(os.homedir(), '.openclaw', 'openclaw.json');

function resolveModelAlias(alias = MODEL_ALIAS, configFile = OPENCLAW_CONFIG) {
  if (!alias) return null;
  try {
    const models = JSON.parse(fs.readFileSync(configFile, 'utf8')).agents.defaults.models || {};
    const hit = Object.entries(models).find(([, v]) => v && v.alias === alias);
    return hit ? hit[0] : null;
  } catch { return null; }
}

function runModelCli(prompt, opts = {}) {
  return new Promise((resolve, reject) => {
    const args = ['capability', 'model', 'run', '--json', '--prompt', prompt];
    const model = opts.model !== undefined ? opts.model : resolveModelAlias();
    if (model) args.push('--model', model);
    execFile(OPENCLAW_BIN, args, { timeout: opts.timeoutMs || DEFAULT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(new Error(`model run failed: ${err.message}`));
        resolve(stdout);
      });
  });
}

// Extract a JSON array/object from arbitrary model text (handles code fences and
// leading/trailing prose).
function extractJsonBlock(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch { /* keep trying */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch { /* keep trying */ } }
  const startArr = t.indexOf('['); const endArr = t.lastIndexOf(']');
  if (startArr !== -1 && endArr > startArr) { try { return JSON.parse(t.slice(startArr, endArr + 1)); } catch { /* keep trying */ } }
  const startObj = t.indexOf('{'); const endObj = t.lastIndexOf('}');
  if (startObj !== -1 && endObj > startObj) { try { return JSON.parse(t.slice(startObj, endObj + 1)); } catch { /* keep trying */ } }
  return null;
}

function parseModelOutput(stdout) {
  const outer = JSON.parse(stdout);
  const text = outer && outer.outputs && outer.outputs[0] && outer.outputs[0].text;
  const parsed = extractJsonBlock(text);
  const ranking = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.ranking) ? parsed.ranking : null);
  return { ranking, model: outer && outer.model };
}

/**
 * Re-rank a candidate pool via the LLM. Resolves to { ranking: [{id, keep, why}], model }
 * on success, or null on any failure (deterministic fallback). Never throws.
 * `opts.runModel(prompt, opts)` is injectable so tests never hit the network.
 */
async function rerankShortlist(candidates, window, opts = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const runModel = opts.runModel || runModelCli;
  try {
    const prompt = buildPrompt(candidates, window);
    const raw = await runModel(prompt, opts);
    const { ranking, model } = parseModelOutput(raw);
    if (!Array.isArray(ranking) || !ranking.length) return null;
    const known = new Set(candidates.map(c => c.event.id));
    const seen = new Set();
    const cleaned = ranking
      .filter(r => r && known.has(r.id) && !seen.has(r.id) && seen.add(r.id))
      .map(r => ({ id: r.id, keep: r.keep !== false, why: typeof r.why === 'string' ? r.why.trim() : '' }));
    if (!cleaned.length) return null;
    return { ranking: cleaned, model };
  } catch {
    return null;
  }
}

module.exports = { resolveModelAlias, rerankShortlist, buildPrompt, extractJsonBlock, parseModelOutput, candidateLine };
