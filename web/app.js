'use strict';

const DATA_URL = './data/recommendations-index.json';

const $ = (id) => document.getElementById(id);
const fmtDate = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtRelative = new Intl.RelativeTimeFormat('fr-CH', { numeric: 'auto' });

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch (_) {
    return '';
  }
}

function humanWindow(window) {
  if (!window || !window.start) return 'Fenêtre inconnue';
  const start = new Date(`${window.start}T12:00:00Z`);
  const end = window.endExclusive ? new Date(`${window.endExclusive}T12:00:00Z`) : null;
  if (end) end.setUTCDate(end.getUTCDate() - 1);
  return end ? `${fmtDay.format(start)} → ${fmtDay.format(end)}` : fmtDay.format(start);
}

function ageOf(iso) {
  if (!iso) return 'dernière revue inconnue';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return 'dernière revue inconnue';
  const hours = Math.round(diffMs / 36e5);
  if (Math.abs(hours) < 36) return fmtRelative.format(-hours, 'hour');
  return fmtRelative.format(-Math.round(hours / 24), 'day');
}

function verdictClass(verdict) {
  return {
    recommended: 'ok',
    secondary: 'warn',
    rejected: 'bad',
    unknown: 'muted',
  }[verdict] || 'muted';
}

function dateLine(activity) {
  if (!activity.startDate) return '';
  const d = new Date(activity.startDate);
  if (Number.isNaN(d.getTime())) return escapeHtml(activity.startDate);
  return fmtDate.format(d).replace(',', '');
}

function renderActivity(activity, options = {}) {
  const url = safeUrl(activity.url);
  const official = (activity.officialSources || []).map(safeUrl).filter(Boolean);
  const sourceLinks = [url, ...official.filter((u) => u !== url)].slice(0, 3);
  const tags = (activity.tags || []).slice(0, 5).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join('');
  const reasons = (activity.reasons || []).slice(0, 3).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
  const caveats = (activity.caveats || []).slice(0, 3).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
  const score = Number.isFinite(activity.score) ? `<span class="score">${activity.score}/100</span>` : '';
  const summary = activity.summary || activity.description || '';

  return `
    <article class="activity-card ${options.compact ? 'compact' : ''}">
      <div class="card-topline">
        <span class="badge ${verdictClass(activity.verdict)}">${escapeHtml(activity.verdictLabel || 'Non vérifié')}</span>
        ${score}
      </div>
      <h3>${escapeHtml(activity.title || 'Activité sans titre')}</h3>
      <div class="event-meta">
        ${dateLine(activity) ? `<span>🗓️ ${dateLine(activity)}</span>` : ''}
        ${activity.location ? `<span>📍 ${escapeHtml(activity.location)}</span>` : ''}
        ${activity.ageText ? `<span>👧 ${escapeHtml(activity.ageText)}</span>` : ''}
        ${activity.priceText ? `<span>🎟️ ${escapeHtml(activity.priceText)}</span>` : ''}
      </div>
      ${summary ? `<p class="summary">${escapeHtml(summary)}</p>` : ''}
      ${tags ? `<div class="tag-row">${tags}</div>` : ''}
      <div class="provenance">
        <strong>Source:</strong> ${escapeHtml(activity.sourceLabel || activity.sourceKey || 'source inconnue')}
        ${activity.confidenceStatus ? ` · <span>${escapeHtml(activity.confidenceStatus)}</span>` : ''}
        ${activity.provenanceNote ? `<br><span>${escapeHtml(activity.provenanceNote)}</span>` : ''}
      </div>
      ${reasons ? `<details><summary>Pourquoi proposé</summary><ul>${reasons}</ul></details>` : ''}
      ${caveats ? `<details><summary>À vérifier</summary><ul>${caveats}</ul></details>` : ''}
      ${sourceLinks.length ? `<div class="actions">${sourceLinks.map((u, i) => `<a href="${escapeHtml(u)}" target="_blank" rel="noreferrer">${i === 0 ? 'Page source' : 'Source officielle'}</a>`).join('')}</div>` : ''}
    </article>`;
}

