#!/usr/bin/env node
/*
 * Kids Activities — taste feedback loop (TASK-231).
 *
 * Persists a per-event / per-keyword taste retour from Johan so the NEXT digest run
 * reflects it. Two sinks, kept in sync:
 *   1. automation/state/taste-feedback.json  — machine-readable rules the scorer
 *      reads back via loadTasteFeedback()/feedbackAdjustment() in kids_activities_v1.js.
 *   2. ../TASTE-FEEDBACK.md                   — human log (source of truth for humans).
 *
 * Usage:
 *   node automation/feedback.js "<match>" <polarity> ["raison"]
 *     <match>    substring matched (accent/case-insensitive) against title/tags/source/city
 *     <polarity> one of: ++  +  -  --  👍  👎   OR an explicit signed number like +15 / -20
 *     raison     optional free-text note
 *
 * Examples:
 *   node automation/feedback.js "abeilles" -- "déjà fait, permanent"
 *   node automation/feedback.js "festival" ++ "on adore les festivals"
 *   node automation/feedback.js "balade découverte" - "trop générique"
 */
const fs = require('fs');
const path = require('path');

const { TASTE_FEEDBACK_FILE, loadTasteFeedback } = require('../kids_activities_v1.js');
const TASTE_MD = path.resolve(__dirname, '..', 'TASTE-FEEDBACK.md');

const POLARITY = { '--': -25, '-': -12, '+': 12, '++': 20, '👍': 12, '👎': -12, '👍👍': 20, '👎👎': -25 };

function polarityToDelta(token) {
  if (token == null) return null;
  const t = String(token).trim();
  if (Object.prototype.hasOwnProperty.call(POLARITY, t)) return POLARITY[t];
  if (/^[+-]?\d+$/.test(t)) { const n = Number(t); return Number.isFinite(n) && n !== 0 ? n : null; }
  return null;
}

function saveRule(rule, file = TASTE_FEEDBACK_FILE) {
  const fb = loadTasteFeedback(file);
  // Replace an existing rule for the same match (case/accent-insensitive) so repeated
  // feedback updates rather than stacks endlessly.
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const rules = fb.rules.filter(r => norm(r.match) !== norm(rule.match));
  rules.push(rule);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ rules }, null, 2) + '\n');
  return rules.length;
}

function appendMarkdownLog(rule) {
  if (!fs.existsSync(TASTE_MD)) return false;
  const md = fs.readFileSync(TASTE_MD, 'utf8');
  const date = new Date().toISOString().slice(0, 10);
  const sign = rule.delta > 0 ? '👍' : '👎';
  const line = `- ${date} (Johan, via feedback CLI) : ${sign} «${rule.match}» (${rule.delta > 0 ? '+' : ''}${rule.delta})${rule.reason ? ` — ${rule.reason}` : ''}`;
  let next;
  if (/^##\s+Historique des retours bruts\s*$/im.test(md)) {
    next = md.replace(/(^##\s+Historique des retours bruts\s*$)/im, `$1\n${line}`);
  } else {
    next = md.trimEnd() + `\n\n## Historique des retours bruts\n${line}\n`;
  }
  fs.writeFileSync(TASTE_MD, next);
  return true;
}

function main() {
  const [, , match, polarity, ...rest] = process.argv;
  const reason = rest.join(' ').trim();
  if (!match || polarity == null) {
    console.error('Usage: node automation/feedback.js "<match>" <++|+|-|--|👍|👎|±N> ["raison"]');
    process.exit(2);
  }
  const delta = polarityToDelta(polarity);
  if (delta == null) {
    console.error(`Unrecognized polarity "${polarity}". Use ++, +, -, --, 👍, 👎, or a signed number like +15.`);
    process.exit(2);
  }
  const rule = { match: String(match).trim(), delta, reason, at: new Date().toISOString() };
  const total = saveRule(rule);
  const logged = appendMarkdownLog(rule);
  console.log(JSON.stringify({ ok: true, rule, totalRules: total, markdownLogged: logged, jsonFile: TASTE_FEEDBACK_FILE }, null, 2));
}

if (require.main === module) {
  try { main(); } catch (err) { console.error(err.stack || err.message); process.exit(1); }
}

module.exports = { polarityToDelta, saveRule, appendMarkdownLog };
