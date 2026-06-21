#!/usr/bin/env node
/* Kids Activities daily discovery: Google-style weekend searches, classification, and review artifacts. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const cheerio = require('cheerio');

const ROOT = path.resolve(__dirname, '..');
const OUT_ROOT = path.join(ROOT, 'automation', 'out');
const STATE_DIR = path.join(ROOT, 'automation', 'state');
const DEFAULT_STATE_FILE = path.join(STATE_DIR, 'daily-discovery-state.json');
const CONFIG_FILE = path.join(ROOT, 'automation', 'daily_discovery.config.json');
const TZ = 'Europe/Zurich';

const DEFAULT_CONFIG = {
  schemaVersion: 1,
  search: { provider: 'duckduckgo-html', maxResultsPerQuery: 8, timeoutMs: 15000, minDelayMs: 1200 },
  locations: [
    'Yverdon-les-Bains', 'Yverdon et région', 'Grandson', 'Neuchâtel', 'Lausanne', 'Orbe',
    'Payerne', 'Estavayer', 'Morges', 'Vevey', 'Montreux', 'Vaud', 'Arc jurassien', 'Romandie'
  ],
  intents: ['événement famille enfants', 'agenda enfants', 'atelier enfants', 'spectacle famille', 'festival famille', 'sortie enfants'],
  officialDomainHints: ['.ch', 'admin.ch', 'vd.ch', 'ne.ch', 'lausanne.ch', 'yverdon', 'grandson', 'orbe', 'payerne', 'estavayer', 'morges', 'montreux', 'vevey', 'tourisme', 'theatre', 'théâtre', 'musee', 'musée', 'festival'],
  noisyDomains: ['allevents.in', 'eventbrite.', 'facebook.com', 'instagram.com', 'pinterest.', 'tripadvisor.', 'timeout.', 'meinestadt.', 'sortir.', 'que-faire.', 'localcities.', 'agendaculturel.'],
  eventTerms: ['festival', 'atelier', 'spectacle', 'concert', 'fête', 'animation', 'enfants', 'famille', 'jeune public', 'sortie', 'musée', 'nature', 'chasse au trésor'],
  sourceTerms: ['agenda', 'programme', 'événements', 'manifestations', 'calendrier', 'sortir', 'loisirs']
};

function clean(s = '') { return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function slug(s = '') { return clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80); }
function sha(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12); }
function mkdirp(dir) { fs.mkdirSync(dir, { recursive: true }); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { mkdirp(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function loadConfig() {
  return fs.existsSync(CONFIG_FILE) ? { ...DEFAULT_CONFIG, ...readJson(CONFIG_FILE, {}) } : DEFAULT_CONFIG;
}

function dateInZurichParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const localNoon = new Date(`${map.year}-${map.month}-${map.day}T12:00:00Z`);
  return { iso: `${map.year}-${map.month}-${map.day}`, weekday: map.weekday, utcNoon: localNoon };
}
function addDaysIso(iso, days) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function isoWeekday(iso) { return new Date(`${iso}T12:00:00Z`).getUTCDay(); }
function nextWeekendDates(now = new Date(), includeFriday = true) {
  const todayIso = dateInZurichParts(now).iso;
  const dow = isoWeekday(todayIso); // Sunday=0, Saturday=6 for UTC noon of local date
  const daysUntilSat = dow === 6 ? 0 : (6 - dow + 7) % 7;
  const saturday = addDaysIso(todayIso, daysUntilSat);
  const sunday = addDaysIso(saturday, 1);
  const dates = [];
  if (includeFriday) dates.push({ kind: 'friday_evening', iso: addDaysIso(saturday, -1), label: 'vendredi soir' });
  dates.push({ kind: 'saturday', iso: saturday, label: 'samedi' }, { kind: 'sunday', iso: sunday, label: 'dimanche' });
  return { generatedFrom: todayIso, timezone: TZ, saturday, sunday, dates };
}
const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function frDate(iso) { const [y,m,d] = iso.split('-').map(Number); return `${d} ${MONTHS_FR[m-1]} ${y}`; }
function numericDate(iso) { const [y,m,d] = iso.split('-'); return `${d}.${m}.${y}`; }

function generateQueries(config, weekend) {
  const dateForms = weekend.dates.flatMap(d => [frDate(d.iso), numericDate(d.iso)]);
  const queries = [];
  for (const location of config.locations) {
    for (const intent of config.intents) {
      for (const dateText of dateForms) queries.push(`${intent} ${location} ${dateText}`);
    }
  }
  // Keep daily runs bounded: interleave broad coverage before deep repetition.
  return [...new Set(queries)].map((q, i) => ({ id: `q${String(i + 1).padStart(3, '0')}`, query: q }));
}

function canonicalUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|pk_)/i.test(key)) u.searchParams.delete(key);
    if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch { return clean(url); }
}
function resultKey(r) { try { const u = new URL(canonicalUrl(r.url)); return `${u.hostname.replace(/^www\./, '')}${u.pathname}`.toLowerCase(); } catch { return canonicalUrl(r.url).toLowerCase(); } }
function dedupeResults(results) {
  const byKey = new Map();
  for (const r of results) {
    const key = resultKey(r);
    const existing = byKey.get(key);
    const merged = existing ? { ...existing, queries: [...new Set([...(existing.queries || []), ...(r.queries || [])])], snippets: [...new Set([...(existing.snippets || []), r.snippet].filter(Boolean))] } : { ...r, canonicalUrl: canonicalUrl(r.url), queries: r.queries || [], snippets: [r.snippet].filter(Boolean) };
    byKey.set(key, merged);
  }
  return [...byKey.values()];
}

async function searchDuckDuckGo(query, config) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.search.timeoutMs || 15000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 (OpenClaw Kids Activities discovery)' } });
    if (!res.ok) throw new Error(`duckduckgo HTTP ${res.status}`);
    const html = await res.text();
    return parseDuckDuckGoHtml(html).slice(0, config.search.maxResultsPerQuery || 8);
  } finally { clearTimeout(timer); }
}
function parseDuckDuckGoHtml(html) {
  const $ = cheerio.load(html);
  const results = [];
  $('.result').each((_, el) => {
    const a = $(el).find('.result__a').first();
    let href = a.attr('href') || '';
    try { const u = new URL(href, 'https://duckduckgo.com'); const uddg = u.searchParams.get('uddg'); if (uddg) href = uddg; } catch {}
    const title = clean(a.text());
    const snippet = clean($(el).find('.result__snippet').text());
    if (href && title) results.push({ title, url: href, snippet });
  });
  return results;
}
async function searchFixture(query, fixtureFile) {
  const fixture = readJson(fixtureFile, {});
  return (fixture.resultsByQuery && fixture.resultsByQuery[query]) || fixture.results || [];
}
async function collectSearchResults(queries, config, opts = {}) {
  const all = [];
  const rawQueries = [];
  for (const q of queries) {
    let results = [], error = null;
    try {
      results = opts.fixture ? await searchFixture(q.query, opts.fixture) : await searchDuckDuckGo(q.query, config);
    } catch (err) { error = err.message; }
    rawQueries.push({ ...q, resultCount: results.length, error });
    for (const r of results) all.push({ ...r, queryId: q.id, queries: [q.query] });
    if (!opts.fixture) await sleep(config.search.minDelayMs || 1000);
  }
  return { rawQueries, rawResults: all };
}

function domainOf(url) { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } }
function includesAny(text, terms) { const t = text.toLowerCase(); return terms.some(term => t.includes(term.toLowerCase())); }
function classifyResult(result, config, existingState = {}) {
  const text = `${result.title} ${result.snippet || ''} ${result.url}`.toLowerCase();
  const domain = domainOf(result.canonicalUrl || result.url);
  const reasons = [];
  let score = 0;
  const noisy = config.noisyDomains.some(d => domain.includes(d));
  const official = config.officialDomainHints.some(h => domain.includes(h.toLowerCase()) || text.includes(h.toLowerCase()));
  const hasEvent = includesAny(text, config.eventTerms);
  const hasSource = includesAny(text, config.sourceTerms);
  const hasFamily = /enfant|famille|jeune public|kids|atelier|spectacle|loisir/.test(text);
  const hasWeekendDate = /\b(\d{1,2}[.\/-]\d{1,2}|samedi|dimanche|week-end|weekend|juin|juillet|août|septembre)\b/i.test(text);
  if (official) { score += 30; reasons.push('official_or_local_domain_hint'); }
  if (hasFamily) { score += 25; reasons.push('family_relevance_terms'); }
  if (hasEvent) { score += 20; reasons.push('event_intent_terms'); }
  if (hasSource) { score += 15; reasons.push('agenda_or_programme_terms'); }
  if (hasWeekendDate) { score += 10; reasons.push('date_or_weekend_terms'); }
  if (noisy) { score -= 45; reasons.push('known_noisy_aggregator'); }
  if (/facebook|instagram/.test(domain)) { score -= 20; reasons.push('social_page_hard_to_scrape'); }

  let classification = 'ignored_noise';
  if (!noisy && official && hasSource && score >= 45) classification = 'source_candidate';
  else if (!noisy && hasEvent && hasFamily && score >= 40) classification = 'event_candidate';
  else if (!noisy && score >= 35) classification = 'needs_human_triage';
  const fingerprint = sha(`${resultKey(result)}|${slug(result.title)}|${hasWeekendDate ? 'dated' : 'undated'}`);
  const seen = existingState.seen && existingState.seen[fingerprint];
  const suppressAlert = Boolean(seen && seen.contentSignature === sha(`${result.title}|${result.snippet || ''}`));
  return { ...result, domain, fingerprint, classification, confidence: Math.max(0, Math.min(100, score)), reasons, suppressAlert };
}
function candidateSummary(classified) {
  const sendable = classified.filter(r => !r.suppressAlert && ['source_candidate','event_candidate','needs_human_triage'].includes(r.classification));
  return {
    sourceCandidates: sendable.filter(r => r.classification === 'source_candidate'),
    eventCandidates: sendable.filter(r => r.classification === 'event_candidate'),
    triageCandidates: sendable.filter(r => r.classification === 'needs_human_triage'),
    ignored: classified.filter(r => r.classification === 'ignored_noise' || r.suppressAlert)
  };
}
function updateState(state, classified, run) {
  const next = { schemaVersion: 1, updatedAt: run.generatedAt, seen: { ...(state.seen || {}) } };
  for (const r of classified.filter(x => ['source_candidate','event_candidate','needs_human_triage'].includes(x.classification))) {
    next.seen[r.fingerprint] = { firstSeenAt: (next.seen[r.fingerprint] && next.seen[r.fingerprint].firstSeenAt) || run.generatedAt, lastSeenAt: run.generatedAt, url: r.canonicalUrl, title: r.title, classification: r.classification, contentSignature: sha(`${r.title}|${r.snippet || ''}`) };
  }
  return next;
}
function renderReviewMarkdown(run, summary) {
  const lines = [`# Daily discovery review — ${run.generatedAt}`, '', `- Weekend: ${run.weekend.saturday} / ${run.weekend.sunday} (${run.weekend.timezone})`, `- Queries: ${run.queries.length}`, `- Raw results: ${run.rawResults.length}`, `- Deduped results: ${run.classified.length}`, '', '## Review candidates', ''];
  for (const [heading, rows] of [['Official source pages worth reviewing', summary.sourceCandidates], ['One-off events worth reviewing/importing', summary.eventCandidates], ['Needs human triage', summary.triageCandidates]]) {
    lines.push(`### ${heading}`, '');
    if (!rows.length) lines.push('- None.', '');
    for (const r of rows) lines.push(`- **${r.title}** (${r.confidence}/100, ${r.classification}) — ${r.canonicalUrl}\n  - Reasons: ${r.reasons.join(', ')}\n  - Snippet: ${clean(r.snippet || r.snippets?.[0] || '').slice(0, 260)}`);
    lines.push('');
  }
  lines.push('## Safety note', '', 'These are discovery candidates only. They are not published and must be reviewed through the existing Kids Activities event/source workflow before being recommended.');
  return lines.join('\n').trim() + '\n';
}

async function runDiscovery(opts = {}) {
  const config = loadConfig();
  const weekend = nextWeekendDates(opts.now ? new Date(opts.now) : new Date(), true);
  const allQueries = generateQueries(config, weekend);
  const queryLimit = opts.queryLimit ? Number(opts.queryLimit) : Number(process.env.DISCOVERY_QUERY_LIMIT || 42);
  const queries = allQueries.slice(0, queryLimit);
  const generatedAt = new Date().toISOString();
  const runId = `discovery-${generatedAt.replace(/[:.]/g, '-')}`;
  const outDir = path.join(OUT_ROOT, runId);
  const stateFile = opts.stateFile || DEFAULT_STATE_FILE;
  const state = readJson(stateFile, { schemaVersion: 1, seen: {} });
  const { rawQueries, rawResults } = await collectSearchResults(queries, config, opts);
  const deduped = dedupeResults(rawResults);
  const classified = deduped.map(r => classifyResult(r, config, state)).sort((a, b) => b.confidence - a.confidence || a.title.localeCompare(b.title));
  const run = { schemaVersion: 1, generatedAt, runId, weekend, config: { locations: config.locations, intents: config.intents, provider: opts.fixture ? 'fixture' : config.search.provider }, queries: rawQueries, rawResults, classified };
  const summary = candidateSummary(classified);
  mkdirp(outDir);
  writeJson(path.join(outDir, 'queries.json'), rawQueries);
  writeJson(path.join(outDir, 'raw-results.json'), rawResults);
  writeJson(path.join(outDir, 'classified-results.json'), classified);
  writeJson(path.join(outDir, 'review-candidates.json'), { generatedAt, weekend, counts: { sources: summary.sourceCandidates.length, events: summary.eventCandidates.length, triage: summary.triageCandidates.length, ignored: summary.ignored.length }, ...summary });
  fs.writeFileSync(path.join(outDir, 'REVIEW.md'), renderReviewMarkdown(run, summary));
  writeJson(path.join(outDir, 'run.json'), { ...run, rawResults: undefined, classified: undefined, outDir });
  writeJson(path.join(OUT_ROOT, 'discovery-latest.json'), { generatedAt, runId, outDir, weekend, counts: { sources: summary.sourceCandidates.length, events: summary.eventCandidates.length, triage: summary.triageCandidates.length, ignored: summary.ignored.length } });
  writeJson(stateFile, updateState(state, classified, { generatedAt }));
  return { outDir, counts: { queries: queries.length, raw: rawResults.length, deduped: classified.length, sources: summary.sourceCandidates.length, events: summary.eventCandidates.length, triage: summary.triageCandidates.length, ignored: summary.ignored.length } };
}

function runFixtureTests() {
  const weekend = nextWeekendDates(new Date('2026-06-21T22:26:00Z'));
  assert.strictEqual(weekend.saturday, '2026-06-27');
  assert.strictEqual(weekend.sunday, '2026-06-28');
  assert(weekend.dates.some(d => d.kind === 'friday_evening' && d.iso === '2026-06-26'));
  const config = DEFAULT_CONFIG;
  const queries = generateQueries(config, weekend);
  assert(queries.some(q => q.query.includes('Yverdon') && q.query.includes('27 juin 2026')));
  assert(queries.some(q => q.query.includes('Grandson') && q.query.includes('28.06.2026')));
  assert(queries.some(q => q.query.includes('Romandie') && /atelier|spectacle|festival/.test(q.query)));
  const duped = dedupeResults([
    { title: 'Agenda famille', url: 'https://example.ch/a?utm_source=x#frag', snippet: 'atelier enfants', queries: ['a'] },
    { title: 'Agenda famille', url: 'https://example.ch/a', snippet: 'atelier enfants', queries: ['b'] }
  ]);
  assert.strictEqual(duped.length, 1);
  assert.deepStrictEqual(duped[0].queries.sort(), ['a','b']);
  const official = classifyResult({ title: 'Agenda manifestations enfants Yverdon', url: 'https://yverdonlesbainsregion.ch/agenda/', snippet: 'Programme famille et ateliers enfants samedi 27 juin' }, config, {});
  assert.strictEqual(official.classification, 'source_candidate');
  const event = classifyResult({ title: 'Festival famille au château', url: 'https://chateau-example.ch/event/festival-famille', snippet: 'Spectacle enfants dimanche 28 juin 2026' }, config, {});
  assert.strictEqual(event.classification, 'event_candidate');
  const noisy = classifyResult({ title: 'Events in Lausanne', url: 'https://allevents.in/lausanne/kids', snippet: 'kids events' }, config, {});
  assert.strictEqual(noisy.classification, 'ignored_noise');
  console.log('[TEST] daily_discovery fixture tests passed');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--fixture-test')) return runFixtureTests();
  const fixtureArg = args.find(a => a.startsWith('--fixture='));
  const nowArg = args.find(a => a.startsWith('--now='));
  const limitArg = args.find(a => a.startsWith('--query-limit='));
  const stateArg = args.find(a => a.startsWith('--state-file='));
  const result = await runDiscovery({ fixture: fixtureArg && path.resolve(fixtureArg.split('=')[1]), now: nowArg && nowArg.split('=')[1], queryLimit: limitArg && limitArg.split('=')[1], stateFile: stateArg && path.resolve(stateArg.split('=')[1]) });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main().catch(err => { console.error(err.stack || err.message); process.exit(1); });
module.exports = { nextWeekendDates, generateQueries, parseDuckDuckGoHtml, dedupeResults, classifyResult, candidateSummary, runDiscovery, DEFAULT_CONFIG };
