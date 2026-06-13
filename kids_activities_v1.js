#!/usr/bin/env node
/* Kids Activities v0.2 - source-specific scrapers + quality/scoring artifacts */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const cheerio = require('cheerio');

const TZ = 'Europe/Zurich';
const FAMILY = {
  andy: { name: 'Andy', age: 6, tags: ['science', 'culture', 'sport', 'water', 'food', 'indoor', 'discovery'] },
  lennon: { name: 'Lennon', age: 4, tags: ['animals', 'nature', 'outdoor', 'discovery'] },
  johan: { name: 'Johan', tags: ['sport', 'outdoor', 'mountain', 'nature', 'science', 'culture', 'food'] },
  daisy: { name: 'Daisy', tags: ['walk', 'mountain', 'cosy', 'culture', 'indoor', 'food'] }
};
const LOCATION_KM_FROM_YVERDON = {
  'yverdon-les-bains': 0,
  yverdon: 0,
  grandson: 5,
  concise: 13,
  yvonand: 10,
  orbe: 12,
  vallorbe: 23,
  'sainte-croix': 23,
  lausanne: 39,
  morat: 38,
  morges: 48,
  neuchatel: 39,
  neuchâtel: 39,
  fribourg: 55,
  geneve: 85,
  genève: 85
};
const SOURCES = {
  grandson: {
    url: 'https://www.grandson.ch/vie-locale/agenda-des-manifestations/',
    kind: 'communal-agenda'
  },
  yverdon: {
    url: 'https://yverdonlesbainsregion.ch/agenda/',
    kind: 'tourism-agenda'
  },
  infomaniakYverdon: {
    url: 'https://infomaniak.events/fr-ch/yverdon-les-bains',
    kind: 'ticketing-agenda'
  },
  agendaCh: {
    url: 'https://agenda.ch/fr/s/jsresults?where=Yverdon-les-Bains&distance=20000&search_form=true',
    kind: 'appointment-directory-probe'
  },
  laDerivee: {
    url: 'https://www.laderivee.ch/page/programme',
    apiUrl: 'https://admin.laderivee.ch/api/supermassive/event/segment/5',
    kind: 'summer-cultural-place'
  },
  orbe: {
    url: 'https://www.orbe.ch/agenda-manifestations.%20html',
    apiUrl: 'https://geocity.ch/rest/agenda',
    kind: 'geocity-communal-agenda'
  },
  vallorbe: {
    url: 'https://www.vallorbe.ch/agenda?datumVon=11.06.2026&datumBis=21.06.2027',
    kind: 'iweb-communal-agenda'
  },
  tempsLibre: {
    url: 'https://www.tempslibre.ch/romandie/evenements/ce-week-end',
    kind: 'romandie-cultural-weekend-agenda'
  },
  theatreDuPassage: {
    url: 'https://www.theatredupassage.ch/abonnements/passdecouverte/passfamille',
    listUrl: 'https://www.theatredupassage.ch/accueil/liste',
    baseUrl: 'https://www.theatredupassage.ch',
    kind: 'official-family-theatre-agenda'
  },
  manualJohan: {
    url: 'manual://johan/kids-activities',
    kind: 'local-human-curated-source',
    dataFile: 'data/manual-events.json'
  },
  prioritizedTheatreCandidates: {
    url: 'file://data/source-candidates.json',
    kind: 'local-prioritized-source-candidates'
  }
};

const TAG_FR = {
  animals: 'animaux', nature: 'nature', outdoor: 'plein air', walk: 'balade', discovery: 'découverte',
  culture: 'culture', indoor: 'intérieur', science: 'science', food: 'food/cuisine', cosy: 'cosy',
  sport: 'sport', water: 'eau', mountain: 'montagne'
};

