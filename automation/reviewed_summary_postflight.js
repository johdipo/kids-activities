#!/usr/bin/env node
/*
 * Deterministic postflight guard for Kids Activities reviewed summaries.
 *
 * The daily reviewed workflow is agent-driven because per-event reviews need web/source judgement.
 * This guard is deliberately boring: if all review files exist, it consolidates them if needed,
 * refuses raw drafts, and sends exactly telegram-summary-reviewed.txt once.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { consolidate } = require('./consolidate_reviews');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'automation', 'out');
const DEFAULT_TARGET = '-1003706257133';
const DEFAULT_CHANNEL = 'telegram';

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

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

function runAgeHours(runDir) {
  return (Date.now() - fs.statSync(runDir).mtimeMs) / 36e5;
}

function ensureFresh(runDir, maxAgeHours) {
  const age = runAgeHours(runDir);
  if (age > maxAgeHours) throw new Error(`latest run is too old (${age.toFixed(2)}h > ${maxAgeHours}h): ${runDir}`);
  return age;
}

function queueAndReviewsStatus(runDir) {
  const queuePath = path.join(runDir, 'event-review-queue.json');
  if (!fs.existsSync(queuePath)) throw new Error(`missing event-review-queue.json: ${queuePath}`);
  const queue = readJson(queuePath);
  const events = queue.events || [];
  if (!events.length) throw new Error(`event-review-queue.json has no events: ${queuePath}`);
  const reviewsDir = path.join(runDir, 'event-reviews');
  const missing = events
    .map(event => ({ event, file: path.join(reviewsDir, `${event.id}.md`) }))
    .filter(x => !fs.existsSync(x.file));
  return { queue, events, reviewsDir, missing };
}

function sendTelegram({ channel, target, message }) {
  const res = spawnSync('openclaw', ['message', 'send', '--channel', channel, '--target', target, '--message', message], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`openclaw message send failed (${res.status}): ${res.stderr || res.stdout}`);
  }
  return { stdout: res.stdout.trim(), stderr: res.stderr.trim() };
}

function appendLog(entry) {
  const line = JSON.stringify({ type: 'reviewed-summary-postflight', checkedAt: new Date().toISOString(), ...entry });
  fs.appendFileSync(path.join(OUT_DIR, 'monitor-log.jsonl'), line + '\n');
}

function main() {
  const runDir = path.resolve(argValue('--run-dir', latestRunDir()));
  const maxAgeHours = Number(argValue('--max-age-hours', '8'));
  const channel = argValue('--channel', DEFAULT_CHANNEL);
  const target = argValue('--target', DEFAULT_TARGET);
  const send = hasFlag('--send');
  const alertOnBlocker = hasFlag('--alert-on-blocker');
  const sentinelPath = path.join(runDir, 'telegram-summary-reviewed.sent.json');

  const result = { runDir, send, target, channel };
  try {
    result.ageHours = Number(ensureFresh(runDir, maxAgeHours).toFixed(2));
    const { events, missing } = queueAndReviewsStatus(runDir);
    result.queueCount = events.length;
    if (missing.length) {
      result.status = 'blocked_missing_reviews';
      result.missing = missing.map(x => x.event.id);
      throw new Error(`missing ${missing.length}/${events.length} event review files: ${result.missing.join(', ')}`);
    }

    const summaryPath = path.join(runDir, 'telegram-summary-reviewed.txt');
    const indexPath = path.join(runDir, 'event-reviews', 'INDEX.md');
    if (!fs.existsSync(summaryPath) || !fs.existsSync(indexPath)) {
      result.consolidated = consolidate(runDir);
    }

    if (!fs.existsSync(summaryPath)) throw new Error(`missing reviewed summary after consolidation: ${summaryPath}`);
    const message = fs.readFileSync(summaryPath, 'utf8').trim();
    if (!message) throw new Error(`empty reviewed summary: ${summaryPath}`);
    if (fs.existsSync(sentinelPath)) {
      result.status = 'already_sent';
      result.sentinel = sentinelPath;
      console.log(JSON.stringify(result, null, 2));
      appendLog(result);
      return;
    }

    if (!send) {
      result.status = 'ready_not_sent_dry_run';
      result.summaryPath = summaryPath;
      console.log(JSON.stringify(result, null, 2));
      appendLog(result);
      return;
    }

    const delivery = sendTelegram({ channel, target, message });
    fs.writeFileSync(sentinelPath, JSON.stringify({ sentAt: new Date().toISOString(), channel, target, delivery }, null, 2) + '\n');
    result.status = 'sent';
    result.summaryPath = summaryPath;
    result.sentinel = sentinelPath;
    console.log(JSON.stringify(result, null, 2));
    appendLog(result);
  } catch (err) {
    result.status = result.status || 'blocked';
    result.error = err.message;
    appendLog(result);
    if (alertOnBlocker) {
      const alert = `⚠️ Résumé Activités en famille non envoyé automatiquement: ${err.message}\nArtefact: ${runDir}`;
      try { result.alertDelivery = sendTelegram({ channel, target, message: alert }); } catch (alertErr) { result.alertError = alertErr.message; }
    }
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

if (require.main === module) main();
