#!/usr/bin/env node
/*
 * export_web_data.js
 * --------------------------------------------------------------------------
 * Build a clean, safelisted JSON export for the Kids Activities pilot web app.
 *
 * It reads the human-reviewed pipeline artifacts under automation/out/v02-*
 * (which are gitignored and contain raw scraped text + local file paths) and
 * the committed data/manual-events.json, then emits a small, sanitized
 * document at web/data/recommendations-index.json that the static web app can
 * consume.
 *
 * Safelist principles (see acceptance criteria):
 *   - Only known-safe fields are copied to the output. Nothing is passed
 *     through verbatim.
 *   - Every emitted string is scrubbed for local filesystem paths and other
 *     internal markers; raw OCR/evidence blobs and private media paths are
 *     dropped or summarized.
 *   - URLs are restricted to http(s) public links.
 *
 * Usage:
 *   node automation/export_web_data.js [--today=YYYY-MM-DD] [--out=path.json]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseVerdict, parseSummaryLine } = require('./consolidate_reviews');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'automation', 'out');
const DEFAULT_EXPORT = path.join(ROOT, 'web', 'data', 'recommendations-index.json');
const SCHEMA_VERSION = '1.0';

// ---------------------------------------------------------------------------
// Sanitization helpers
// ---------------------------------------------------------------------------

// Collapse anything that looks like an absolute/local path or file URI so no
// internal layout leaks into the public export.
function scrubText(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  text = text
    // file:// URIs and unix/home/media absolute paths
    .replace(/file:\/\/[^\s)]+/gi, '[fichier local masqué]')
    .replace(/\/(?:home|Users|var|tmp|root|mnt|media)\/[^\s)"']+/g, '[fichier local masqué]')
    // windows-style paths
    .replace(/[A-Za-z]:\\[^\s)"']+/g, '[fichier local masqué]')
    // internal pipeline markers occasionally embedded in OCR evidence
    .replace(/OFFICIAL_[A-Z_]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function safeUrl(value) {
  const text = scrubText(value);
  if (/^https?:\/\/[^\s]+$/i.test(text)) return text;
  return '';
}

function trim(text, max) {
  const t = scrubText(text);
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + '…';
}

function cleanList(list, max) {
  if (!Array.isArray(list)) return [];
  return list
    .map(item => scrubText(item))
    .filter(Boolean)
    .slice(0, max || 8);
}

// ---------------------------------------------------------------------------
// Source label mapping (raw source key -> human label)
// ---------------------------------------------------------------------------

const SOURCE_LABELS = {
  'la-derivee': 'La Dérivée (Yverdon)',
  laderivee: 'La Dérivée (Yverdon)',
  grandson: 'Grandson',
  yverdon: 'Yverdon-les-Bains',
  orbe: 'Orbe',
  tempsLibre: 'Temps Libre',
  tempslibre: 'Temps Libre',
  manualJohan: 'Saisie manuelle (sources officielles)',
  manual: 'Saisie manuelle (sources officielles)',
};

function sourceLabel(key) {
  const k = scrubText(key);
  return SOURCE_LABELS[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Source inconnue');
}

// ---------------------------------------------------------------------------
// Run discovery
// ---------------------------------------------------------------------------

// Convert a run directory name like v02-2026-06-15T16-06-35-244Z into an ISO
// timestamp. The directory basename is itself safe to expose (no path).
function runIdToIso(runId) {
  const m = runId.match(/v02-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, ms] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// A "reviewed run" has both a human-confirmed digest and the per-event reviews.
function discoverReviewedRuns() {
  if (!fs.existsSync(OUT_DIR)) return [];
  return fs.readdirSync(OUT_DIR)
    .filter(name => name.startsWith('v02-'))
    .map(name => ({ runId: name, dir: path.join(OUT_DIR, name) }))
    .filter(r => fs.statSync(r.dir).isDirectory())
    .filter(r =>
      fs.existsSync(path.join(r.dir, 'telegram-summary-reviewed.txt')) &&
      fs.existsSync(path.join(r.dir, 'event-reviews', 'INDEX.md')) &&
      fs.existsSync(path.join(r.dir, 'event-review-queue.json')))
    .sort((a, b) => b.runId.localeCompare(a.runId));
}

// ---------------------------------------------------------------------------
// Build a digest object for a single reviewed run
// ---------------------------------------------------------------------------

const VERDICT_META = {
  recommended: { key: 'recommended', label: 'Recommandé', rank: 3 },
  secondary: { key: 'secondary', label: 'Option secondaire', rank: 2 },
  rejected: { key: 'rejected', label: 'Écarté après vérification', rank: 1 },
  missing: { key: 'unknown', label: 'Non vérifié', rank: 0 },
  unknown: { key: 'unknown', label: 'Non vérifié', rank: 0 },
};

function loadScoredById(dir) {
  const file = path.join(dir, 'scored-events.json');
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  try {
    const data = readJson(file);
    for (const entry of data.scored || []) {
      if (entry && entry.event && entry.event.id) map.set(entry.event.id, entry);
    }
  } catch (_) { /* ignore malformed scored file */ }
  return map;
}

