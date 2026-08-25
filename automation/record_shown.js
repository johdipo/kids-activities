#!/usr/bin/env node
/*
 * Kids Activities — record shown events for anti-repetition (TASK-231).
 *
 * Reads the shortlist that was actually sent (event-review-queue.json of a run dir)
 * and records each event's signature into automation/state/shown-events.json so the
 * next run won't re-propose it (see shownSignaturesWithin / recordShownEvents).
 *
 * Called by run_reviewed_summary.sh AFTER a successful Telegram send (and NOT on
 * DRY_RUN), so only genuinely delivered events are marked as shown.
 *
 * Usage: node automation/record_shown.js --run-dir=<path-to-v02-dir>
 */
const fs = require('fs');
const path = require('path');
const { recordShownEvents } = require('../kids_activities_v1.js');

function latestRunDir() {
  const outDir = path.resolve(__dirname, 'out');
  const dirs = fs.readdirSync(outDir)
    .filter(n => n.startsWith('v02-'))
    .filter(n => fs.statSync(path.join(outDir, n)).isDirectory())
    .sort();
  if (!dirs.length) throw new Error('no v02 run dir found');
  return path.join(outDir, dirs[dirs.length - 1]);
}

function main() {
  const arg = process.argv.find(a => a.startsWith('--run-dir='));
  const runDir = arg ? path.resolve(arg.split('=')[1]) : latestRunDir();
  const queuePath = path.join(runDir, 'event-review-queue.json');
  if (!fs.existsSync(queuePath)) throw new Error(`missing event-review-queue.json in ${runDir}`);
  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  const events = (queue.events || []).map(e => ({ title: e.title, source: e.source, id: e.id }));
  if (!events.length) { console.log(JSON.stringify({ ok: true, recorded: 0, runDir })); return; }
  recordShownEvents(events);
  console.log(JSON.stringify({ ok: true, recorded: events.length, runDir }, null, 2));
}

if (require.main === module) {
  try { main(); } catch (err) { console.error(err.stack || err.message); process.exit(1); }
}