function renderProgramItem(item) {
  const nextDate = item.dates && item.dates[0] ? new Date(item.dates[0]) : null;
  const date = nextDate && !Number.isNaN(nextDate.getTime()) ? fmtDate.format(nextDate).replace(',', '') : (item.dates || [])[0] || '';
  const url = (item.officialSources || []).map(safeUrl).find(Boolean);
  return `
    <article class="activity-card compact program-card">
      <div class="card-topline"><span class="badge ok">Confirmé</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <div class="event-meta">
        ${date ? `<span>🗓️ ${escapeHtml(date)}</span>` : ''}
        ${item.venue || item.city ? `<span>📍 ${escapeHtml([item.venue, item.city].filter(Boolean).join(', '))}</span>` : ''}
        ${item.ageText ? `<span>👧 ${escapeHtml(item.ageText)}</span>` : ''}
      </div>
      <div class="provenance">${escapeHtml(item.provenanceNote || 'Confirmé via source officielle')}</div>
      ${url ? `<div class="actions"><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Source officielle</a></div>` : ''}
    </article>`;
}

function renderPastDigest(digest) {
  const activities = (digest.activities || []).filter((a) => ['recommended', 'secondary'].includes(a.verdict)).slice(0, 4);
  return `
    <details class="past-digest">
      <summary>
        <strong>${humanWindow(digest.window)}</strong>
        <span>${digest.counts?.recommended || 0} recommandé · ${digest.counts?.secondary || 0} secondaire · export ${escapeHtml(digest.runId || '')}</span>
      </summary>
      <div class="card-grid past-grid">${activities.map((a) => renderActivity(a, { compact: true })).join('')}</div>
    </details>`;
}

function renderSources(data) {
  const sourceCounts = new Map();
  const digests = [data.upcoming, ...(data.past || [])].filter(Boolean);
  for (const digest of digests) {
    for (const activity of digest.activities || []) {
      const key = activity.sourceLabel || activity.sourceKey || 'Source inconnue';
      sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
    }
  }
  for (const item of data.confirmedProgram || []) {
    sourceCounts.set('Saisie manuelle / sources officielles', (sourceCounts.get('Saisie manuelle / sources officielles') || 0) + 1);
  }
  $('sources-freshness').textContent = `${data.freshness?.reviewedRunsExported || 0} fenêtres reviewées exportées · dernier run ${data.freshness?.latestRunId || 'inconnu'}.`;
  $('sources-list').innerHTML = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `<li><span>${escapeHtml(name)}</span><strong>${count}</strong></li>`).join('');
  $('sources-section').hidden = sourceCounts.size === 0;
}

function render(data) {
  $('app-title').textContent = data.app?.title || 'Kids Activities';
  $('app-subtitle').textContent = data.app?.subtitle || '';
  $('app-region').textContent = data.app?.region || 'Région inconnue';
  $('freshness').textContent = `Export ${ageOf(data.generatedAt)}`;
  $('disclaimer').textContent = data.app?.disclaimer || '';

  const upcoming = data.upcoming;
  $('upcoming-window').textContent = upcoming ? humanWindow(upcoming.window) : 'Aucune fenêtre';
  const visibleUpcoming = (upcoming?.activities || []).filter((a) => ['recommended', 'secondary'].includes(a.verdict));
  $('upcoming-empty').hidden = visibleUpcoming.length > 0;
  $('upcoming-list').innerHTML = visibleUpcoming.map((a) => renderActivity(a)).join('');

  const program = (data.confirmedProgram || []).slice(0, 12);
  $('program-section').hidden = program.length === 0;
  $('program-list').innerHTML = program.map(renderProgramItem).join('');

  const past = data.past || [];
  $('past-section').hidden = past.length === 0;
  $('past-list').innerHTML = past.slice(0, 6).map(renderPastDigest).join('');

  renderSources(data);
  $('loading').hidden = true;
  $('content').hidden = false;
}

async function boot() {
  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const data = await response.json();
    render(data);
  } catch (error) {
    $('loading').hidden = true;
    $('error-detail').textContent = error.message || String(error);
    $('error').hidden = false;
  }
}

boot();
