#!/usr/bin/env node
/* Kids Activities v0.2 - source-specific scrapers + quality/scoring artifacts */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const cheerio = require('cheerio');

const TZ = 'Europe/Zurich';
const SOURCES = {
  grandson: {
    url: 'https://www.grandson.ch/vie-locale/agenda-des-manifestations/',
    kind: 'communal-agenda'
  },
  yverdon: {
    url: 'https://yverdonlesbainsregion.ch/agenda/',
    kind: 'tourism-agenda'
  }
};

function clean(s = '') { return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function stripLead(s = '') { return clean(s).replace(/^>\s*/, ''); }
function sha(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12); }
function canonicalUrl(href, base) { try { return new URL(href, base).toString().replace(/#.*$/, ''); } catch { return ''; } }
function uniqBy(arr, keyFn) { const seen = new Set(); return arr.filter(x => { const k = keyFn(x); if (seen.has(k)) return false; seen.add(k); return true; }); }

async function fetchHtml(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)' } });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const MONTHS = {
  janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', août: '08', aout: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12', decembre: '12'
};

function parseFrenchDate(text, fallbackYear = new Date().getFullYear()) {
  const t = clean(text).toLowerCase();
  const m = t.match(/(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s*(\d{4})?/i);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = MONTHS[m[2]];
  const year = m[3] || String(fallbackYear);
  return `${year}-${month}-${day}`;
}

function parseNumericDate(text, fallbackYear = new Date().getFullYear()) {
  const m = clean(text).match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  if (!m) return null;
  let y = m[3] || String(fallbackYear); if (y.length === 2) y = `20${y}`;
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parseTime(text) {
  const m = clean(text).match(/(?:^|\D)(\d{1,2})\s*h(?:\s*(\d{2}))?/i);
  if (!m) return null;
  const hour = Number(m[1]);
  if (hour > 23) return null;
  return `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}:00+02:00`;
}

function isoDate(date, timeText = '') {
  if (!date) return null;
  const time = parseTime(timeText);
  return time ? `${date}T${time}` : date;
}

function nextWeekendWindow(now = new Date()) {
  // Use local-ish UTC math; sufficient for date filtering artifacts. Current cron provides UTC, output labels Zurich.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const daysToSat = (6 - day + 7) % 7 || 7;
  const sat = new Date(d); sat.setUTCDate(d.getUTCDate() + daysToSat);
  const mon = new Date(sat); mon.setUTCDate(sat.getUTCDate() + 2);
  return { start: sat.toISOString().slice(0,10), endExclusive: mon.toISOString().slice(0,10) };
}

function eventId(e) { return `${e.source}-${sha(`${e.url}|${e.startDate || ''}|${e.title}`)}`; }
function titleKey(title = '') {
  return clean(title).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\b(2026|grandson|morat|du|de|des|la|le|les|a|au|aux|et|en)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function recommendationKey(e) {
  const t = titleKey(e.title);
  const date = (e.startDate || '').slice(0,10);
  const city = (e.city || '').toLowerCase();
  if (/charles/.test(t) && /opera/.test(t)) return `opera-charles|${city}`;
  return `${t.split(' ').slice(0, 6).join(' ')}|${date}|${city}`;
}

function inferTags(text) {
  const t = clean(text).toLowerCase();
  const tags = new Set();
  const addIf = (tag, re) => { if (re.test(t)) tags.add(tag); };
  addIf('nature', /nature|biodivers|for[êe]t|prairie|haie|verger|jardin|lac|sentier|coteau|plein air/);
  addIf('animals', /insect|hirondelle|nichoir|animaux|faune|oiseaux|cheval|poney/);
  addIf('outdoor', /plein air|balade|visite|sentier|lac|parcours|coteau|jardin|sport|bouge/);
  addIf('culture', /mus[ée]e|th[ée][âa]tre|conte|lecture|bibli|expo|op[ée]ra|spectacle|historique|artisan|march[ée]/);
  addIf('science', /science|robot|tech|atelier|d[ée]couverte|exp[ée]rience/);
  addIf('food', /food|go[ûu]ter|cuisine|march[ée]|terroir|caf[ée]|th[ée]|salon de th[ée]/);
  addIf('cosy', /cosy|caf[ée]|th[ée]|salon de th[ée]|doux|artisan|d[ée]coration/);
  addIf('sport', /sport|bouge|course|grimpe|escalade|tennis|gym|danse/);
  addIf('indoor', /bibli|th[ée][âa]tre|expo|salle|mus[ée]e|op[ée]ra|salon de th[ée]/);
  addIf('discovery', /d[ée]couverte|visite|exploration|parcours|atelier/);
  return [...tags];
}

function parseAge(ageText, text = '') {
  const s = clean(`${ageText} ${text}`).toLowerCase();
  if (/tout public|famille|enfants?|dès la naissance|n[ée] pour lire/.test(s)) return { ageMin: null, ageMax: null, ageText: ageText || 'tout public / famille' };
  const range = s.match(/(\d{1,2})\s*(?:-|à|a)\s*(\d{1,2})\s*ans/);
  if (range) return { ageMin: +range[1], ageMax: +range[2], ageText: ageText || range[0] };
  const min = s.match(/d[èe]s\s*(\d{1,2})\s*ans|à partir de\s*(\d{1,2})\s*ans/);
  if (min) return { ageMin: +(min[1] || min[2]), ageMax: null, ageText: ageText || min[0] };
  return { ageMin: null, ageMax: null, ageText: ageText || '' };
}

function cityFromLocation(text, fallback = '') {
  const t = clean(text);
  for (const c of ['Yverdon-les-Bains', 'Yverdon', 'Grandson', 'Concise', 'Lausanne', 'Sainte-Croix', 'Yvonand', 'Orbe']) {
    if (new RegExp(c, 'i').test(t)) return c === 'Yverdon' ? 'Yverdon-les-Bains' : c;
  }
  return fallback;
}

function normalizeEvent(partial) {
  const description = clean(partial.description || partial.rawSnippet || '').slice(0, 700);
  const age = parseAge(partial.ageText || '', `${partial.title} ${description}`);
  const tags = partial.tags?.length ? partial.tags : inferTags(`${partial.title} ${description} ${partial.locationText || ''}`);
  const event = {
    id: '', source: partial.source, title: clean(partial.title), startDate: partial.startDate || null, endDate: partial.endDate || null,
    locationName: clean(partial.locationName || partial.locationText || ''), locationText: clean(partial.locationText || partial.locationName || ''),
    city: partial.city || cityFromLocation(`${partial.locationName || ''} ${partial.locationText || ''}`, partial.source === 'grandson' ? 'Grandson' : ''),
    url: partial.url, description, ageMin: age.ageMin, ageMax: age.ageMax, ageText: age.ageText,
    priceText: clean(partial.priceText || ''), tags,
    evidence: clean(partial.evidence || partial.rawSnippet || `${partial.title} ${description}`).slice(0, 1200)
  };
  event.id = eventId(event);
  return event;
}

function bestDetailText($, title = '') {
  const candidates = $('main,#main,.site-main,.entry-content,.post-content,.content,.content-area,body')
    .map((_, el) => clean($(el).text())).get()
    .filter(t => t.length > 80);
  const relevant = candidates
    .filter(t => /Organisation|Lieu|Horaires|Prix/i.test(t) && (!title || t.toLowerCase().includes(title.toLowerCase().slice(0, 20))))
    .sort((a,b) => a.length - b.length);
  return relevant[0] || candidates.sort((a,b) => a.length - b.length)[0] || '';
}

function extractAfter(label, text, stopLabels) {
  const re = new RegExp(`(?:^|\\s)${label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?:\\s|$)`, 'i');
  const m = re.exec(text);
  if (!m) return '';
  let tail = text.slice(m.index + m[0].length).trim();
  let stop = tail.length;
  for (const s of stopLabels) {
    const sm = new RegExp(`(?:^|\\s)${s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?:\\s|$)`, 'i').exec(tail);
    if (sm && sm.index > 0 && sm.index < stop) stop = sm.index;
  }
  return clean(tail.slice(0, stop));
}

async function scrapeGrandson() {
  const source = 'grandson';
  const html = await fetchHtml(SOURCES.grandson.url);
  const $ = cheerio.load(html);
  const links = uniqBy($('a[href*="/agenda/"]').map((_, a) => ({
    title: stripLead($(a).text()), url: canonicalUrl($(a).attr('href'), SOURCES.grandson.url)
  })).get().filter(x => x.title.length > 5 && !/agenda des manifestations|ajouter mon/i.test(x.title)), x => x.url).slice(0, 80);

  const events = [];
  for (const link of links) {
    try {
      const detail = await fetchHtml(link.url);
      const $$ = cheerio.load(detail);
      const title = stripLead(link.title.replace(/^>\s*/, '')) || clean($$('title').text()).replace(/\s+–\s+Grandson.*/, '');
      const mainText = bestDetailText($$, title);
      const date = parseFrenchDate(mainText, 2026) || parseNumericDate(mainText, 2026);
      const horaires = extractAfter('Horaires', mainText, ['Prix', 'Contact', 'Organisation', 'Retour']);
      const location = extractAfter('Lieu', mainText, ['Horaires', 'Durée', 'Prix', 'Contact', 'Organisation', 'Retour']);
      const price = extractAfter('Prix', mainText, ['Contact', 'Organisation', 'Retour']);
      const orgIdx = mainText.indexOf('Organisation');
      const lieuIdx = mainText.indexOf('Lieu');
      const desc = orgIdx > 0 ? mainText.slice(0, orgIdx) : (lieuIdx > 0 ? mainText.slice(0, lieuIdx) : mainText);
      events.push(normalizeEvent({
        source, title, startDate: isoDate(date, horaires), locationName: location.split(/\s+Rue\s+|\s+Route\s+/)[0],
        locationText: location || 'Grandson', city: cityFromLocation(location, 'Grandson'), url: link.url,
        description: desc.replace(title, '').replace(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+\w+\s+\d{4}/i, ''),
        priceText: price, rawSnippet: mainText
      }));
    } catch (e) {
      events.push({ source, title: link.title, url: link.url, error: e.message });
    }
  }
  return events.filter(e => !e.error);
}

function parseYverdonListing(parentText, anchorText, url) {
  const evidence = clean(parentText || anchorText);
  const date = parseFrenchDate(evidence, 2026);
  const city = cityFromLocation(evidence, 'Yverdon-les-Bains');
  let title = clean(anchorText);
  if (!title || title.length < 4) {
    title = evidence
      .replace(/^\d{1,2}\s+\w+\s+(?:\d{1,2}\s+\w+\s+)?/i, '')
      .replace(new RegExp(`${city}$`, 'i'), '')
      .trim();
  }
  return normalizeEvent({
    source: 'yverdon', title, startDate: isoDate(date, evidence), locationText: city, city, url,
    description: evidence, evidence
  });
}

async function scrapeYverdon() {
  const source = 'yverdon';
  const html = await fetchHtml(SOURCES.yverdon.url, 20000);
  const $ = cheerio.load(html);
  const links = uniqBy($('a[href*="/evenement/"]').map((_, a) => {
    const anchorText = stripLead($(a).text());
    const parentText = clean($(a).closest('.jet-listing-grid__item,.elementor-widget,.e-con,article,div').text());
    return { anchorText, parentText, url: canonicalUrl($(a).attr('href'), SOURCES.yverdon.url) };
  }).get().filter(x => x.url && (x.anchorText || x.parentText) && !/^fr$|^de$|^español$/i.test(x.anchorText)), x => `${x.url}|${x.parentText}`).slice(0, 80);

  const events = [];
  for (const link of links) {
    try {
      events.push(parseYverdonListing(link.parentText, link.anchorText, link.url));
    } catch (e) {
      events.push({ source, title: link.anchorText || link.parentText, url: link.url, error: e.message });
    }
  }
  return events.filter(e => !e.error);
}

function rejectionReason(e, window) {
  if (!e.url) return 'missing_url';
  if (!e.title || /contact|horaires d'ouverture|agenda des manifestations|accueil/i.test(e.title)) return 'navigation_or_empty_title';
  if (!e.startDate) return 'missing_date';
  const date = e.startDate.slice(0,10);
  if (date < window.start || date >= window.endExclusive) return `outside_window_${window.start}_${window.endExclusive}`;
  if (!e.locationText && !e.city) return 'missing_location';
  if (/caves? ouvertes?|vin|vigneron|d[ée]gustation/i.test(`${e.title} ${e.description}`)) return 'adult_or_alcohol_focused';
  const ageBad = (min, max) => (min && min > 6) || (max && max < 4);
  if (ageBad(e.ageMin, e.ageMax)) return 'age_mismatch';
  return null;
}

function scoreEvent(e, window) {
  const andy = ageScore(e, 6), lennon = ageScore(e, 4);
  const dateScore = !rejectionReason({...e, locationText: e.locationText || e.city}, window) ? 20 : (e.startDate ? 8 : 0);
  const locationScore = /yverdon|grandson/i.test(`${e.city} ${e.locationText}`) ? 18 : 10;
  const interestTags = new Set(['nature','animals','outdoor','discovery','science','culture','sport','food','cosy','indoor']);
  const interest = Math.min(24, e.tags.filter(t => interestTags.has(t)).length * 6 + (/bibli|lecture|conte/i.test(e.title + e.description) ? 6 : 0));
  const confidence = (e.url ? 5 : 0) + (e.startDate ? 5 : 0) + (e.locationText || e.city ? 5 : 0) + (e.description ? 5 : 0);
  const total = Math.min(100, andy + lennon + dateScore + locationScore + interest + confidence);
  return { total, components: { ageFitAndy: andy, ageFitLennon: lennon, dateWeekendFit: dateScore, locationTravelBurden: locationScore, interestFit: interest, practicalConfidence: confidence }, label: total >= 70 ? 'recommandé' : 'option secondaire' };
}
function ageScore(e, age) {
  if (e.ageMin == null && e.ageMax == null) return 8;
  if (e.ageMin != null && age < e.ageMin) return 0;
  if (e.ageMax != null && age > e.ageMax) return 0;
  return 10;
}

function inspectQuality(events, accepted, rejected, sourceLogs) {
  const withDate = accepted.filter(e => e.startDate).length;
  const withLoc = accepted.filter(e => e.locationText || e.city).length;
  const withUrl = accepted.filter(e => e.url).length;
  const dupes = events.length - uniqBy(events, recommendationKey).length;
  return {
    sourceLogs,
    counts: { raw: events.length, accepted: accepted.length, rejected: rejected.length, duplicates: dupes },
    acceptedQuality: {
      withDatePct: accepted.length ? Math.round(withDate / accepted.length * 100) : 0,
      withLocationPct: accepted.length ? Math.round(withLoc / accepted.length * 100) : 0,
      withUrlPct: accepted.length ? Math.round(withUrl / accepted.length * 100) : 0
    },
    topRejected: rejected.slice(0, 15).map(r => ({ title: r.event.title, source: r.event.source, reason: r.reason, url: r.event.url })),
    sampleAccepted: accepted.slice(0, 5).map(e => ({ title: e.title, startDate: e.startDate, location: e.locationText || e.city, evidence: e.evidence }))
  };
}

function fitReason(e) {
  if (e.tags.includes('nature') || e.tags.includes('animals')) return 'nature/exploration, très bon fit Lennon et sortie facile pour Andy';
  if (/bibli|lecture|conte/i.test(e.title + e.description)) return 'lecture/conte, bon fit intellectuel pour Andy et format doux pour Lennon';
  if (e.tags.includes('culture')) return 'culture locale proche, sortie simple en famille';
  if (e.tags.includes('sport')) return 'activité dynamique/sportive, bon fit Johan et enfants';
  return 'proche et sourcé, option familiale raisonnable';
}
function caveat(e) {
  if (!e.priceText) return 'prix à vérifier';
  if (!e.ageText) return 'âge non précisé';
  if (/inscription/i.test(e.evidence)) return 'inscription à vérifier';
  return e.priceText || 'détails pratiques à vérifier';
}
function frDate(iso) {
  if (!iso) return 'date à vérifier';
  const [y,m,d] = iso.slice(0,10).split('-');
  const time = iso.includes('T') ? ` à ${iso.slice(11,16).replace(':','h')}` : '';
  return `${d}.${m}.${y}${time}`;
}
function telegramSummary(scored, window) {
  const top = scored.filter(x => x.score.total >= 60).slice(0, 7);
  if (!top.length) return `Activités famille — week-end ${window.start} → ${window.endExclusive}\n\nAucune recommandation fiable: les sources ont été collectées, mais rien ne passe les filtres date/lieu/qualité.`;
  return [`Activités famille — idées sourcées pour ce week-end`, `Fenêtre: ${window.start} → ${window.endExclusive}`, ''].concat(top.map(({event:e, score}, i) =>
    `${i+1}. ${e.title}\n` +
    `📅 ${frDate(e.startDate)}\n` +
    `📍 ${e.locationText || e.city}\n` +
    `Pourquoi: ${fitReason(e)} (${score.total}/100, ${score.label})\n` +
    `À vérifier: ${caveat(e)}\n` +
    `${e.url}`
  )).join('\n\n');
}

async function collectAll() {
  const sourceLogs = [];
  const out = [];
  for (const [source, fn] of Object.entries({ grandson: scrapeGrandson, yverdon: scrapeYverdon })) {
    const started = new Date().toISOString();
    try {
      const items = await fn();
      out.push(...items);
      sourceLogs.push({ source, status: 'ok', fetchedAt: started, count: items.length });
      console.log(`[OK] ${source}: ${items.length} events`);
    } catch (e) {
      sourceLogs.push({ source, status: 'error', fetchedAt: started, error: e.message });
      console.log(`[ERR] ${source}: ${e.message}`);
    }
  }
  return { events: uniqBy(out, e => e.id || `${e.url}|${e.title}`), sourceLogs };
}

function runFixtureTests() {
  const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-corpus/events-fixtures.json'), 'utf8')).fixtures;
  const window = { start: '2026-05-23', endExclusive: '2026-05-25' };
  for (const f of fixtures) {
    const e = normalizeEvent(f.input);
    const reason = rejectionReason(e, window);
    const scored = scoreEvent(e, window);
    if (f.expected.recommendable) assert(!reason && scored.total >= 60, `${f.name} should be recommendable: ${reason} ${scored.total}`);
    else assert(reason || scored.total < 60, `${f.name} should be rejected/low score`);
    if (f.expected.primary_tags) for (const tag of f.expected.primary_tags) assert(e.tags.includes(tag), `${f.name} missing tag ${tag}; got ${e.tags}`);
  }
  assert.strictEqual(parseFrenchDate('SAMEDI 23 mai 2026'), '2026-05-23');
  assert.strictEqual(parseFrenchDate('MARDI 05 MAI 2026'), '2026-05-05');
  console.log(`[TEST] fixture/date tests passed (${fixtures.length} fixtures)`);
}

async function main() {
  if (process.argv.includes('--fixture-test')) { runFixtureTests(); return; }
  const windowArg = process.argv.find(a => a.startsWith('--window='));
  const window = windowArg ? (() => { const [start, endExclusive] = windowArg.split('=')[1].split(':'); return { start, endExclusive }; })() : nextWeekendWindow(new Date());
  const { events, sourceLogs } = await collectAll();
  const normalized = events.filter(e => e && e.id);
  const recommendationPool = uniqBy(normalized, recommendationKey);
  const rejected = [];
  const accepted = [];
  for (const e of recommendationPool) {
    const reason = rejectionReason(e, window);
    if (reason) rejected.push({ reason, event: e }); else accepted.push(e);
  }
  const scored = accepted.map(event => ({ event, score: scoreEvent(event, window) })).sort((a,b) => b.score.total - a.score.total);
  const quality = inspectQuality(normalized, accepted, rejected, sourceLogs);
  const summary = telegramSummary(scored, window);

  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(process.cwd(), 'automation', 'out', `v02-${now}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'fetch-log.json'), JSON.stringify(sourceLogs, null, 2));
  fs.writeFileSync(path.join(outDir, 'normalized-events.json'), JSON.stringify({ generatedAt: new Date().toISOString(), window, count: normalized.length, events: normalized }, null, 2));
  fs.writeFileSync(path.join(outDir, 'quality-inspection.json'), JSON.stringify(quality, null, 2));
  fs.writeFileSync(path.join(outDir, 'scored-events.json'), JSON.stringify({ window, count: scored.length, scored }, null, 2));
  fs.writeFileSync(path.join(outDir, 'telegram-summary.txt'), summary + '\n');
  fs.writeFileSync(path.join(outDir, 'errors.log'), sourceLogs.filter(s => s.status === 'error').map(s => `${s.source}: ${s.error}`).join('\n'));

  console.log(`Saved artifacts: ${outDir}`);
  console.log(`Raw=${quality.counts.raw} Accepted=${quality.counts.accepted} Rejected=${quality.counts.rejected} Duplicates=${quality.counts.duplicates}`);
  console.log(`Quality: dates=${quality.acceptedQuality.withDatePct}% locations=${quality.acceptedQuality.withLocationPct}% urls=${quality.acceptedQuality.withUrlPct}%`);
  console.log('\n--- Telegram summary preview ---\n' + summary);
  if (!sourceLogs.some(s => s.status === 'ok' && s.count > 0)) process.exitCode = 2;
  if (!accepted.length) process.exitCode = 3;
}

if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });

module.exports = { parseFrenchDate, normalizeEvent, rejectionReason, scoreEvent, telegramSummary, scrapeGrandson, scrapeYverdon };