function clean(s = '') { return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function stripLead(s = '') { return clean(s).replace(/^>\s*/, ''); }
function htmlToText(html = '') { return clean(cheerio.load(`<main>${html || ''}</main>`)('main').text()); }
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
  janvier: '01', janv: '01', février: '02', fevrier: '02', févr: '02', fevr: '02', mars: '03', avril: '04', avr: '04', mai: '05', juin: '06',
  juillet: '07', juil: '07', août: '08', aout: '08', septembre: '09', sept: '09', sep: '09', octobre: '10', oct: '10', novembre: '11', nov: '11', décembre: '12', decembre: '12', déc: '12', dec: '12'
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

function parseFrenchDate(text, fallbackYear = new Date().getFullYear()) {
  const t = clean(text).toLowerCase();
  const m = t.match(new RegExp(`(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\\s*(\\d{1,2})\\s+(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?`, 'i'));
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = MONTHS[m[2].toLowerCase()];
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

function parseInfomaniakDateRange(text, fallbackYear = new Date().getFullYear()) {
  const t = clean(text).toLowerCase();
  const range = t.match(/du\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s*(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)?\s+au\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?:\s+(\d{4}))?/i);
  if (range) {
    const year = range[5] || String(fallbackYear);
    const startMonth = MONTHS[range[2] || range[4]];
    const endMonth = MONTHS[range[4]];
    const startDate = isoDate(`${year}-${startMonth}-${range[1].padStart(2, '0')}`, text);
    const endDate = `${year}-${endMonth}-${range[3].padStart(2, '0')}`;
    return { startDate, endDate };
  }
  const single = parseFrenchDate(t, fallbackYear);
  return { startDate: isoDate(single, text), endDate: null };
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
  addIf('science', /science|robot|tech|atelier|exp[ée]rience scientifique/);
  addIf('food', /food|go[ûu]ter|cuisine|march[ée]|terroir|\bcaf[ée]\b|\bth[ée]\b|salon de th[ée]/);
  addIf('cosy', /cosy|\bcaf[ée]\b|\bth[ée]\b|salon de th[ée]|doux|artisan|d[ée]coration/);
  addIf('sport', /sport|bouge|course|grimpe|escalade|tennis|gym|danse/);
  addIf('water', /\b(eau|lac|piscine|baignade|aquatique|bateau|nautique)\b/);
  addIf('walk', /balade|marche|sentier|visite|promenade|parcours/);
  addIf('mountain', /montagne|alpage|sommet|jura|sainte-croix/);
  addIf('indoor', /bibli|th[ée][âa]tre|expo|salle|mus[ée]e|op[ée]ra|salon de th[ée]/);
  addIf('discovery', /d[ée]couverte|exploration|observation|parcours|atelier/);
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
  for (const c of ['Yverdon-les-Bains', 'Yverdon', 'Grandson', 'Concise', 'Lausanne', 'Sainte-Croix', 'Yvonand', 'Vallorbe', 'Orbe', 'Neuchâtel', 'Neuchatel']) {
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
    status: partial.status || 'confirmed',
    confidenceStatus: partial.confidenceStatus || partial.status || 'confirmed',
    sourceProvenance: partial.sourceProvenance || partial.provenance || '',
    officialSources: partial.officialSources || [],
    sourceFiles: partial.sourceFiles || [],
    manualEntryId: partial.manualEntryId || '',
    evidence: clean(partial.evidence || partial.rawSnippet || `${partial.title} ${description}`).slice(0, 1200)
  };
  event.id = eventId(event);
  return event;
}

function manualEventUrl(entry, occurrenceIndex) {
  return `manual://johan/kids-activities/${encodeURIComponent(entry.id)}#${occurrenceIndex + 1}`;
}

function loadManualJohanEvents() {
  const file = path.join(__dirname, 'data', 'manual-events.json');
  if (!fs.existsSync(file)) return { events: [], note: 'manual-events.json missing' };
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  const events = [];
  for (const entry of db.entries || []) {
    if (entry.status === 'archived') continue;
    for (const [idx, date] of (entry.dates || []).entries()) {
      events.push(normalizeEvent({
        source: 'manualJohan',
        title: entry.title,
        startDate: date.startDate,
        endDate: date.endDate || null,
        locationName: entry.venue || '',
        locationText: [entry.venue, entry.city].filter(Boolean).join(', '),
        city: entry.city || '',
        url: manualEventUrl(entry, idx),
        description: clean([
          entry.description || '',
          entry.status === 'needs_review' ? 'Source fournie par Johan — détails à confirmer avant recommandation ferme.' : '',
          entry.notes || ''
        ].filter(Boolean).join(' ')),
        ageText: entry.ageText || '',
        priceText: entry.priceText || '',
        tags: entry.tags || [],
        status: entry.status || 'candidate',
        confidenceStatus: entry.status || 'candidate',
        manualEntryId: entry.id || '',
        sourceFiles: entry.sourceFiles || [],
        officialSources: entry.officialSources || [],
        sourceProvenance: clean([entry.source || 'Johan', ...(entry.sourceFiles || []), ...(entry.officialSources || [])].filter(Boolean).join(' | ')),
        evidence: clean([
          `Source manuelle Johan (${entry.status || 'candidate'})`,
          entry.ocrEvidence || '',
          entry.sourceFiles && entry.sourceFiles.length ? `Fichiers: ${entry.sourceFiles.join(', ')}` : '',
          entry.notes || ''
        ].filter(Boolean).join(' | '))
      }));
    }
  }
  const stats = (db.entries || []).reduce((acc, e) => {
    acc.statusCounts[e.status || 'candidate'] = (acc.statusCounts[e.status || 'candidate'] || 0) + 1;
    acc.entries += 1;
    acc.occurrences += (e.dates || []).length;
    if ((e.officialSources || []).length) acc.officiallySourced += 1;
    return acc;
  }, { entries: 0, occurrences: 0, officiallySourced: 0, statusCounts: {} });
  return { events, note: `${events.length} manual occurrence(s) loaded from ${path.relative(process.cwd(), file)}`, diagnostics: stats };
}

function loadPrioritizedSourceCandidates() {
  const file = path.join(__dirname, 'data', 'source-candidates.json');
  if (!fs.existsSync(file)) return { events: [], note: 'source-candidates.json missing' };
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  const active = (db.sources || []).filter(s => s.status !== 'rejected');
  return {
    events: [],
    note: `${active.length} prioritized local/web source candidate(s) loaded from ${path.relative(process.cwd(), file)}`,
    diagnostics: {
      generatedAt: db.updatedAt || null,
      topCandidates: active.slice(0, 8).map(s => ({ id: s.id, name: s.name, status: s.status, priority: s.priority, url: s.url }))
    }
  };
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

function grandsonMonthUrls(now = new Date(), horizonMonths = 6) {
  const urls = [];
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1;
  for (let i = 0; i < horizonMonths; i++) {
    urls.push(`${SOURCES.grandson.url}?mois=${m}&annee=${y}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return urls;
}

function extractGrandsonCalendarOccurrences(html, pageUrl) {
  const $ = cheerio.load(html);
  const url = new URL(pageUrl);
  const month = String(url.searchParams.get('mois') || (new Date().getUTCMonth() + 1)).padStart(2, '0');
  const year = url.searchParams.get('annee') || String(new Date().getUTCFullYear());
  const occurrences = [];
  $('table.agenda tr').each((i, tr) => {
    if (!$(tr).hasClass('cal-texte')) return;
    const dayCells = $(tr).prev('tr').children('td').map((_, td) => clean($(td).text())).get();
    $(tr).children('td').each((cellIdx, td) => {
      const day = Number(dayCells[cellIdx]);
      if (!day || $(td).hasClass('gris')) return;
      const date = `${year}-${month}-${String(day).padStart(2, '0')}`;
      $(td).find('a[href*="/agenda/"]').each((_, a) => {
        const title = stripLead($(a).text());
        const eventUrl = canonicalUrl($(a).attr('href'), SOURCES.grandson.url);
        if (title.length > 5 && eventUrl) occurrences.push({ title, url: eventUrl, date });
      });
    });
  });
  if (occurrences.length) return uniqBy(occurrences, x => `${x.url}|${x.date}`);

  return uniqBy($('a[href*="/agenda/"]').map((_, a) => ({
    title: stripLead($(a).text()), url: canonicalUrl($(a).attr('href'), SOURCES.grandson.url), date: null
  })).get().filter(x => x.title.length > 5 && !/agenda des manifestations|ajouter mon/i.test(x.title)), x => x.url);
}

function parseGrandsonDetail(html, fallback = {}) {
  const $ = cheerio.load(html);
  const title = stripLead(fallback.title || $('meta[property="og:title"]').attr('content') || $('title').text()).replace(/\s+[–-]\s+Grandson.*/, '');
  const mainText = clean($('.container .content').first().text()) || bestDetailText($, title);
  const detailDate = parseFrenchDate(mainText, 2026) || parseNumericDate(mainText, 2026);
  const horaires = extractAfter('Horaires', mainText, ['Prix', 'Contact', 'Organisation', 'Retour']);
  const location = extractAfter('Lieu', mainText, ['Horaires', 'Durée', 'Prix', 'Contact', 'Organisation', 'Retour']);
  const price = extractAfter('Prix', mainText, ['Contact', 'Organisation', 'Retour']);
  const org = extractAfter('Organisation', mainText, ['Lieu', 'Horaires', 'Prix', 'Contact', 'Retour']);
  const orgIdx = mainText.indexOf('Organisation');
  const lieuIdx = mainText.indexOf('Lieu');
  const desc = orgIdx > 0 ? mainText.slice(0, orgIdx) : (lieuIdx > 0 ? mainText.slice(0, lieuIdx) : mainText);
  const date = fallback.date || detailDate;
  const ageText = /familles?|enfants?|dès\s+\d+\s+ans|jeux|ludique|bibli|conte/i.test(mainText) ? 'famille / enfants mentionnés' : '';
  return normalizeEvent({
    source: 'grandson', title, startDate: isoDate(date, horaires), locationName: org || location.split(/\s+Rue\s+|\s+Route\s+/)[0],
    locationText: location || 'Grandson', city: cityFromLocation(location, 'Grandson'), url: fallback.url,
    description: desc.replace(title, '').replace(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+\w+\s+\d{4}/i, ''),
    priceText: price, ageText, rawSnippet: mainText,
    evidence: clean([title, date, horaires, location, price, desc].filter(Boolean).join(' | '))
  });
}

async function scrapeGrandson() {
  const source = 'grandson';
  const occurrences = [];
  for (const url of grandsonMonthUrls(new Date(), 6)) {
    const html = await fetchHtml(url);
    occurrences.push(...extractGrandsonCalendarOccurrences(html, url));
  }
  const detailCache = new Map();
  const events = [];
  for (const occ of uniqBy(occurrences, x => `${x.url}|${x.date || ''}`)) {
    try {
      if (!detailCache.has(occ.url)) detailCache.set(occ.url, await fetchHtml(occ.url));
      events.push(parseGrandsonDetail(detailCache.get(occ.url), occ));
    } catch (e) {
      events.push({ source, title: occ.title, url: occ.url, error: e.message });
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
      .replace(new RegExp(`^\\d{1,2}\\s+(${MONTH_RE})\\.?(?:\\s+\\d{1,2}\\s+(${MONTH_RE})\\.?)?`, 'i'), '')
      .replace(new RegExp(`${city}$`, 'i'), '')
      .trim();
  }
  return normalizeEvent({
    source: 'yverdon', title, startDate: isoDate(date, evidence), locationText: city, city, url,
    description: evidence, evidence
  });
}

function extractFrenchDates(text, fallbackYear = 2026) {
  const out = [];
  const re = new RegExp(`(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\\s*\\d{1,2}\\s+(?:${MONTH_RE})\\.?(?:\\s+\\d{4})?`, 'ig');
  for (const m of clean(text).matchAll(re)) {
    const date = parseFrenchDate(m[0], fallbackYear);
    if (date) out.push(date);
  }
  return [...new Set(out)];
}

function parseYverdonDetail(html, url, fallback = {}) {
  const $ = cheerio.load(html);
  const title = clean($('h1').first().text()) || fallback.anchorText || fallback.title;
  const textBlocks = $('.elementor-widget-text-editor').map((_, el) => clean($(el).text())).get().filter(Boolean);
  const dateFields = $('.jet-listing-dynamic-field__content').map((_, el) => clean($(el).text()).replace(/^[-–]\s*/, '')).get().filter(Boolean);
  const start = parseFrenchDate(dateFields[0] || fallback.parentText || '', 2026) || parseFrenchDate(fallback.parentText || '', 2026);
  const end = parseFrenchDate(dateFields[1] || '', 2026);
  const titleIdx = textBlocks.findIndex(t => t === title);
  const detailBlocks = textBlocks.filter((t, i) => i !== titleIdx && !/^(Dates|Contactez-nous|Suivez-nous|Inscrivez-vous|Un site de l’Association)/i.test(t));
  const city = textBlocks.find(t => /^(Yverdon-les-Bains|Grandson|Sainte-Croix|Orbe|Vallorbe|Concise|Yvonand)$/i.test(t)) || cityFromLocation(`${fallback.parentText || ''} ${textBlocks.join(' ')}`, 'Yverdon-les-Bains');
  const cityIdx = textBlocks.indexOf(city);
  const org = cityIdx >= 3 ? textBlocks[cityIdx - 3] : '';
  const street = cityIdx >= 2 ? textBlocks[cityIdx - 2] : '';
  const zip = cityIdx >= 1 ? textBlocks[cityIdx - 1] : '';
  const locationText = clean([org, street, zip, city].filter(Boolean).join(', ')) || city;
  const mainDescription = detailBlocks.slice(0, 2).filter(t => t !== org && t !== street && t !== zip && t !== city).join(' — ');
  const practicalBlock = detailBlocks.find(t => /CHF|gratuit|entrée|prix|pass|réservation|inscription|horaires?|dates?\s+2026|informations? sur/i.test(t) && t !== mainDescription) || '';
  const evidence = clean([title, dateFields.join(' '), mainDescription, locationText, practicalBlock].filter(Boolean).join(' | '));
  const recurrenceDates = practicalBlock && /dates?\s+2026|samedi|dimanche|vendredi|jeudi|mercredi|mardi|lundi/i.test(practicalBlock)
    ? extractFrenchDates(practicalBlock, 2026).filter(d => d >= (start || '0000-00-00') && (!end || d <= end))
    : [];
  const dates = recurrenceDates.length >= 2 ? recurrenceDates : [start].filter(Boolean);
  const priceMatch = practicalBlock.match(/(?:CHF\s*\d+(?:[.,]\d+)?|entrée libre|prix libre|pass[^.]+CHF\s*\d+(?:[.,]\d+)?)/i);
  const priceText = priceMatch ? clean(priceMatch[0]) : (/(?:gratuit(?:e|es)?\s+et\s+ouvert(?:e|es)?s?\s+à\s+tous|accès\s+gratuit|entrée\s+gratuite)/i.test(`${mainDescription} ${practicalBlock}`) ? 'Gratuit / ouvert à tous' : '');
  return dates.map(date => normalizeEvent({
    source: 'yverdon', title, startDate: isoDate(date, `${mainDescription} ${practicalBlock}`), endDate: recurrenceDates.length >= 2 ? null : end,
    locationName: org || city, locationText, city, url,
    description: mainDescription || fallback.parentText || title,
    priceText,
    ageText: /petits et grands|famille|enfants?|atelier|animations/i.test(`${mainDescription} ${practicalBlock}`) ? 'famille / enfants mentionnés' : '',
    evidence
  }));
}

async function scrapeYverdon() {
  const source = 'yverdon';
  const html = await fetchHtml(SOURCES.yverdon.url, 35000);
  const $ = cheerio.load(html);
  const links = uniqBy($('a[href*="/evenement/"]').map((_, a) => {
    const anchorText = stripLead($(a).text());
    const parentText = clean($(a).closest('.jet-listing-grid__item,.elementor-widget,.e-con,article,div').text());
    return { anchorText, parentText, url: canonicalUrl($(a).attr('href'), SOURCES.yverdon.url) };
  }).get().filter(x => x.url && (x.anchorText || x.parentText) && !/^fr$|^de$|^español$/i.test(x.anchorText)), x => x.url).slice(0, 80);

  const events = [];
  for (let i = 0; i < links.length; i += 8) {
    const batch = links.slice(i, i + 8);
    const results = await Promise.all(batch.map(async link => {
      try {
        const detailHtml = await fetchHtml(link.url, 30000);
        const detailEvents = parseYverdonDetail(detailHtml, link.url, link);
        return detailEvents.length ? detailEvents : [parseYverdonListing(link.parentText, link.anchorText, link.url)];
      } catch (e) {
        try {
          return [parseYverdonListing(link.parentText, link.anchorText, link.url)];
        } catch {
          return [{ source, title: link.anchorText || link.parentText, url: link.url, error: e.message }];
        }
      }
    }));
    events.push(...results.flat());
  }
  return events.filter(e => !e.error);
}

function parseInfomaniakListing(text, url) {
  const evidence = clean(text);
  const prefixes = /^(Bientôt complet|Dernière chance|Nouveau|Complet)\s+/i;
  const stripped = evidence.replace(prefixes, '');
  const dateMatch = stripped.match(/(?:Du\s+)?(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+(?:au\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+)?(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?:\s+-\s+\d{1,2}h\d{0,2})?/i);
  const dateText = dateMatch ? dateMatch[0] : '';
  const title = clean(dateMatch ? stripped.slice(0, dateMatch.index) : stripped.split(/\s+A partir de\s+/i)[0]).slice(0, 140);
  const afterDate = dateMatch ? stripped.slice(dateMatch.index + dateText.length) : stripped;
  const priceMatch = afterDate.match(/A partir de\s+[^.]+\.-/i);
  const locationText = clean(priceMatch ? afterDate.slice(0, priceMatch.index) : '').replace(/^[-–]\s*/, '');
  const priceText = priceMatch ? clean(priceMatch[0]) : '';
  const description = clean(priceMatch ? afterDate.slice(priceMatch.index + priceText.length) : afterDate).replace(/^(Famille|Théâtre et arts vivants|Musique|Spectacle)\s*$/i, '');
  const dates = parseInfomaniakDateRange(dateText, 2026);
  const city = cityFromLocation(locationText, 'Yverdon-les-Bains');
  return normalizeEvent({
    source: 'infomaniak-yverdon', title, startDate: dates.startDate, endDate: dates.endDate,
    locationName: locationText.split(/\s+-\s+/)[0], locationText, city, url,
    description, priceText, evidence
  });
}

async function scrapeInfomaniakYverdon() {
  const source = 'infomaniak-yverdon';
  const html = await fetchHtml(SOURCES.infomaniakYverdon.url, 20000);
  const $ = cheerio.load(html);
  const links = uniqBy($('a[href*="/events/"]').map((_, a) => ({
    text: stripLead($(a).text()), url: canonicalUrl($(a).attr('href'), SOURCES.infomaniakYverdon.url)
  })).get().filter(x => x.url && x.text && /\b(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\b/i.test(x.text)), x => x.url).slice(0, 60);

  const events = [];
  for (const link of links) {
    try {
      events.push(parseInfomaniakListing(link.text, link.url));
    } catch (e) {
      events.push({ source, title: link.text, url: link.url, error: e.message });
    }
  }
  return events.filter(e => !e.error);
}

function extractAgendaChProfiles(html, baseUrl = 'https://agenda.ch/fr/s') {
  const $ = cheerio.load(html);
  const profileLinks = uniqBy($('a[href*="/fr/s/"]').map((_, a) => ({
    title: stripLead($(a).text()),
    url: canonicalUrl($(a).attr('href'), baseUrl)
  })).get().filter(x => x.url && x.title && !/^\d+$/.test(x.title)), x => x.url);
  const pageText = clean($('body').text());
  const appointmentSignals = [
    /prenez rendez-vous|prendre rendez-vous|rendez-vous en ligne/i.test(pageText),
    /th[ée]rapeute|ost[ée]opathe|physioth[ée]rapeute|coach|coiffeur|institut de beaut[ée]/i.test(pageText),
    /disponibilit[ée]s|s[ée]ances/i.test(pageText)
  ].filter(Boolean).length;
  const eventSignals = /\b(év[ée]nement|manifestation|spectacle|concert|festival|billetterie)\b/i.test(pageText);
  return { profileLinks, appointmentSignals, eventSignals, title: clean($('title').text()) };
}

async function scrapeAgendaCh() {
  const source = 'agenda-ch';
  const urls = [
    SOURCES.agendaCh.url,
    'https://agenda.ch/fr/s/jsresults?what=Enfants&where=Yverdon-les-Bains&distance=20000&search_form=true',
    'https://agenda.ch/fr/s/jsresults?what=Atelier&where=Yverdon-les-Bains&distance=20000&search_form=true',
    'https://agenda.ch/fr/s/jsresults?what=Sport&where=Yverdon-les-Bains&distance=20000&search_form=true'
  ];
  const probes = [];
  for (const url of urls) {
    const html = await fetchHtml(url, 20000);
    const extracted = extractAgendaChProfiles(html, url);
    probes.push({ url, ...extracted, sampleProfiles: extracted.profileLinks.slice(0, 5) });
  }
  const exploitableEventPage = probes.some(p => p.eventSignals && p.appointmentSignals < 2);
  return {
    events: [],
    note: exploitableEventPage
      ? 'Agenda.ch probe found event-like wording, but no dated event cards were safely extractable yet.'
      : `Agenda.ch is an appointment/practitioner directory in tested Yverdon queries, not a dated event agenda; ${probes.reduce((n, p) => n + p.profileLinks.length, 0)} practitioner/profile links inspected across ${probes.length} probes.`,
    diagnostics: probes.map(p => ({ url: p.url, title: p.title, profiles: p.profileLinks.length, appointmentSignals: p.appointmentSignals, eventSignals: p.eventSignals, sampleProfiles: p.sampleProfiles }))
  };
}

function extractLaDeriveeApiToken(appJs = '') {
  return appJs.match(/Authorization:\\?"Bearer \\?"\+String\(\\?"([^"\\]+)/)?.[1] || '';
}

function laDeriveeDateTime(date, time, isAllDay = false) {
  if (!date) return null;
  if (isAllDay || !time) return date;
  const m = String(time).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return date;
  return `${date}T${m[1].padStart(2, '0')}:${m[2]}:00+02:00`;
}

function parseLaDeriveeEvent(raw) {
  const tagText = (raw.tags || []).map(t => t.name || t.slug || '').filter(Boolean).join(', ');
  const partnerText = (raw.partners || []).map(p => p.title || p.subtitle || '').filter(Boolean).join(', ');
  const buttonText = (raw.buttons || []).map(b => [b.name, b.url].filter(Boolean).join(': ')).filter(Boolean).join(' | ');
  const description = clean([raw.subtitle, htmlToText(raw.teaser || ''), tagText, partnerText].filter(Boolean).join(' — '));
  const tags = inferTags(`${raw.title || ''} ${description} ${tagText}`).concat(['outdoor', 'culture', 'water']).filter((v, i, a) => a.indexOf(v) === i);
  return normalizeEvent({
    source: 'la-derivee',
    title: raw.title,
    startDate: laDeriveeDateTime(raw.date_start, raw.time_start, raw.is_all_day),
    endDate: raw.date_end || null,
    locationName: 'La Dérivée',
    locationText: 'La Dérivée, Quai de Nogent, Yverdon-les-Bains',
    city: 'Yverdon-les-Bains',
    url: canonicalUrl(`/event/${raw.slug || raw.id}`, 'https://www.laderivee.ch'),
    description,
    priceText: 'Gratuit / buvette estivale (site: centre culturel estival gratuit)',
    ageText: /enfants?|famille|atelier|animation|biblioth/i.test(description) ? 'famille / enfants mentionnés' : '',
    tags,
    evidence: clean([raw.title, raw.subtitle, `date ${raw.date_start}`, raw.time_start && `heure ${raw.time_start}`, tagText && `tags ${tagText}`, partnerText && `partenaires ${partnerText}`, htmlToText(raw.teaser || ''), buttonText].filter(Boolean).join(' | '))
  });
}

async function fetchLaDeriveeApiToken() {
  const html = await fetchHtml(SOURCES.laDerivee.url, 25000);
  const $ = cheerio.load(html);
  const appScript = $('script[src*="pages/_app-"]').attr('src') || $('script[src*="/_app"]').attr('src');
  if (!appScript) throw new Error('La Dérivée: unable to find Next.js _app script for public API token discovery');
  const appJs = await fetchHtml(canonicalUrl(appScript, SOURCES.laDerivee.url), 30000);
  const token = extractLaDeriveeApiToken(appJs);
  if (!token) throw new Error('La Dérivée: unable to extract public API token from _app script');
  return token;
}

async function scrapeLaDerivee() {
  const token = await fetchLaDeriveeApiToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(SOURCES.laDerivee.apiUrl, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) throw new Error(`${SOURCES.laDerivee.apiUrl} -> HTTP ${res.status}`);
    const rawEvents = await res.json();
    if (!Array.isArray(rawEvents)) throw new Error('La Dérivée API returned non-array payload');
    return rawEvents
      .filter(e => e && e.date_start && e.title && !/d[ée]riv[ée]e\s+ferm[ée]e|ferm[ée]/i.test(`${e.title} ${e.subtitle || ''} ${htmlToText(e.teaser || '')}`))
      .map(parseLaDeriveeEvent);
  } finally {
    clearTimeout(timer);
  }
}

function orbeEventUrl(id) {
  return `${SOURCES.orbe.url}#/event/${id}`;
}

function parseOrbeEvent(feature) {
  const raw = feature?.properties || feature || {};
  const detailText = clean([
    raw.summary,
    raw.location_details,
    raw.schedule,
    raw.pricing,
    raw.publics,
    raw.genre_evenement,
    raw.organizer_name,
    raw.website
  ].filter(Boolean).join(' | '));
  const publics = clean(raw.publics || '');
  const ageText = /familles?|jeune public|enfants?|tout public/i.test(publics)
    ? publics
    : (/familles?|jeune public|enfants?|tout public|jeux|atelier|animation/i.test(`${raw.title || ''} ${detailText}`) ? 'famille / enfants mentionnés' : publics);
  const tags = inferTags(`${raw.title || ''} ${detailText} ${raw.genre_evenement || ''}`);
  if (/familles?|jeune public/i.test(publics) && !tags.includes('discovery')) tags.push('discovery');
  return normalizeEvent({
    source: 'orbe',
    title: raw.title,
    startDate: raw.starts_at || null,
    endDate: raw.ends_at || null,
    locationName: (raw.location_details || '').split(',')[0],
    locationText: raw.location_details || 'Orbe',
    city: 'Orbe',
    url: orbeEventUrl(raw.id),
    description: clean([raw.summary, raw.schedule].filter(Boolean).join(' — ')),
    priceText: raw.pricing || '',
    ageText,
    tags,
    evidence: clean([
      raw.title,
      raw.starts_at && `début ${raw.starts_at}`,
      raw.ends_at && `fin ${raw.ends_at}`,
      raw.location_details,
      raw.pricing && `prix ${raw.pricing}`,
      raw.publics && `public ${raw.publics}`,
      raw.genre_evenement && `type ${raw.genre_evenement}`,
      raw.organizer_name && `organisateur ${raw.organizer_name}`,
      raw.website && `site ${raw.website}`,
      raw.summary
    ].filter(Boolean).join(' | '))
  });
}

async function fetchOrbeJson(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (OpenClaw Kids Activities v0.2)',
        accept: 'application/json',
        referer: SOURCES.orbe.url
      }
    });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeOrbe() {
  const ids = [];
  let nextUrl = `${SOURCES.orbe.apiUrl}?domain=agenda_orbe&page=1&page_size=50`;
  for (let page = 0; nextUrl && page < 10; page++) {
    const payload = await fetchOrbeJson(nextUrl, 30000);
    for (const feature of payload.features || []) {
      const id = feature?.properties?.id;
      if (id) ids.push(id);
    }
    nextUrl = payload.next || '';
  }
  const events = [];
  for (const id of [...new Set(ids)]) {
    try {
      const detail = await fetchOrbeJson(`${SOURCES.orbe.apiUrl}/${id}`, 25000);
      events.push(parseOrbeEvent(detail));
    } catch (e) {
      events.push({ source: 'orbe', title: `Orbe event ${id}`, url: orbeEventUrl(id), error: e.message });
    }
  }
  return events.filter(e => !e.error);
}


function vallorbeEventUrl(id) {
  return canonicalUrl(`/_rte/anlass/${id}`, 'https://www.vallorbe.ch');
}

function extractVallorbeListings(html) {
  const $ = cheerio.load(html);
  const attr = $('#anlassList').attr('data-entities');
  if (!attr) return [];
  const payload = JSON.parse(attr);
  return (payload.data || []).map(row => {
    const nameHtml = row.name || '';
    const name$ = cheerio.load(nameHtml);
    const link = name$('a').attr('href');
    return {
      id: row.id,
      title: clean(name$.text() || row.name),
      url: vallorbeEventUrl(row.id) || canonicalUrl(link, SOURCES.vallorbe.url),
      startDate: row._datumVon || null,
      endDate: row._datumBis || null,
      locationText: clean(cheerio.load(row.lokalitaet || '').text() || row._ort || 'Vallorbe'),
      city: row._ort || 'Vallorbe',
      organizer: clean(cheerio.load(row.organisator || '').text())
    };
  }).filter(x => x.id && x.title && x.startDate);
}

function parseVallorbeDateTime(text, fallbackDate) {
  const date = parseFrenchDate(text, 2026) || parseNumericDate(text, 2026) || fallbackDate;
  return isoDate(date, text);
}

function parseVallorbeDetail(html, fallback = {}) {
  const $ = cheerio.load(html);
  let title = clean($('main h1.contentTitle, main h1').first().text()) || fallback.title;
  if (!title || /^(Contact|Connexion|Rechercher)$/i.test(title)) title = fallback.title;
  const mainText = bestDetailText($, title) || clean($('main').first().text()) || clean($('body').text());
  const dateLineRe = new RegExp(`\\d{1,2}\\s+(?:${MONTH_RE})\\.?\\s+\\d{4}(?:,?\\s*\\d{1,2}h\\d{0,2}(?:\\s*-\\s*\\d{1,2}h\\d{0,2})?)?`, 'i');
  const dateLine = (mainText.match(dateLineRe) || [])[0] || '';
  const location = extractAfter('Lieu', mainText, ['Contact', 'Organisateur', 'Organisation', 'Prix', 'Retour']) || fallback.locationText || 'Vallorbe';
  const contact = extractAfter('Contact', mainText, ['Organisateur', 'Organisation', 'Prix', 'Retour']);
  const organizer = fallback.organizer || extractAfter('Organisateur', mainText, ['Lieu', 'Contact', 'Prix', 'Retour']) || extractAfter('Organisation', mainText, ['Lieu', 'Contact', 'Prix', 'Retour']);
  const price = extractAfter('Prix', mainText, ['Contact', 'Organisateur', 'Organisation', 'Retour']);
  const description = clean(mainText
    .replace(/^.*?Agenda\(sélectionné\)/, '')
    .replace(title, '')
    .replace(dateLine, '')
    .replace(/Lieu.*$/i, '')
  );
  const evidence = clean([title, dateLine || fallback.startDate, location, organizer, contact, price, description].filter(Boolean).join(' | '));
  return normalizeEvent({
    source: 'vallorbe',
    title,
    startDate: parseVallorbeDateTime(dateLine, fallback.startDate),
    endDate: fallback.endDate || null,
    locationName: location.split(/Place|Rue|Route|\d{4}/)[0],
    locationText: location,
    city: cityFromLocation(location, fallback.city || 'Vallorbe'),
    url: fallback.url || vallorbeEventUrl(fallback.id),
    description: description || organizer || title,
    priceText: price,
    ageText: /familles?|enfants?|jeunesse|tout public|jeux|atelier|biblioth/i.test(evidence) ? 'famille / enfants mentionnés' : '',
    evidence
  });
}

async function scrapeVallorbe() {
  const html = await fetchHtml(SOURCES.vallorbe.url, 30000);
  const listings = extractVallorbeListings(html);
  const events = [];
  for (const item of listings) {
    try {
      const detailHtml = await fetchHtml(item.url, 25000);
      events.push(parseVallorbeDetail(detailHtml, item));
    } catch (e) {
      events.push(normalizeEvent({
        source: 'vallorbe', title: item.title, startDate: item.startDate, endDate: item.endDate,
        locationText: item.locationText, city: item.city, url: item.url, description: item.organizer,
        evidence: clean([item.title, item.startDate, item.endDate, item.locationText, item.organizer].filter(Boolean).join(' | '))
      }));
    }
  }
  return events;
}

function tempsLibrePageUrl(page = 1) {
  return page <= 1 ? SOURCES.tempsLibre.url : `${SOURCES.tempsLibre.url}/${page}`;
}

function extractTempsLibreListings(html, pageUrl = SOURCES.tempsLibre.url) {
  const $ = cheerio.load(html);
  const listings = [];
  $('a.container-link[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (!/^\/(vaud|neuch-tel|fribourg|jura|berne-partie-fr|gen-ve|valais)\/(manifestations|juniors|festivals|concerts|expositions|spectacles)\//.test(href)) return;
    const article = $(a).find('article').first();
    if (!article.length) return;
    const url = canonicalUrl(href, pageUrl);
    const title = clean($(a).attr('title') || article.find('h3').first().text());
    const teaser = clean(article.find('.teaser').first().text());
    const category = clean(article.find('.categories').first().text());
    const place = clean(article.find('.place').first().text());
    const dateText = clean(article.find('.exergue.date').first().text());
    const priceText = /gratuit/i.test(article.text()) ? 'Gratuit' : '';
    if (url && title && !/sponsored/.test(url)) listings.push({ url, title, teaser, category, place, dateText, priceText });
  });
  return uniqBy(listings, x => x.url);
}

function parseTempsLibreDate(dateText) {
  const t = clean(dateText);
  const numeric = t.match(/(?:Le|Du)?\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*(?:-|au|–)\s*(\d{1,2})\.(\d{1,2})\.(\d{4}))?/i);
  if (numeric) {
    const start = `${numeric[3]}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
    const end = numeric[4] ? `${numeric[6]}-${numeric[5].padStart(2, '0')}-${numeric[4].padStart(2, '0')}` : null;
    return { startDate: start, endDate: end };
  }
  const french = parseFrenchDate(t, new Date().getFullYear());
  return { startDate: french, endDate: null };
}

function parseTempsLibreJsonLd(html) {
  const $ = cheerio.load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const raw = $(el).contents().text().trim();
    if (!raw || !raw.includes('Event')) continue;
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const event = list.find(x => x && (x['@type'] === 'Event' || (Array.isArray(x['@type']) && x['@type'].includes('Event'))));
      if (event) return event;
    } catch {}
  }
  return null;
}

function normalizeTempsLibreDateTime(value) {
  if (!value) return null;
  const s = clean(String(value)).replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return `${s.slice(0, 16)}:00+02:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function extractTempsLibreDataLayer(html) {
  const m = html.match(/dataLayer\.push\((\{[\s\S]*?\})\);/);
  if (!m) return {};
  try { return JSON.parse(m[1]); } catch { return {}; }
}

function parseTempsLibreDetail(html, listing = {}) {
  const $ = cheerio.load(html);
  const ld = parseTempsLibreJsonLd(html) || {};
  const dataLayer = extractTempsLibreDataLayer(html);
  const title = htmlToText(ld.name || $('h1').first().text() || listing.title);
  const description = htmlToText(ld.description || $('meta[name="description"]').attr('content') || listing.teaser || $('.page h2').first().text());
  const location = ld.location || {};
  const address = typeof location.address === 'string' ? location.address : clean([location.address?.streetAddress, location.address?.postalCode, location.address?.addressLocality].filter(Boolean).join(' '));
  const locationName = clean(location.name || (listing.place || '').replace(/,\s*[^,]+$/, '') || '');
  const locationText = clean([locationName, address || listing.place].filter(Boolean).join(', '));
  const fallbackDates = parseTempsLibreDate(listing.dateText || $('.date').first().text());
  const text = clean($('main').text());
  const detailPrice = /\bgratuit(?:e|s)?\b|entrée libre|accès libre/i.test(`${text} ${listing.priceText}`) ? 'Gratuit / entrée libre' : (listing.priceText || '');
  let ageText = clean((dataLayer.public || []).join(', ') || $('span.title').filter((_, el) => /Age conseillé/i.test($(el).text())).parent().next().text());
  if (/0\s*à\s*5\s*ans/i.test(ageText) && /6\s*à\s*12\s*ans/i.test(ageText)) ageText = '0 à 12 ans';
  const url = clean(ld.url || $('link[rel="canonical"]').attr('href') || listing.url);
  return normalizeEvent({
    source: 'tempsLibre',
    title,
    startDate: normalizeTempsLibreDateTime(ld.startDate) || fallbackDates.startDate,
    endDate: normalizeTempsLibreDateTime(ld.endDate) || fallbackDates.endDate,
    locationName,
    locationText,
    city: cityFromLocation(`${dataLayer.city || ''} ${locationText}`, clean(dataLayer.city || '')),
    url,
    description,
    priceText: detailPrice,
    ageText,
    tags: inferTags(`${title} ${description} ${(dataLayer.pageCategories || []).join(' ')} ${listing.category || ''}`),
    evidence: clean(`TempsLibre ${listing.category || ''}. ${listing.dateText || ''}. ${ageText ? `Public: ${ageText}.` : ''} ${detailPrice ? `Prix: ${detailPrice}.` : ''} ${description} ${text.slice(0, 500)}`)
  });
}

async function scrapeTempsLibre(maxPages = 3) {
  const listings = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = tempsLibrePageUrl(page);
    try {
      const html = await fetchHtml(url, 30000);
      const pageListings = extractTempsLibreListings(html, url);
      if (!pageListings.length) break;
      listings.push(...pageListings);
    } catch (err) {
      console.warn(`[tempsLibre] listing page ${page} failed: ${err.message}`);
      break;
    }
  }
  const events = [];
  for (const listing of uniqBy(listings, x => x.url)) {
    try {
      const html = await fetchHtml(listing.url, 25000);
      events.push(parseTempsLibreDetail(html, listing));
    } catch (err) {
      const dates = parseTempsLibreDate(listing.dateText);
      events.push(normalizeEvent({
        source: 'tempsLibre', title: listing.title, startDate: dates.startDate, endDate: dates.endDate,
        locationText: listing.place, city: cityFromLocation(listing.place), url: listing.url,
        description: listing.teaser, priceText: listing.priceText,
        evidence: `TempsLibre listing fallback: ${listing.dateText} ${listing.place} ${listing.teaser}`
      }));
      console.warn(`[tempsLibre] detail fetch failed for ${listing.url}: ${err.message}`);
    }
  }
  return uniqBy(events.filter(e => e.title && e.url), e => e.id);
}


function lastSundayOfMonth(year, month) {
  const d = new Date(Date.UTC(year, month, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getUTCDate();
}

function zurichOffsetForDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '+02:00';
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (month > 3 && month < 10) return '+02:00';
  if (month < 3 || month > 10) return '+01:00';
  if (month === 3) return day >= lastSundayOfMonth(year, 3) ? '+02:00' : '+01:00';
  return day < lastSundayOfMonth(year, 10) ? '+02:00' : '+01:00';
}

function isoDateZurich(date, time = '') {
  if (!date) return null;
  const m = clean(time).match(/(?:^|\D)(\d{1,2})\s*[:h](\d{2})/i) || clean(time).match(/(?:^|\D)(\d{1,2})(?:\s|$)/);
  if (!m) return date;
  const hour = Number(m[1]);
  if (hour > 23) return date;
  const minute = (m[2] || '00').padStart(2, '0');
  return `${date}T${String(hour).padStart(2, '0')}:${minute}:00${zurichOffsetForDate(date)}`;
}

function extractTheatreDuPassageDetailLinks(html, pageUrl = SOURCES.theatreDuPassage.listUrl) {
  const $ = cheerio.load(html);
  const links = new Map();
  $('a[href*="/programme/detail/"]').each((_, a) => {
    const href = $(a).attr('href');
    const url = canonicalUrl(href, pageUrl);
    const text = clean($(a).text());
    const title = clean(text.replace(/^(?:LU|MA|ME|JE|VE|SA|DI)?\s*\d{1,2}(?:\s*-\s*(?:LU|MA|ME|JE|VE|SA|DI)?\s*\d{1,2})?\s+(?:JAN|FÉV|FEV|MARS|AVRIL|MAI|JUIN|JUIL|AOÛT|AOUT|SEPT|OCT|NOV|DÉC|DEC)\s*\d{2}/i, '').replace(/^(?:Famille|Théâtre|Théâtre d’ombres|Théâtre de marionnettes|Cirque|Danse|Musique|Humour|Marionnettes|[^A-ZÀ-Ÿ]{0,30})/i, ''));
    const slugTitle = clean((href || '').split('/').pop().replace(/^\d+-/, '').replace(/-/g, ' '));
    for (const key of [title, slugTitle]) if (key) links.set(titleKey(key), url);
  });
  return links;
}

function extractTheatreDuPassageFamilyListings(html) {
  const $ = cheerio.load(html);
  const listings = [];
  $('input[name="evenements_dates_id[]"]').each((_, input) => {
    const id = clean($(input).attr('value') || '');
    const title = clean($(input).attr('aria-label') || '');
    const rowText = clean($(input).parent().text());
    const m = rowText.match(/-\s*(\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4})\s*-\s*(\d{1,2}:\d{2})/i);
    const date = m ? parseFrenchDate(m[1], 2026) : null;
    if (id && title && date) listings.push({ id, title, rowText, startDate: isoDateZurich(date, m[2]) });
  });
  return listings;
}

function parseTheatreDuPassageDetail(html, listing = {}) {
  const $ = cheerio.load(html);
  const bodyText = clean($('body').text());
  const title = clean($('h1,h2').filter((_, el) => clean($(el).text()).toLowerCase() === (listing.title || '').toLowerCase()).first().text()) || listing.title;
  const genre = clean($('body').text().match(/(?:Théâtre d’ombres|Théâtre de marionnettes|Famille, Théâtre|Famille|Cirque|Danse|Théâtre)/i)?.[0] || 'Famille / théâtre');
  const duration = clean((bodyText.match(/Durée\s*([^Â]+?)(?:Âge|Lieu|Par le|$)/i) || [])[1] || '');
  const ageText = clean((bodyText.match(/Âge\s*([^L]+?)(?:Lieu|Par le|$)/i) || [])[1] || 'Famille');
  const venue = clean((bodyText.match(/Lieu\s*([^P]+?)(?:Par le|Quitter|\w+ la vie|$)/i) || [])[1] || 'Théâtre du Passage');
  const description = clean((bodyText.split(venue).pop() || bodyText).replace(/Texte et mise en scène.*$/i, '').slice(0, 1200));
  const priceText = clean(bodyText.match(/Tarif plein\s*\d+\.-\s*Tarif réduit\s*\d+\.-\s*Tarif enfant\s*\d+\.-/i)?.[0] || 'Pass’famille: enfant 10.–, adulte -30%; tarifs page détail disponibles');
  return normalizeEvent({
    source: 'theatreDuPassage',
    title,
    startDate: listing.startDate,
    locationName: 'Théâtre du Passage',
    locationText: `Théâtre du Passage, ${venue}, Passage Maximilien-de-Meuron 4, 2000 Neuchâtel`,
    city: 'Neuchâtel',
    url: listing.url || SOURCES.theatreDuPassage.url,
    description: clean(`${genre}. ${duration ? `Durée ${duration}. ` : ''}${description}`),
    ageText,
    priceText,
    tags: inferTags(`${title} ${genre} ${description} famille enfants théâtre marionnettes`),
    evidence: clean(`Pass’famille officiel. ${listing.rowText || ''}. ${ageText ? `Âge: ${ageText}.` : ''} ${duration ? `Durée: ${duration}.` : ''} ${priceText}`)
  });
}

async function scrapeTheatreDuPassage() {
  const [familyHtml, listHtml] = await Promise.all([
    fetchHtml(SOURCES.theatreDuPassage.url, 30000),
    fetchHtml(SOURCES.theatreDuPassage.listUrl, 30000).catch(() => '')
  ]);
  const detailLinks = extractTheatreDuPassageDetailLinks(listHtml);
  const listings = extractTheatreDuPassageFamilyListings(familyHtml).map(item => ({
    ...item,
    url: detailLinks.get(titleKey(item.title)) || `${SOURCES.theatreDuPassage.url}#event-${item.id}`
  }));
  const events = [];
  const detailCache = new Map();
  for (const listing of listings) {
    try {
      if (!detailCache.has(listing.url) && /\/programme\/detail\//.test(listing.url)) detailCache.set(listing.url, await fetchHtml(listing.url, 25000));
      const detailHtml = detailCache.get(listing.url) || familyHtml;
      events.push(parseTheatreDuPassageDetail(detailHtml, listing));
    } catch (err) {
      events.push(normalizeEvent({
        source: 'theatreDuPassage', title: listing.title, startDate: listing.startDate,
        locationName: 'Théâtre du Passage', locationText: 'Théâtre du Passage, Passage Maximilien-de-Meuron 4, 2000 Neuchâtel', city: 'Neuchâtel',
        url: listing.url, description: 'Spectacle estampillé Pass’famille au Théâtre du Passage.', ageText: 'Famille',
        priceText: 'Pass’famille: enfant 10.–, adulte -30%', evidence: `Pass’famille listing fallback: ${listing.rowText}`
      }));
    }
  }
  return uniqBy(events.filter(e => e.title && e.startDate), e => e.id);
}

function rejectionReason(e, window) {
  if (e.source === 'manualJohan' && !['confirmed', 'verified'].includes(e.confidenceStatus || e.status || 'candidate')) return `manual_${e.confidenceStatus || e.status || 'candidate'}`;
  if (!e.url) return 'missing_url';
  if (!e.title || /contact|horaires d'ouverture|agenda des manifestations|accueil/i.test(e.title)) return 'navigation_or_empty_title';
  if (looksLikeNonEvent(e)) return 'non_event_or_administrative';
  if (!e.startDate) return 'missing_date';
  const date = e.startDate.slice(0,10);
  const end = (e.endDate || e.startDate).slice(0,10);
  if (end < window.start || date >= window.endExclusive) return `outside_window_${window.start}_${window.endExclusive}`;
  if (!e.locationText && !e.city) return 'missing_location';
  const distance = estimateDistanceKm(e);
  if (distance != null && distance > 60) return `too_far_${distance}km`;
  if (/caves? ouvertes?|vin|vigneron|d[ée]gustation/i.test(`${e.title} ${e.description}`)) return 'adult_or_alcohol_focused';
  if (isLateAdultLeaningEvent(e)) return 'late_evening_not_family';
  if (isVagueLongRunningNonFamilyEvent(e)) return 'too_vague_not_family_enough';
  const age = ageFitDetail(e);
  if (!age.andy.compatible || !age.lennon.compatible) return 'age_mismatch';
  return null;
}

function scoreEvent(e, window) {
  const age = ageFitDetail(e);
  const date = dateFitDetail(e, window);
  const location = locationFitDetail(e);
  const interest = interestFitDetail(e);
  const confidence = confidenceDetail(e);
  const total = Math.min(100, age.andy.score + age.lennon.score + date.score + location.score + interest.score + confidence.score);
  const childCentric = hasChildCentricSignal(e);
  return {
    total,
    components: {
      ageFitAndy: age.andy.score,
      ageFitLennon: age.lennon.score,
      dateWeekendFit: date.score,
      locationTravelBurden: location.score,
      interestFit: interest.score,
      practicalConfidence: confidence.score
    },
    details: { age, date, location, interest, confidence },
    reasons: buildFitReasons(e, { age, date, location, interest, confidence }),
    caveats: buildCaveats(e, { age, date, location, interest, confidence }),
    label: total >= 70 && childCentric ? 'recommandé' : 'option secondaire'
  };
}

function hasChildCentricSignal(e) {
  const text = `${e.title} ${e.description} ${e.ageText}`;
  const tags = new Set(e.tags || []);
  if (/enfants?|famille|kids?|atelier|conte|\bjeux?\b|lecture|bibli|d[ée]couverte|exploration|observation/i.test(text)) return true;
  if (['nature', 'animals', 'science', 'water'].some(t => tags.has(t))) return true;
  return false;
}

function eventStartHour(e) {
  const m = String(e.startDate || '').match(/T(\d{2}):/);
  return m ? Number(m[1]) : null;
}

function isLateAdultLeaningEvent(e) {
  const hour = eventStartHour(e);
  if (hour == null || hour < 20) return false;
  return !hasChildCentricSignal(e);
}

function isVagueLongRunningNonFamilyEvent(e) {
  if (!e.endDate || hasChildCentricSignal(e)) return false;
  const start = Date.parse(`${String(e.startDate).slice(0, 10)}T12:00:00Z`);
  const end = Date.parse(`${String(e.endDate).slice(0, 10)}T12:00:00Z`);
  const days = Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400000) : 0;
  return days >= 7 && !/enfants?|famille|kids?/i.test(`${e.title} ${e.description} ${e.ageText}`);
}

function looksLikeNonEvent(e) {
  const text = `${e.title} ${e.description}`.toLowerCase();
  return /formulaire|page de contact|horaires administratifs|newsletter|politique de confidentialit[ée]|conditions g[ée]n[ée]rales/.test(text);
}

function ageFitDetail(e) {
  const child = (age) => {
    if (e.ageMin == null && e.ageMax == null) return { compatible: true, score: 8, reason: 'âge non précisé, probablement familial à vérifier' };
    if (e.ageMin != null && age < e.ageMin) return { compatible: false, score: 0, reason: `âge minimum ${e.ageMin} ans` };
    if (e.ageMax != null && age > e.ageMax) return { compatible: false, score: 0, reason: `âge maximum ${e.ageMax} ans` };
    return { compatible: true, score: 10, reason: e.ageText || 'âge compatible' };
  };
  return { andy: child(FAMILY.andy.age), lennon: child(FAMILY.lennon.age), ageText: e.ageText || '' };
}

function dateFitDetail(e, window) {
  if (!e.startDate) return { score: 0, reason: 'date manquante' };
  const start = e.startDate.slice(0,10);
  const end = (e.endDate || e.startDate).slice(0,10);
  const overlaps = end >= window.start && start < window.endExclusive;
  if (!overlaps) return { score: 0, reason: `hors fenêtre ${window.start} → ${window.endExclusive}` };
  const day = new Date(`${start}T12:00:00Z`).getUTCDay();
  const weekendBonus = day === 0 || day === 6 ? 20 : 14;
  return { score: weekendBonus, reason: day === 0 || day === 6 ? 'tombe le week-end ciblé' : 'recouvre la fenêtre ciblée' };
}

function estimateDistanceKm(e) {
  const hay = clean(`${e.city || ''} ${e.locationText || ''}`).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [city, km] of Object.entries(LOCATION_KM_FROM_YVERDON)) {
    const key = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (hay.includes(key)) return km;
  }
  if (/yverdon|grandson/i.test(hay)) return /grandson/i.test(hay) ? 5 : 0;
  return null;
}

function locationFitDetail(e) {
  const km = estimateDistanceKm(e);
  if (km == null) return { score: 10, distanceKm: null, reason: 'distance inconnue, lieu à vérifier' };
  if (km <= 8) return { score: 20, distanceKm: km, reason: 'très proche d’Yverdon' };
  if (km <= 25) return { score: 16, distanceKm: km, reason: 'trajet court en famille' };
  if (km <= 45) return { score: 11, distanceKm: km, reason: 'day-trip raisonnable mais trajet notable' };
  return { score: 5, distanceKm: km, reason: 'trajet lourd pour une sortie enfants' };
}

function interestFitDetail(e) {
  const tags = new Set(e.tags || []);
  const matched = [];
  let score = 0;
  for (const person of [FAMILY.lennon, FAMILY.andy, FAMILY.daisy, FAMILY.johan]) {
    const hits = person.tags.filter(t => tags.has(t));
    if (hits.length) matched.push({ person: person.name, tags: hits.slice(0, 3) });
  }
  score += matched.some(m => m.person === 'Lennon') ? 8 : 0;
  score += matched.some(m => m.person === 'Andy') ? 7 : 0;
  score += matched.some(m => m.person === 'Daisy') ? 4 : 0;
  score += matched.some(m => m.person === 'Johan') ? 4 : 0;
  if (/bibli|lecture|conte/i.test(e.title + e.description)) score += 4;
  if (/atelier|d[ée]couverte|observation|exp[ée]rience/i.test(e.title + e.description)) score += 3;
  return { score: Math.min(25, score), matched, reason: matched.length ? matched.map(m => `${m.person}: ${m.tags.map(t => TAG_FR[t] || t).join(', ')}`).join(' ; ') : 'peu de signaux d’intérêt familial' };
}

function confidenceDetail(e) {
  const bits = [e.url && 'URL', e.startDate && 'date', (e.locationText || e.city) && 'lieu', e.description && 'description', e.priceText && 'prix', (e.officialSources || []).length && 'source officielle'].filter(Boolean);
  let score = Math.min(15, bits.length * 3);
  if (e.source === 'manualJohan' && ['candidate', 'needs_review'].includes(e.confidenceStatus || e.status)) score = Math.min(score, 6);
  return { score, evidence: bits, status: e.confidenceStatus || e.status || 'confirmed', reason: bits.length ? `infos présentes: ${bits.join(', ')} (${e.confidenceStatus || e.status || 'confirmed'})` : 'détails pratiques pauvres' };
}

function buildFitReasons(e, d) {
  return [d.interest.reason, d.location.reason, d.date.reason]
    .filter(Boolean)
    .slice(0, 3);
}

function buildCaveats(e, d) {
  const out = [];
  if (!e.priceText) out.push('prix à vérifier');
  if (!e.ageText) out.push('âge non précisé');
  if (d.location.distanceKm != null && d.location.distanceKm > 35) out.push(`trajet env. ${d.location.distanceKm} km`);
  if (/inscription|r[ée]servation/i.test(e.evidence)) out.push('inscription/réservation à vérifier');
  if (!out.length) out.push(e.priceText || 'détails pratiques à vérifier');
  return out;
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
function frWindow(window) {
  const end = new Date(`${window.endExclusive}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return `${frDate(window.start).replace(/\.2026$/, '')}–${frDate(end.toISOString().slice(0, 10))}`;
}
function practicalCaveat(caveats = []) {
  if (!caveats.length) return 'détails pratiques à vérifier';
  return caveats.slice(0, 2).join(' ; ');
}
function shortlistedRecommendations(scored) {
  const candidates = scored.filter(x => x.score.total >= 60);
  return candidates.filter(x => x.score.label === 'recommandé').concat(candidates.filter(x => x.score.label !== 'recommandé')).slice(0, 5);
}

function telegramSummary(scored, window) {
  const top = shortlistedRecommendations(scored);
  if (!top.length) return `Idées famille pour ce week-end — ${frWindow(window)}\n\nAucune recommandation fiable: les sources ont été collectées, mais rien ne passe les filtres date/lieu/qualité.`;
  const lines = [
    `BROUILLON NON VALIDÉ — reviews dédiées par événement requises avant envoi`,
    `Idées famille pour ce week-end — ${frWindow(window)}`,
    `Sélection sourcée autour d’Yverdon, à vérifier avant de partir.`
  ];
  return lines.concat(top.map(({event:e, score}, i) =>
    `${i+1}. ${e.title}\n` +
    `📅 ${frDate(e.startDate)}\n` +
    `📍 ${e.locationText || e.city}\n` +
    `Pourquoi: ${(score.reasons && score.reasons.length) ? score.reasons.join(' · ') : fitReason(e)}. Score ${score.total}/100 — ${score.label}.\n` +
    `À vérifier: ${practicalCaveat(score.caveats && score.caveats.length ? score.caveats : [caveat(e)])}\n` +
    `${e.url}`
  )).join('\n\n');
}

function eventReviewQueue(scored, window) {
  const top = shortlistedRecommendations(scored);
  return {
    status: top.length ? 'reviews_required_before_send' : 'no_recommendations',
    instruction: 'Open one isolated subagent/session per shortlisted event. Each must open/read the canonical event page, verify practical facts, challenge ranking, and write event-reviews/<event-id>.md before any final Telegram summary is sent.',
    window,
    count: top.length,
    events: top.map(({ event, score }) => ({
      id: event.id,
      title: event.title,
      url: event.url,
      startDate: event.startDate,
      location: event.locationText || event.city || event.locationName,
      source: event.source,
      score: score.total,
      label: score.label,
      reasons: score.reasons || [],
      caveats: score.caveats || []
    }))
  };
}

function eventReviewQueueMarkdown(queue) {
  if (!queue.events.length) return '# Event review queue\n\nNo shortlisted recommendations.\n';
  return '# Event review queue — mandatory before final send\n\n'
    + 'Run one dedicated isolated session per event. The final Telegram summary must not be sent from `telegram-summary.txt`; it is only a draft until these reviews exist and are consolidated.\n\n'
    + queue.events.map((e, i) => `${i+1}. **${e.title}**\n`
      + `   - id: \`${e.id}\`\n`
      + `   - url: ${e.url}\n`
      + `   - date: ${e.startDate || 'à vérifier'}\n`
      + `   - place: ${e.location || 'à vérifier'}\n`
      + `   - scraper score: ${e.score}/100 — ${e.label}\n`
      + `   - caveats: ${(e.caveats || []).join('; ') || 'aucun'}\n`
      + `   - artifact required: \`event-reviews/${e.id}.md\`\n`).join('\n');
}

function sourceTrustPriority(e) {
  if (e.source !== 'manualJohan') return 0;
  if ((e.officialSources || []).length && ['confirmed', 'verified'].includes(e.confidenceStatus || e.status)) return 1;
  if (['confirmed', 'verified'].includes(e.confidenceStatus || e.status)) return 2;
  return 9;
}

function canonicalRecommendationPool(events) {
  return uniqBy([...events].sort((a, b) => sourceTrustPriority(a) - sourceTrustPriority(b)), recommendationKey);
}

async function collectAll() {
  const sourceLogs = [];
  const out = [];
  // Local Johan/manual sources are intentionally loaded first: they are durable,
  // fast, and should remain visible even when a slow external source delays the
  // wider collection. Recommendation dedupe still prefers official web sources
  // over manual duplicates via canonicalRecommendationPool().
  for (const [source, fn] of Object.entries({ manualJohan: loadManualJohanEvents, prioritizedTheatreCandidates: loadPrioritizedSourceCandidates, grandson: scrapeGrandson, yverdon: scrapeYverdon, infomaniakYverdon: scrapeInfomaniakYverdon, agendaCh: scrapeAgendaCh, laDerivee: scrapeLaDerivee, orbe: scrapeOrbe, vallorbe: scrapeVallorbe, tempsLibre: scrapeTempsLibre, theatreDuPassage: scrapeTheatreDuPassage })) {
    const started = new Date().toISOString();
    try {
      const result = await fn();
      const items = Array.isArray(result) ? result : (result.events || []);
      out.push(...items);
      sourceLogs.push({
        source,
        status: 'ok',
        fetchedAt: started,
        count: items.length,
        ...(result && !Array.isArray(result) && result.note ? { note: result.note } : {}),
        ...(result && !Array.isArray(result) && result.diagnostics ? { diagnostics: result.diagnostics } : {})
      });
      console.log(`[OK] ${source}: ${items.length} events${result && !Array.isArray(result) && result.note ? ` — ${result.note}` : ''}`);
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
    if (f.expected.reject_reason) assert(reason, `${f.name} expected a rejection reason`);
    if (f.expected.primary_tags) for (const tag of f.expected.primary_tags) assert(e.tags.includes(tag), `${f.name} missing tag ${tag}; got ${e.tags}`);
    assert(typeof scored.components.ageFitAndy === 'number', `${f.name} missing Andy age component`);
    assert(typeof scored.components.ageFitLennon === 'number', `${f.name} missing Lennon age component`);
    assert(scored.details && scored.reasons && scored.caveats, `${f.name} missing transparent scoring details`);
    if (f.name === 'daisy_cosy_secondary_option') assert.strictEqual(scored.label, 'option secondaire');
    if (f.name === 'age_mismatch_event') assert.strictEqual(reason, 'age_mismatch');
    if (f.name === 'navigation_false_positive') assert(/navigation|non_event|missing_date/.test(reason), `${f.name} wrong rejection reason ${reason}`);
  }
  assert.strictEqual(parseFrenchDate('SAMEDI 23 mai 2026'), '2026-05-23');
  assert.strictEqual(parseFrenchDate('MARDI 05 MAI 2026'), '2026-05-05');
  assert.strictEqual(parseFrenchDate('3 Oct 2026'), '2026-10-03');
  assert.deepStrictEqual(parseInfomaniakDateRange('Du vendredi 22 au samedi 23 mai', 2026), { startDate: '2026-05-22', endDate: '2026-05-23' });
  assert.strictEqual(parseInfomaniakDateRange('Dimanche 24 mai - 13h30', 2026).startDate, '2026-05-24T13:30:00+02:00');
  const agendaProbe = extractAgendaChProfiles('<html><head><title>Coach sportif à Yverdon-les-bains – Séances et disponibilités</title></head><body><a href="/fr/s/sport/yverdon/kalambay-training-sarl-Er757Rvn">Kalambay Training Sàrl</a><p>Prenez rendez-vous en ligne avec un thérapeute ou un coach. Disponibilités et séances.</p></body></html>');
  assert.strictEqual(agendaProbe.profileLinks.length, 1);
  assert(agendaProbe.appointmentSignals >= 2, 'agenda.ch probe should detect appointment-directory signals');
  assert.strictEqual(agendaProbe.eventSignals, false);
  assert.strictEqual(extractLaDeriveeApiToken('Authorization:"Bearer "+String("abc123")'), 'abc123');
  const laDerivee = parseLaDeriveeEvent({ id: 1, date_start: '2026-06-06', date_end: '2026-06-06', title: 'Marché des artisan.ne.s', subtitle: 'Animation', slug: 'marche-des-artisan-ne-s', time_start: '14:00:00.000', teaser: '<p>marché artisanal, stands de nourriture, henné, animations et performances</p>', tags: [{ name: 'Animation' }], partners: [{ title: 'CULMINA' }], buttons: [] });
  assert.strictEqual(laDerivee.source, 'la-derivee');
  assert.strictEqual(laDerivee.startDate, '2026-06-06T14:00:00+02:00');
  assert.strictEqual(laDerivee.city, 'Yverdon-les-Bains');
  assert(laDerivee.tags.includes('outdoor') && laDerivee.priceText.includes('Gratuit'), 'La Dérivée fixture should keep taste/price evidence');
  const yverdonRecurring = parseYverdonDetail('<h1>Marchés d’été ArtYsans Yverdon 2026</h1><div class="jet-listing-dynamic-field__content">9 Mai 2026</div><div class="jet-listing-dynamic-field__content">- 3 Oct 2026</div><div class="elementor-widget-text-editor">Marchés artisanaux</div><div class="elementor-widget-text-editor">De 8h à 13h30. Dates 2026 : – Samedi 9 mai – Samedi 6 juin – Samedi 3 octobre</div><div class="elementor-widget-text-editor">Association ArtYsans Yverdon</div><div class="elementor-widget-text-editor">Centre ville</div><div class="elementor-widget-text-editor">1400</div><div class="elementor-widget-text-editor">Yverdon-les-Bains</div>', 'https://yverdonlesbainsregion.ch/evenement/marches-dete-artysans-yverdon-2026/');
  assert.strictEqual(yverdonRecurring.length, 3);
  assert.strictEqual(yverdonRecurring[1].startDate, '2026-06-06T08:00:00+02:00');
  assert.strictEqual(yverdonRecurring[1].locationText, 'Association ArtYsans Yverdon, Centre ville, 1400, Yverdon-les-Bains');
  const grandsonOccurrences = extractGrandsonCalendarOccurrences('<table class="agenda"><tr><td>Lundi</td><td>Mardi</td></tr><tr><td>8</td><td>9</td></tr><tr class="cal-texte"><td><span class="cal"><a href="/agenda/fete/">&gt; Fête familiale</a></span></td><td class="gris"><a href="/agenda/passe/">&gt; Passé</a></td></tr></table>', 'https://www.grandson.ch/vie-locale/agenda-des-manifestations/?mois=6&annee=2026');
  assert.deepStrictEqual(grandsonOccurrences, [{ title: 'Fête familiale', url: 'https://www.grandson.ch/agenda/fete/', date: '2026-06-08' }]);
  const grandsonEvent = parseGrandsonDetail('<main><div class="container"><div class="content">Fête familiale DIMANCHE 14 JUIN 2026 Jeux et buvette pour enfants Organisation Association Grandson Lieu Salle des Quais Rue Basse Horaires 13h-17h Prix Gratuit Contact info@example.ch Retour</div></div></main>', { title: 'Fête familiale', url: 'https://www.grandson.ch/agenda/fete/', date: '2026-06-15' });
  assert.strictEqual(grandsonEvent.startDate, '2026-06-15T13:00:00+02:00');
  assert.strictEqual(grandsonEvent.priceText, 'Gratuit');
  assert.strictEqual(grandsonEvent.locationName, 'Association Grandson');
  const orbeEvent = parseOrbeEvent({ properties: { id: 32442, title: "T'as où les jeux", starts_at: '2026-06-10T18:30:00+02:00', ends_at: '2026-06-10T23:00:00+02:00', location_details: 'Hessel Espace Culturel, Rue Davall 3, 1350 Orbe', summary: 'Jeux de sociétés à disposition', pricing: '0.-', schedule: 'Dès 18h30', publics: 'Familles', genre_evenement: 'Culture', organizer_name: 'Association Hessel Espace Culturel' } });
  assert.strictEqual(orbeEvent.source, 'orbe');
  assert.strictEqual(orbeEvent.city, 'Orbe');
  assert.strictEqual(orbeEvent.startDate, '2026-06-10T18:30:00+02:00');
  assert.strictEqual(orbeEvent.priceText, '0.-');
  assert.strictEqual(orbeEvent.ageText, 'Familles');
  assert(orbeEvent.url.includes('#/event/32442'), 'Orbe event should keep stable agenda event URL');
  const vallorbeFixtureEntities = JSON.stringify({ data: [{ id: '7564447', name: '<a href="/_rte/anlass/7564447">Séance du Conseil communal</a>', _datumVon: '2026-08-31', _datumBis: '2026-08-31', _ort: 'Vallorbe', lokalitaet: 'Grande salle', organisator: 'Commune' }] }).replace(/"/g, '&quot;');
  const vallorbeRows = extractVallorbeListings(`<table id="anlassList" data-entities="${vallorbeFixtureEntities}"></table>`);
  assert.strictEqual(vallorbeRows.length, 1);
  const vallorbeEvent = parseVallorbeDetail('<main><h1 class="contentTitle">Séance du Conseil communal</h1>31 août 2026, 18h30 - 22h00 Lieu Grande salle, 1er étage du Casino Place du Pont 3 1337 Vallorbe Contact conseil@vallorbe.ch</main>', vallorbeRows[0]);
  assert.strictEqual(vallorbeEvent.source, 'vallorbe');
  assert.strictEqual(vallorbeEvent.startDate, '2026-08-31T18:30:00+02:00');
  assert.strictEqual(vallorbeEvent.city, 'Vallorbe');
  const tempsLibreListings = extractTempsLibreListings('<a class="container-link" href="/vaud/manifestations/449853-dans-la-peau-des-mangakas" title="Dans la peau des mangakas"><article><div class="exergue date"><div class="dark"><span class="day">14</span><span class="month-year">juin 2026</span></div></div><p class="categories"><strong>Ateliers</strong></p><h3>Dans la peau des mangakas</h3><p class="teaser">Atelier créatif manga</p><p class="place"><strong>Musée romain de Lausanne-Vidy</strong>, Lausanne</p><ul class="tagInfos"><li class="free">Gratuit</li></ul></article></a>', SOURCES.tempsLibre.url);
  assert.strictEqual(tempsLibreListings.length, 1);
  const tempsLibreEvent = parseTempsLibreDetail('<head><link rel="canonical" href="https://www.tempslibre.ch/vaud/manifestations/449853-dans-la-peau-des-mangakas"><script>window.dataLayer = window.dataLayer || []; window.dataLayer.push({"pageSection":"manifestations","pageCategories":["Manifestations","Ateliers"],"city":"Lausanne","canton":"vaud","public":["6 à 12 ans","Adolescents"]});</script><script type="application/ld+json">{"@context":"http://schema.org","@type":"Event","name":"Dans la peau des mangakas","description":"Atelier manga pour enfants","startDate":"2026-06-14 15:00","endDate":"2026-06-14 16:00","url":"https://www.tempslibre.ch/vaud/manifestations/449853-dans-la-peau-des-mangakas","location":{"@type":"Place","name":"Musée romain de Lausanne-Vidy","address":"Ch. du Bois-de-Vaux 24, Lausanne, CH"}}</script></head><main><h1>Dans la peau des mangakas</h1><p>Gratuit, réservation conseillée.</p></main>', tempsLibreListings[0]);
  assert.strictEqual(tempsLibreEvent.source, 'tempsLibre');
  assert.strictEqual(tempsLibreEvent.startDate, '2026-06-14T15:00:00+02:00');
  assert.strictEqual(tempsLibreEvent.city, 'Lausanne');
  assert(tempsLibreEvent.priceText.includes('Gratuit'), 'TempsLibre fixture should keep free evidence');
  const theatreRows = extractTheatreDuPassageFamilyListings('<main><p><input aria-label="Tu comprendras quand tu seras grand" type="checkbox" name="evenements_dates_id[]" value="355"> Tu comprendras quand tu seras grand - 25 octobre 2026 - 11:00</p></main>');
  assert.strictEqual(theatreRows.length, 1);
  assert.strictEqual(theatreRows[0].startDate, '2026-10-25T11:00:00+01:00');
  const theatreEvent = parseTheatreDuPassageDetail('<body>Tarif plein35.-Tarif réduit25.-Tarif enfant10.- Théâtre d’ombres Tu comprendras quand tu seras grand Date DI 25 OCT 2026 11:00, 17:00 Durée 50 min Âge Dès 6 ans Lieu Grande salle Par le Théâtre des Marionnettes de Genève Une aventure drôle et tendre.</body>', { ...theatreRows[0], url: 'https://www.theatredupassage.ch/programme/detail/162-tu-comprendras-quand-tu-seras-grand' });
  assert.strictEqual(theatreEvent.source, 'theatreDuPassage');
  assert.strictEqual(theatreEvent.city, 'Neuchâtel');
  assert.strictEqual(theatreEvent.ageText, 'Dès 6 ans');
  assert(theatreEvent.priceText.includes('Tarif enfant'), 'Théâtre du Passage fixture should keep price evidence');
  const manual = loadManualJohanEvents();
  assert(manual.events.length >= 8, 'manualJohan source should load Johan-provided events');
  assert(manual.events.some(e => e.title === 'Tu comprendras quand tu seras grand' && e.startDate.startsWith('2026-10-25T11:00:00')), 'manualJohan should include theatre programme OCR/official entries');
  assert(manual.events.every(e => e.source === 'manualJohan' && e.url.startsWith('manual://johan/')), 'manualJohan events should have stable manual URLs');
  assert(manual.events.some(e => e.confidenceStatus === 'confirmed' && e.officialSources.length), 'manualJohan confirmed entries should carry official-source provenance');
  assert(manual.events.some(e => e.confidenceStatus === 'needs_review'), 'manualJohan uncertain OCR entries should remain needs_review');
  const manualNeedsReview = manual.events.find(e => e.confidenceStatus === 'needs_review' && e.startDate);
  assert.strictEqual(rejectionReason(manualNeedsReview, { start: manualNeedsReview.startDate.slice(0, 10), endExclusive: '2099-01-01' }), 'manual_needs_review');
  const officialWebDuplicate = normalizeEvent({ source: 'theatreOfficialFixture', title: 'Tu comprendras quand tu seras grand', startDate: '2026-10-25T11:00:00+01:00', city: 'Neuchâtel', locationText: 'Théâtre du Passage, Neuchâtel', url: 'https://www.theatredupassage.ch/abonnements/passdecouverte/passfamille', ageText: 'Dès 6 ans', description: 'Fixture officielle' });
  const duplicateManual = manual.events.find(e => e.title === officialWebDuplicate.title && e.startDate === officialWebDuplicate.startDate);
  assert.strictEqual(canonicalRecommendationPool([duplicateManual, officialWebDuplicate])[0].source, 'theatreOfficialFixture', 'official web sources should win recommendation dedupe over manual OCR/DB entries');
  const candidates = loadPrioritizedSourceCandidates();
  assert(candidates.diagnostics.topCandidates.some(s => /passage/i.test(s.name)), 'source candidates should include Théâtre du Passage');
  assert(candidates.diagnostics.topCandidates.some(s => /pommier/i.test(s.name)), 'source candidates should include Le Pommier');
  assert(candidates.diagnostics.topCandidates.some(s => /Benno Besson/i.test(s.name)), 'source candidates should include Théâtre Benno Besson');
  assert(candidates.diagnostics.topCandidates.some(s => /Échandole|Echandole/i.test(s.name)), 'source candidates should include L’Échandole');
  console.log(`[TEST] fixture/date/source-probe tests passed (${fixtures.length} fixtures)`);
}

async function main() {
  if (process.argv.includes('--fixture-test')) { runFixtureTests(); return; }
  const windowArg = process.argv.find(a => a.startsWith('--window='));
  const window = windowArg ? (() => { const [start, endExclusive] = windowArg.split('=')[1].split(':'); return { start, endExclusive }; })() : nextWeekendWindow(new Date());
  const { events, sourceLogs } = await collectAll();
  const normalized = events.filter(e => e && e.id);
  const recommendationPool = canonicalRecommendationPool(normalized);
  const rejected = [];
  const accepted = [];
  for (const e of recommendationPool) {
    const reason = rejectionReason(e, window);
    if (reason) rejected.push({ reason, event: e }); else accepted.push(e);
  }
  const scored = accepted.map(event => ({ event, score: scoreEvent(event, window) })).sort((a,b) => b.score.total - a.score.total);
  const quality = inspectQuality(normalized, accepted, rejected, sourceLogs);
  const summary = telegramSummary(scored, window);
  const reviewQueue = eventReviewQueue(scored, window);

  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(process.cwd(), 'automation', 'out', `v02-${now}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'event-reviews'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'fetch-log.json'), JSON.stringify(sourceLogs, null, 2));
  fs.writeFileSync(path.join(outDir, 'normalized-events.json'), JSON.stringify({ generatedAt: new Date().toISOString(), window, count: normalized.length, events: normalized }, null, 2));
  fs.writeFileSync(path.join(outDir, 'quality-inspection.json'), JSON.stringify(quality, null, 2));
  fs.writeFileSync(path.join(outDir, 'scored-events.json'), JSON.stringify({ window, count: scored.length, scored }, null, 2));
  fs.writeFileSync(path.join(outDir, 'event-review-queue.json'), JSON.stringify(reviewQueue, null, 2));
  fs.writeFileSync(path.join(outDir, 'event-reviews', 'TODO.md'), eventReviewQueueMarkdown(reviewQueue));
  fs.writeFileSync(path.join(outDir, 'telegram-summary.txt'), summary + '\n');
  fs.writeFileSync(path.join(outDir, 'errors.log'), sourceLogs.filter(s => s.status === 'error').map(s => `${s.source}: ${s.error}`).join('\n'));

  console.log(`Saved artifacts: ${outDir}`);
  console.log(`Raw=${quality.counts.raw} Accepted=${quality.counts.accepted} Rejected=${quality.counts.rejected} Duplicates=${quality.counts.duplicates}`);
  console.log(`Quality: dates=${quality.acceptedQuality.withDatePct}% locations=${quality.acceptedQuality.withLocationPct}% urls=${quality.acceptedQuality.withUrlPct}%`);
  console.log(`Dedicated reviews required before send: ${reviewQueue.count} event(s). See ${path.join(outDir, 'event-reviews', 'TODO.md')}`);
  console.log('\n--- Telegram summary preview (draft, not send-ready) ---\n' + summary);
  if (!sourceLogs.some(s => s.status === 'ok' && s.count > 0)) process.exitCode = 2;
  if (!accepted.length) process.exitCode = 3;
}

if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });

module.exports = { parseFrenchDate, parseInfomaniakDateRange, normalizeEvent, rejectionReason, scoreEvent, telegramSummary, eventReviewQueue, canonicalRecommendationPool, loadManualJohanEvents, loadPrioritizedSourceCandidates, extractGrandsonCalendarOccurrences, parseGrandsonDetail, scrapeGrandson, scrapeYverdon, scrapeInfomaniakYverdon, extractAgendaChProfiles, scrapeAgendaCh, extractLaDeriveeApiToken, parseLaDeriveeEvent, scrapeLaDerivee, parseOrbeEvent, scrapeOrbe, extractVallorbeListings, parseVallorbeDetail, scrapeVallorbe, extractTempsLibreListings, parseTempsLibreDetail, scrapeTempsLibre, extractTheatreDuPassageFamilyListings, parseTheatreDuPassageDetail, scrapeTheatreDuPassage };