function buildActivity(queueEvent, dir, scoredById) {
  const scored = scoredById.get(queueEvent.id);
  const ev = (scored && scored.event) || {};
  const score = (scored && scored.score) || {};

  // Verdict + reviewed one-liner come from the per-event review markdown.
  const reviewFile = path.join(dir, 'event-reviews', `${queueEvent.id}.md`);
  let verdict = 'missing';
  let summaryLine = '';
  if (fs.existsSync(reviewFile)) {
    const md = fs.readFileSync(reviewFile, 'utf8');
    verdict = parseVerdict(md);
    summaryLine = parseSummaryLine(md);
  }
  const verdictMeta = VERDICT_META[verdict] || VERDICT_META.unknown;

  // Provenance: human-readable source label + official links only. Raw
  // sourceFiles / evidence / ocrEvidence are intentionally never copied.
  const officialSources = cleanList(ev.officialSources, 5).map(safeUrl).filter(Boolean);
  const hasPrivateMedia = Array.isArray(ev.sourceFiles) && ev.sourceFiles.length > 0;

  return {
    id: scrubText(queueEvent.id),
    title: trim(queueEvent.title || ev.title, 160),
    sourceKey: scrubText(queueEvent.source || ev.source),
    sourceLabel: sourceLabel(queueEvent.source || ev.source),
    url: safeUrl(queueEvent.url || ev.url),
    location: trim(queueEvent.location || ev.locationText || ev.locationName, 160),
    city: trim(ev.city, 80),
    startDate: scrubText(queueEvent.startDate || ev.startDate),
    endDate: scrubText(ev.endDate),
    ageText: trim(ev.ageText, 120),
    priceText: trim(ev.priceText, 160),
    tags: cleanList(ev.tags, 8),
    description: trim(ev.description, 320),
    verdict: verdictMeta.key,
    verdictLabel: verdictMeta.label,
    verdictRank: verdictMeta.rank,
    confidenceStatus: scrubText(ev.confidenceStatus || ev.status || ''),
    score: Number.isFinite(score.total) ? score.total : (Number.isFinite(queueEvent.score) ? queueEvent.score : null),
    scoreLabel: trim(score.label || queueEvent.label, 40),
    summary: trim(summaryLine, 400),
    reasons: cleanList(score.reasons || queueEvent.reasons, 4),
    caveats: cleanList(score.caveats || queueEvent.caveats, 4),
    officialSources,
    provenanceNote: hasPrivateMedia ? 'Source incluant une photo privée (masquée)' : '',
  };
}

function sourceSummary(dir) {
  const file = path.join(dir, 'quality-inspection.json');
  if (!fs.existsSync(file)) return [];
  try {
    const data = readJson(file);
    return (data.sourceLogs || []).map(log => ({
      source: sourceLabel(log.source),
      status: scrubText(log.status),
      count: Number.isFinite(log.count) ? log.count : null,
    })).filter(s => s.source);
  } catch (_) {
    return [];
  }
}

function buildDigest(run) {
  const queue = readJson(path.join(run.dir, 'event-review-queue.json'));
  const scoredById = loadScoredById(run.dir);
  const events = queue.events || [];
  const activities = events
    .map(e => buildActivity(e, run.dir, scoredById))
    .sort((a, b) => (b.verdictRank - a.verdictRank) || ((b.score || 0) - (a.score || 0)));

  return {
    runId: scrubText(run.runId),
    generatedAt: runIdToIso(run.runId),
    window: {
      start: scrubText(queue.window && queue.window.start),
      endExclusive: scrubText(queue.window && queue.window.endExclusive),
    },
    counts: {
      total: activities.length,
      recommended: activities.filter(a => a.verdict === 'recommended').length,
      secondary: activities.filter(a => a.verdict === 'secondary').length,
      rejected: activities.filter(a => a.verdict === 'rejected').length,
    },
    sources: sourceSummary(run.dir),
    activities,
  };
}

