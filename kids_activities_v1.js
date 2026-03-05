#!/usr/bin/env node
/* V1 - collecte multi-sources + normalisation */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const SOURCES = {
  agenda: 'https://www.agenda.ch/',
  yverdon: 'https://yverdonlesbainsregion.ch/agenda/',
  grandson: 'https://www.grandson.ch/vie-locale/agenda-des-manifestations/'
};

function clean(s='') { return s.replace(/\s+/g, ' ').trim(); }

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 OpenClaw/1.0' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return await res.text();
}

function genericExtract(html, sourceName, sourceUrl) {
  const $ = cheerio.load(html);
  const events = [];
  const seen = new Set();

  const blacklist = [
    'accueil', 'recherche rapide', 'physiothérapeute', 'ostéopathe', 'thérapeute', 'coach sportif',
    'institut', 'onglerie', 'épilation', 'massage', 'annuaire', 'contact', 'mentions', 'politique', 'cookies'
  ];

  const hasEventSignals = (text) => {
    const t = text.toLowerCase();
    return /(agenda|événement|manifestation|atelier|spectacle|festival|visite|marché|sortie|famille|enfant)/.test(t)
      || /(\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?)/.test(t)
      || /(samedi|dimanche|weekend|week-end)/.test(t);
  };

  // Candidate blocks commonly used on agenda pages
  const candidates = $('article, .event, .agenda-item, .tribe-events-event, li, .card, .post, .entry, .teaser');
  candidates.each((_, el) => {
    if (events.length >= 120) return;
    const node = $(el);
    const title = clean(node.find('h1,h2,h3,h4,.title,.event-title,a').first().text());
    if (!title || title.length < 6) return;

    const titleLc = title.toLowerCase();
    if (blacklist.some(w => titleLc.includes(w))) return;

    const link = node.find('a[href]').first().attr('href') || '';
    const absLink = link.startsWith('http') ? link : new URL(link || sourceUrl, sourceUrl).toString();
    const text = clean(node.text()).slice(0, 1000);

    if (!hasEventSignals(text)) return;

    // Weak date extraction for V1
    const dateMatch = text.match(/(\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?)/);
    const dateText = dateMatch ? dateMatch[1] : '';

    const key = `${title.toLowerCase()}|${absLink}`;
    if (seen.has(key)) return;
    seen.add(key);

    events.push({
      source: sourceName,
      title,
      dateText,
      locationText: '',
      url: absLink,
      rawSnippet: text,
      tags: [],
      priceText: '',
      ageText: ''
    });
  });

  return events;
}

async function collectAll() {
  const out = [];

  for (const [name, url] of Object.entries(SOURCES)) {
    try {
      const html = await fetchHtml(url);
      const items = genericExtract(html, name, url);
      out.push(...items);
      console.log(`[OK] ${name}: ${items.length} éléments`);
    } catch (e) {
      console.log(`[ERR] ${name}: ${e.message}`);
    }
  }

  // "Recherche web" V1 fallback: no Brave key in this environment.
  // We'll keep placeholder source entry so pipeline remains explicit.
  out.push({
    source: 'web-search-fallback',
    title: 'Source web search non active (clé Brave manquante)',
    dateText: '', locationText: 'N/A', url: '', rawSnippet: '', tags: ['todo'], priceText: '', ageText: ''
  });

  return out;
}

async function main() {
  const events = await collectAll();
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(process.cwd(), 'automation', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `events-v1-${now}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), count: events.length, events }, null, 2));
  console.log(`\nSaved: ${outFile}`);
  console.log(`Total: ${events.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
