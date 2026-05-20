#!/usr/bin/env node
/* Kids Activities v0.2 operational monitor / quality gate checker. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'automation', 'out');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function latestRunDir() {
  if (!fs.existsSync(OUT_DIR)) throw new Error(`missing output directory: ${OUT_DIR}`);
  const dirs = fs.readdirSync(OUT_DIR)
    .filter(name => name.startsWith('v02-'))
    .map(name => ({ name, full: path.join(OUT_DIR, name), stat: fs.statSync(path.join(OUT_DIR, name)) }))
    .filter(x => x.stat.isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name));
  if (!dirs.length) throw new Error('no v02 artifact directories found');
  return dirs[0].full;
}

function hasFrenchSignals(text) {
  return /Idées famille|Pourquoi:|À vérifier:|Sélection sourcée|week-end/i.test(text)
    && /[éèêàùçÉÈÊÀÙÇ]/.test(text);
}

function looksLikeTelegramSummary(text) {
  if (!hasFrenchSignals(text)) return false;
  if (/\|\s*[-:]+\s*\|/.test(text)) return false; // markdown table separator
  const itemCount = (text.match(/^\d+\.\s+/gm) || []).length;
  if (itemCount > 7) return false;
  if (itemCount > 0 && !/https?:\/\//.test(text)) return false;
  return true;
}

function inspect(runDir) {
  const required = ['fetch-log.json', 'normalized-events.json', 'quality-inspection.json', 'scored-events.json', 'telegram-summary.txt', 'errors.log'];
  const missing = required.filter(name => !fs.existsSync(path.join(runDir, name)));
  const failures = missing.map(name => `missing artifact: ${name}`);
  const warnings = [];

  let fetchLog = [];
  let quality = null;
  let scored = null;
  let summary = '';

  if (!missing.includes('fetch-log.json')) fetchLog = readJson(path.join(runDir, 'fetch-log.json'));
  if (!missing.includes('quality-inspection.json')) quality = readJson(path.join(runDir, 'quality-inspection.json'));
  if (!missing.includes('scored-events.json')) scored = readJson(path.join(runDir, 'scored-events.json'));
  if (!missing.includes('telegram-summary.txt')) summary = fs.readFileSync(path.join(runDir, 'telegram-summary.txt'), 'utf8');

  const okSources = fetchLog.filter(s => s.status === 'ok' && Number(s.count || 0) > 0);
  if (!okSources.length) failures.push('all sources failed or returned zero events');

  if (quality) {
    const q = quality.acceptedQuality || {};
    const c = quality.counts || {};
    if ((c.raw || 0) <= 0) failures.push('raw event count is zero');
    if ((c.accepted || 0) <= 0) failures.push('accepted recommendation pool is empty');
    if ((q.withDatePct || 0) < 80) failures.push(`accepted date coverage below gate: ${q.withDatePct || 0}%`);
    if ((q.withUrlPct || 0) < 90) failures.push(`accepted URL coverage below gate: ${q.withUrlPct || 0}%`);
    if ((q.withLocationPct || 0) < 80) warnings.push(`accepted location coverage is low: ${q.withLocationPct || 0}%`);
    if (!Array.isArray(quality.topRejected) || !quality.topRejected.length) warnings.push('top rejected sample is empty');
    if (!Array.isArray(quality.sampleAccepted) || !quality.sampleAccepted.length) warnings.push('accepted evidence sample is empty');
  }

  if (scored) {
    const top = (scored.scored || []).slice(0, 5);
    if (!top.length) failures.push('scored recommendation list is empty');
    for (const [idx, item] of top.entries()) {
      const components = item.score && item.score.components;
      if (!components || typeof components.ageFitAndy !== 'number' || typeof components.ageFitLennon !== 'number') {
        failures.push(`top scored item ${idx + 1} lacks transparent family scoring components`);
      }
    }
  }

  if (!looksLikeTelegramSummary(summary)) failures.push('telegram summary does not pass readability/format checks');

  return {
    runDir,
    checkedAt: new Date().toISOString(),
    ok: failures.length === 0,
    failures,
    warnings,
    sourceStatus: fetchLog.map(s => ({ source: s.source, status: s.status, count: s.count || 0, error: s.error || null })),
    counts: quality ? quality.counts : null,
    acceptedQuality: quality ? quality.acceptedQuality : null,
    summaryPreview: summary.split('\n').slice(0, 18).join('\n')
  };
}

function main() {
  const explicit = process.argv.find(a => a.startsWith('--run-dir='));
  const runDir = explicit ? path.resolve(explicit.split('=')[1]) : latestRunDir();
  const result = inspect(runDir);
  const line = JSON.stringify(result);
  const logPath = path.join(OUT_DIR, 'monitor-log.jsonl');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.appendFileSync(logPath, line + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  try { main(); } catch (err) { console.error(err.stack || err.message); process.exit(2); }
}

module.exports = { inspect, looksLikeTelegramSummary };
