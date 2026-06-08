#!/usr/bin/env node
/* Consolidate per-event Kids Activities reviews into a send-ready Telegram digest. */
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

function sectionAfterHeading(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'im');
  const match = markdown.match(re);
  return match ? match[1].trim() : '';
}

function parseVerdict(markdown) {
  const text = sectionAfterHeading(markdown, 'Verdict').split('\n').map(x => x.trim()).filter(Boolean)[0] || '';
  const normalized = text.toLowerCase();
  if (/reject|rejet|not recommended|non recommandé|avoid|skip/.test(normalized)) return 'rejected';
  if (/secondary|option secondaire|low-priority|demote|secondaire/.test(normalized)) return 'secondary';
  if (/recommend|recommended|recommand/.test(normalized)) return 'recommended';
  return 'unknown';
}

function parseSummaryLine(markdown) {
  const body = sectionAfterHeading(markdown, 'Summary line for Telegram')
    || sectionAfterHeading(markdown, 'Summary line for Telegram (in French)')
    || sectionAfterHeading(markdown, 'Summary line for Telegram in French')
    || sectionAfterHeading(markdown, 'Résumé Telegram')
    || sectionAfterHeading(markdown, 'Ligne de résumé Telegram');
  return body.split('\n').map(x => x.trim()).filter(Boolean).join(' ');
}

function cleanSummaryLine(line) {
  return line
    .replace(/^([^\p{L}\p{N}]*)recommended\s*[—-]\s*/iu, '$1')
    .replace(/^([^\p{L}\p{N}]*)secondary\s*[—-]\s*/iu, '$1')
    .replace(/^([^\p{L}\p{N}]*)option secondaire\s*[—-]\s*/iu, '$1')
    .trim();
}

function reviewRecord(event, reviewsDir) {
  const file = path.join(reviewsDir, `${event.id}.md`);
  if (!fs.existsSync(file)) {
    return { event, file, exists: false, verdict: 'missing', summaryLine: '', error: `missing review: ${path.relative(path.dirname(reviewsDir), file)}` };
  }
  const markdown = fs.readFileSync(file, 'utf8');
  const verdict = parseVerdict(markdown);
  const summaryLine = cleanSummaryLine(parseSummaryLine(markdown));
  const errors = [];
  if (verdict === 'unknown') errors.push('unrecognized verdict');
  if (!summaryLine) errors.push('missing Summary line for Telegram');
  return { event, file, exists: true, verdict, summaryLine, error: errors.join('; ') };
}

function frWindow(window) {
  const start = window && window.start ? window.start.slice(0, 10) : '';
  const endExclusive = window && window.endExclusive ? window.endExclusive.slice(0, 10) : '';
  if (!start || !endExclusive) return 'ce week-end';
  const end = new Date(`${endExclusive}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const [sy, sm, sd] = start.split('-');
  const [ey, em, ed] = end.toISOString().slice(0, 10).split('-');
  return `${sd}.${sm}–${ed}.${em}.${ey}`;
}

function renderIndex(records, runDir) {
  const generatedAt = new Date().toISOString();
  const lines = [
    '# Consolidated event reviews',
    '',
    `- Generated at: ${generatedAt}`,
    `- Run: ${runDir}`,
    `- Total reviewed: ${records.length}`,
    `- Recommended: ${records.filter(r => r.verdict === 'recommended').length}`,
    `- Secondary: ${records.filter(r => r.verdict === 'secondary').length}`,
    `- Rejected/missing/invalid: ${records.filter(r => !['recommended', 'secondary'].includes(r.verdict)).length}`,
    ''
  ];
  for (const r of records) {
    lines.push(`## ${r.event.title}`);
    lines.push('');
    lines.push(`- id: \`${r.event.id}\``);
    lines.push(`- verdict: **${r.verdict}**`);
    lines.push(`- review: \`${path.relative(runDir, r.file)}\``);
    lines.push(`- source: ${r.event.url}`);
    if (r.error) lines.push(`- issue: ${r.error}`);
    if (r.summaryLine) lines.push(`- telegram line: ${r.summaryLine}`);
    lines.push('');
  }
  return lines.join('\n');
}

