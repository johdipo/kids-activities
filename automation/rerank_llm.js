#!/usr/bin/env node
/*
 * Kids Activities — LLM re-rank of the digest shortlist (TASK-231).
 *
 * The deterministic scorer filters age/date/distance well but can't judge real
 * family appeal. This module asks the configured model (no hardcoded model — it
 * inherits the OpenClaw default via `openclaw capability model run`) to re-rank a
 * SMALL, already-filtered candidate pool (~15-20 events, not the full 1800) by
 * genuine appeal for Johan's family, applying the taste rules in TASTE-FEEDBACK.md.
 *
 * It is fully FALLBACK-SAFE: any error, timeout, non-zero exit, or unparseable
 * output makes rerankShortlist() resolve to null so the caller keeps the
 * deterministic order. It never throws and never blocks the digest.
 */
const { execFile } = require('child_process');

const OPENCLAW_BIN = process.env.OPENCLAW_BIN || '/home/isaak/.npm-global/bin/openclaw';
const DEFAULT_TIMEOUT_MS = Number(process.env.KA_RERANK_TIMEOUT_MS || 150000);

// Compact projection so the prompt stays cheap regardless of description length.
function candidateLine(item, i) {
  const e = item.event;
  const s = item.score || {};
  const tags = (e.tags || []).slice(0, 6).join(',');
  const taste = (s.taste && s.taste.flags && s.taste.flags.length) ? ` flags=${s.taste.flags.join(',')}` : '';
  const date = (e.startDate || '').slice(0, 10) || 'date?';
  const loc = (e.locationText || e.city || '').split(',')[0];
  return `${i + 1}. id=${e.id} | ${e.title} | ${date} | ${loc} | source=${e.source} | score=${s.total}${taste} | tags=${tags}`;
}

function buildPrompt(candidates, window) {
  const win = window ? `${window.start} → ${window.endExclusive} (exclu)` : 'ce week-end';
  const list = candidates.map(candidateLine).join('\n');
  return [
    "Tu es le curateur du digest « Activités en famille » pour la famille de Johan (Yverdon, Suisse).",
    "Famille : Andy (6 ans, intello, sciences, ateliers), Lennon (4 ans, animaux, nature, exploration), Johan & Daisy.",
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
    "Classe-les du PLUS au MOINS pertinent pour une vraie sortie famille ce week-end.",
    "Pour chacun donne un « pourquoi » court (max ~14 mots, en français, concret, pas de remplissage).",
    "Réponds UNIQUEMENT avec un tableau JSON valide, sans texte autour, de la forme :",
    '[{"id":"<id>","keep":true,"why":"<raison courte>"}]',
    "Ordre du tableau = ordre de classement (meilleur en premier). keep=false pour un candidat à écarter."
  ].join('\n');
}

function runModelCli(prompt, opts = {}) {
  return new Promise((resolve, reject) => {
    const args = ['capability', 'model', 'run', '--json', '--prompt', prompt];
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

module.exports = { rerankShortlist, buildPrompt, extractJsonBlock, parseModelOutput, candidateLine };