// ---------------------------------------------------------------------------
// Confirmed manual program (committed data, with private media masked)
// ---------------------------------------------------------------------------

function buildConfirmedProgram(todayIso) {
  const file = path.join(ROOT, 'data', 'manual-events.json');
  if (!fs.existsSync(file)) return [];
  let data;
  try { data = readJson(file); } catch (_) { return []; }
  const out = [];
  for (const entry of data.entries || []) {
    if (entry.status !== 'confirmed') continue;
    const dates = (entry.dates || [])
      .map(d => scrubText(d.startDate))
      .filter(Boolean)
      .filter(d => d.slice(0, 10) >= todayIso.slice(0, 10))
      .sort();
    if (!dates.length) continue;
    out.push({
      id: scrubText(entry.id),
      title: trim(entry.title, 160),
      venue: trim(entry.venue, 120),
      city: trim(entry.city, 80),
      ageText: trim(entry.ageText, 120),
      tags: cleanList(entry.tags, 8),
      dates,
      officialSources: cleanList(entry.officialSources, 5).map(safeUrl).filter(Boolean),
      // sourceFiles/ocrEvidence are private — summarize provenance only.
      provenanceNote: (Array.isArray(entry.sourceFiles) && entry.sourceFiles.length)
        ? 'Confirmé via source officielle ; photo d’origine conservée en privé'
        : 'Confirmé via source officielle',
    });
  }
  return out.sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = { today: new Date().toISOString().slice(0, 10), out: DEFAULT_EXPORT };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--today=')) args.today = a.split('=')[1];
    else if (a.startsWith('--out=')) args.out = path.resolve(a.split('=')[1]);
  }
  return args;
}

function main() {
  const args = parseArgs();
  const todayIso = `${args.today}T00:00:00.000Z`;
  const runs = discoverReviewedRuns();

  // One digest per window; keep the most recent reviewed run for each window.
  const byWindow = new Map();
  for (const run of runs) {
    const digest = buildDigest(run);
    const key = digest.window.start || run.runId;
    const existing = byWindow.get(key);
    if (!existing || digest.runId > existing.runId) byWindow.set(key, digest);
  }
  const digests = [...byWindow.values()]
    .sort((a, b) => (b.window.start || '').localeCompare(a.window.start || ''));

  // Upcoming = window whose start is today or later (soonest first); the rest
  // are past digests.
  const upcomingCandidates = digests
    .filter(d => d.window.start && d.window.start >= args.today)
    .sort((a, b) => a.window.start.localeCompare(b.window.start));
  const upcoming = upcomingCandidates[0] || null;
  const past = digests
    .filter(d => d !== upcoming)
    .sort((a, b) => (b.window.start || '').localeCompare(a.window.start || ''));

  const latestRun = runs[0] || null;
  const doc = {
    schemaVersion: SCHEMA_VERSION,
    app: {
      title: 'Kids Activities — pilote',
      subtitle: 'Idées famille pour le week-end, vérifiées à la main',
      region: 'Yverdon-les-Bains & alentours',
      disclaimer: 'Sélection vérifiée manuellement à partir des pages sources. À recontrôler avant de partir (météo, réservation, horaires).',
    },
    generatedAt: new Date().toISOString(),
    today: args.today,
    freshness: {
      latestRunId: latestRun ? scrubText(latestRun.runId) : null,
      latestRunAt: latestRun ? runIdToIso(latestRun.runId) : null,
      reviewedRunsExported: digests.length,
      windowsCovered: digests.map(d => d.window.start).filter(Boolean),
    },
    upcoming,
    past,
    confirmedProgram: buildConfirmedProgram(todayIso),
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(doc, null, 2) + '\n');

  const summary = {
    out: path.relative(ROOT, args.out),
    reviewedRuns: runs.length,
    windows: digests.length,
    upcomingWindow: upcoming ? upcoming.window.start : null,
    pastWindows: past.length,
    confirmedProgram: doc.confirmedProgram.length,
  };
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  try { main(); } catch (err) { console.error(err.stack || err.message); process.exit(1); }
}

module.exports = { main, scrubText, safeUrl, buildConfirmedProgram };