function normalizeTokens(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/grandson[- ]morat|2026|chateau|castle|au|a|l|de|du|des|la|le|les|the|and|et/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function titleSimilarity(a, b) {
  const at = new Set(normalizeTokens(a));
  const bt = new Set(normalizeTokens(b));
  if (!at.size || !bt.size) return 0;
  const inter = [...at].filter(t => bt.has(t)).length;
  const union = new Set([...at, ...bt]).size;
  return inter / union;
}

function verdictRank(verdict) {
  return { recommended: 3, secondary: 2, rejected: 1 }[verdict] || 0;
}

function dedupeReviewedRecords(records) {
  const result = [];
  for (const record of records) {
    const duplicateIndex = result.findIndex(existing => titleSimilarity(existing.event.title, record.event.title) >= 0.5);
    if (duplicateIndex === -1) {
      result.push(record);
      continue;
    }
    const existing = result[duplicateIndex];
    if (verdictRank(record.verdict) > verdictRank(existing.verdict)) result[duplicateIndex] = record;
  }
  return result;
}

function renderTelegram(records, queue) {
  const deduped = dedupeReviewedRecords(records);
  const recommended = deduped.filter(r => r.verdict === 'recommended');
  const secondary = deduped.filter(r => r.verdict === 'secondary');
  const rejected = deduped.filter(r => r.verdict === 'rejected');
  if (!recommended.length && !secondary.length) {
    throw new Error('no sendable reviewed events; refusing to generate final digest');
  }
  const lines = [
    `Idées famille pour ce week-end — ${frWindow(queue.window)}`,
    '',
    'Sélection vérifiée manuellement à partir des pages sources. À recontrôler juste avant de partir si météo/réservation.'
  ];

  let i = 1;
  for (const r of recommended) {
    lines.push('', `${i++}. ${r.summaryLine}`, r.event.url);
  }
  if (secondary.length) {
    lines.push('', 'Options secondaires :');
    for (const r of secondary) {
      lines.push('', `• ${r.summaryLine}`, r.event.url);
    }
  }
  if (rejected.length) {
    lines.push('', `Écarté après review : ${rejected.map(r => r.event.title).join(', ')}.`);
  }
  return lines.join('\n').trim() + '\n';
}

function consolidate(runDir) {
  const queuePath = path.join(runDir, 'event-review-queue.json');
  if (!fs.existsSync(queuePath)) throw new Error(`missing event-review-queue.json in ${runDir}`);
  const queue = readJson(queuePath);
  const events = queue.events || [];
  const reviewsDir = path.join(runDir, 'event-reviews');
  const records = events.map(event => reviewRecord(event, reviewsDir));
  const invalid = records.filter(r => r.error || !['recommended', 'secondary', 'rejected'].includes(r.verdict));
  if (invalid.length) {
    throw new Error(`review consolidation blocked: ${invalid.map(r => `${r.event.id}: ${r.error || r.verdict}`).join('; ')}`);
  }
  const index = renderIndex(records, runDir);
  const telegram = renderTelegram(records, queue);
  fs.writeFileSync(path.join(reviewsDir, 'INDEX.md'), index + '\n');
  fs.writeFileSync(path.join(runDir, 'telegram-summary-reviewed.txt'), telegram);
  return { runDir, reviewed: records.length, recommended: records.filter(r => r.verdict === 'recommended').length, secondary: records.filter(r => r.verdict === 'secondary').length, rejected: records.filter(r => r.verdict === 'rejected').length };
}

function main() {
  const explicit = process.argv.find(a => a.startsWith('--run-dir='));
  const runDir = explicit ? path.resolve(explicit.split('=')[1]) : latestRunDir();
  const result = consolidate(runDir);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try { main(); } catch (err) { console.error(err.stack || err.message); process.exit(1); }
}

module.exports = { consolidate, parseVerdict, parseSummaryLine };
