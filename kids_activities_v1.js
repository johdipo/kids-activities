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
  }
};

const TAG_FR = {
  animals: 'animaux', nature: 'nature', outdoor: 'plein air', walk: 'balade', discovery: 'découverte',
  culture: 'culture', indoor: 'intérieur', science: 'science', food: 'food/cuisine', cosy: 'cosy',
  sport: 'sport', water: 'eau', mountain: 'montagne'
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
  const html = await fetchHtml(SOURCES.yverdon.url, 35000);
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

function rejectionReason(e, window) {
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
  const bits = [e.url && 'URL', e.startDate && 'date', (e.locationText || e.city) && 'lieu', e.description && 'description', e.priceText && 'prix'].filter(Boolean);
  return { score: Math.min(15, bits.length * 3), evidence: bits, reason: bits.length ? `infos présentes: ${bits.join(', ')}` : 'détails pratiques pauvres' };
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
function telegramSummary(scored, window) {
  const candidates = scored.filter(x => x.score.total >= 60);
  const top = candidates.filter(x => x.score.label === 'recommandé').concat(candidates.filter(x => x.score.label !== 'recommandé')).slice(0, 5);
  if (!top.length) return `Idées famille pour ce week-end — ${frWindow(window)}\n\nAucune recommandation fiable: les sources ont été collectées, mais rien ne passe les filtres date/lieu/qualité.`;
  const lines = [`Idées famille pour ce week-end — ${frWindow(window)}`, `Sélection sourcée autour d’Yverdon, à vérifier avant de partir.`];
  return lines.concat(top.map(({event:e, score}, i) =>
    `${i+1}. ${e.title}\n` +
    `📅 ${frDate(e.startDate)}\n` +
    `📍 ${e.locationText || e.city}\n` +
    `Pourquoi: ${(score.reasons && score.reasons.length) ? score.reasons.join(' · ') : fitReason(e)}. Score ${score.total}/100 — ${score.label}.\n` +
    `À vérifier: ${practicalCaveat(score.caveats && score.caveats.length ? score.caveats : [caveat(e)])}\n` +
    `${e.url}`
  )).join('\n\n');
}

async function collectAll() {
  const sourceLogs = [];
  const out = [];
  for (const [source, fn] of Object.entries({ grandson: scrapeGrandson, yverdon: scrapeYverdon, infomaniakYverdon: scrapeInfomaniakYverdon })) {
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
  assert.deepStrictEqual(parseInfomaniakDateRange('Du vendredi 22 au samedi 23 mai', 2026), { startDate: '2026-05-22', endDate: '2026-05-23' });
  assert.strictEqual(parseInfomaniakDateRange('Dimanche 24 mai - 13h30', 2026).startDate, '2026-05-24T13:30:00+02:00');
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

module.exports = { parseFrenchDate, parseInfomaniakDateRange, normalizeEvent, rejectionReason, scoreEvent, telegramSummary, scrapeGrandson, scrapeYverdon, scrapeInfomaniakYverdon };
