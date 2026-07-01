#!/usr/bin/env bash
#
# Kids Activities — daily reviewed family summary (Saveur B / --command cron).
#
# Deterministic replacement for the old agentTurn cron (d9fefcaa) which failed
# every evening with NO_REPLY without running the pipeline (see TASK-224).
#
# Pipeline: fixture-test -> collect -> monitor gate -> deterministic consolidate
# (Option A, no per-event LLM review) -> send to the family Telegram group ->
# write an idempotence sentinel. Any failure alerts Ops privately and exits
# non-zero so the cron failureAlert also fires.
#
set -euo pipefail

ROOT="/home/isaak/.openclaw/workspace/kids-activities"
GROUP="-1003706257133"          # Activités en famille (family group)
ALERT="8589279354"              # Ops private DM (blocker alerts)
OPENCLAW_BIN="${OPENCLAW_BIN:-/home/isaak/.npm-global/bin/openclaw}"
[ -x "$OPENCLAW_BIN" ] || OPENCLAW_BIN="openclaw"

cd "$ROOT"

log() { echo "[run_reviewed_summary $(date -u +%FT%TZ)] $*" >&2; }

alert_and_die() {
  local msg="$1"
  log "FAILED: $msg"
  "$OPENCLAW_BIN" message send --channel telegram --target "$ALERT" \
    --message "⚠️ Résumé Activités en famille NON envoyé (cron --command): ${msg}" >&2 2>&1 || \
    log "(alert send itself failed)"
  exit 1
}

log "step 1/5 fixture-test"
node kids_activities_v1.js --fixture-test >&2 || alert_and_die "fixture-test failed"

log "step 2/5 collect (live pipeline run)"
node kids_activities_v1.js >&2 || alert_and_die "pipeline collect failed"

# Newest run dir (v02-<ISO> names sort lexically = chronologically).
RUNDIR="$(ls -d automation/out/v02-* 2>/dev/null | sort | tail -1)"
[ -n "$RUNDIR" ] && [ -d "$RUNDIR" ] || alert_and_die "no v02 run dir after collect"
log "run dir: $RUNDIR"

log "step 3/5 monitor quality gate"
node automation/monitor_v02.js --run-dir="$RUNDIR" >&2 || alert_and_die "monitor quality gate failed for $RUNDIR"

log "step 4/5 consolidate (deterministic, from queue)"
node automation/consolidate_reviews.js --from-queue --run-dir="$RUNDIR" >&2 || alert_and_die "consolidate failed for $RUNDIR"

SUMMARY="$RUNDIR/telegram-summary-reviewed.txt"
SENTINEL="$RUNDIR/telegram-summary-reviewed.sent.json"
[ -s "$SUMMARY" ] || alert_and_die "reviewed summary empty/missing: $SUMMARY"

# Idempotence: never re-send for a run dir already delivered today.
if [ -f "$SENTINEL" ]; then
  log "already sent for $RUNDIR (sentinel present) — skipping send"
  exit 0
fi

MSG="$(cat "$SUMMARY")"

# DRY_RUN=1 → send a preview to the Ops DM instead of the family group, and do
# not write the sentinel. For safe end-to-end testing only; defaults off.
if [ "${DRY_RUN:-0}" = "1" ]; then
  log "DRY_RUN=1 — redirecting preview to $ALERT, no send to family, no sentinel"
  "$OPENCLAW_BIN" message send --channel telegram --target "$ALERT" \
    --message "[DRY-RUN résumé Activités en famille — $RUNDIR]
$MSG" >&2 || alert_and_die "dry-run preview send failed"
  log "dry-run done"
  exit 0
fi

log "step 5/5 send to family group $GROUP"
"$OPENCLAW_BIN" message send --channel telegram --target "$GROUP" --message "$MSG" >&2 \
  || alert_and_die "telegram send to family group failed"

SENTINEL="$SENTINEL" GROUP="$GROUP" node -e '
  const fs = require("fs");
  fs.writeFileSync(process.env.SENTINEL, JSON.stringify({
    sentAt: new Date().toISOString(),
    channel: "telegram",
    target: process.env.GROUP,
    method: "run_reviewed_summary.sh",
    mode: "deterministic-from-queue"
  }, null, 2) + "\n");
' || alert_and_die "sent but failed to write sentinel: $SENTINEL"

log "done — summary sent and sentinel written: $SENTINEL"
exit 0
