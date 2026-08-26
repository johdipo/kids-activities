#!/usr/bin/env bash
#
# Kids Activities — EVENING send step (0 token) of the split reviewed summary.
#
# Reads the pointer written by the morning prepare_reviewed_summary.sh and sends the
# already-rendered digest to the family Telegram group. No LLM, no scraping — pure
# delivery. Refuses to send a stale prep (must be prepared on today's Europe/Zurich
# date, i.e. the morning prepare succeeded). Any failure alerts Ops and exits non-zero
# so the cron failureAlert fires.
#
set -euo pipefail

ROOT="/home/isaak/.openclaw/workspace/kids-activities"
GROUP="-1003706257133"          # Activités en famille (family group)
ALERT="8589279354"              # Ops private DM (blocker alerts)
OPENCLAW_BIN="${OPENCLAW_BIN:-/home/isaak/.npm-global/bin/openclaw}"
[ -x "$OPENCLAW_BIN" ] || OPENCLAW_BIN="openclaw"
POINTER="$ROOT/automation/out/.prepared-latest.json"

cd "$ROOT"

log() { echo "[send_prepared_summary $(date -u +%FT%TZ)] $*" >&2; }

alert_and_die() {
  local msg="$1"
  log "FAILED: $msg"
  "$OPENCLAW_BIN" message send --channel telegram --target "$ALERT" \
    --message "⚠️ Résumé Activités en famille NON envoyé (send): ${msg}" >&2 2>&1 || \
    log "(alert send itself failed)"
  exit 1
}

[ -f "$POINTER" ] || alert_and_die "no prepared pointer ($POINTER) — did the morning prepare run?"

# Parse pointer fields (paths have no spaces).
read -r RUNDIR SUMMARY PREP_DATE < <(POINTER="$POINTER" node -e '
  const fs = require("fs");
  const p = JSON.parse(fs.readFileSync(process.env.POINTER, "utf8"));
  process.stdout.write([p.runDir || "", p.summaryFile || "", p.preparedDateLocal || ""].join(" ") + "\n");
') || alert_and_die "cannot parse pointer $POINTER"

TODAY="$(TZ=Europe/Zurich date +%F)"
[ -n "$RUNDIR" ] && [ -d "$RUNDIR" ] || alert_and_die "prepared run dir missing: $RUNDIR"
[ "$PREP_DATE" = "$TODAY" ] || alert_and_die "stale prep: prepared '$PREP_DATE', today '$TODAY' (morning prepare likely failed)"
[ -s "$SUMMARY" ] || alert_and_die "prepared summary empty/missing: $SUMMARY"

MSG="$(cat "$SUMMARY")"

# DRY_RUN=1 → preview to the Ops DM instead of the family group; no sentinel, and
# bypasses the idempotence check so it is always testable.
if [ "${DRY_RUN:-0}" = "1" ]; then
  log "DRY_RUN=1 — preview to $ALERT, no family send, no sentinel"
  "$OPENCLAW_BIN" message send --channel telegram --target "$ALERT" \
    --message "[DRY-RUN résumé Activités en famille — $RUNDIR]
$MSG" >&2 || alert_and_die "dry-run preview send failed"
  log "dry-run done"
  exit 0
fi

# Idempotence: never re-send for a run dir already delivered.
SENTINEL="$RUNDIR/telegram-summary-reviewed.sent.json"
if [ -f "$SENTINEL" ]; then
  log "already sent for $RUNDIR (sentinel present) — skipping send"
  exit 0
fi

log "send to family group $GROUP"
"$OPENCLAW_BIN" message send --channel telegram --target "$GROUP" --message "$MSG" >&2 \
  || alert_and_die "telegram send to family group failed"

SENTINEL="$SENTINEL" GROUP="$GROUP" node -e '
  const fs = require("fs");
  fs.writeFileSync(process.env.SENTINEL, JSON.stringify({
    sentAt: new Date().toISOString(),
    channel: "telegram",
    target: process.env.GROUP,
    method: "send_prepared_summary.sh",
    mode: "prepared-split"
  }, null, 2) + "\n");
' || alert_and_die "sent but failed to write sentinel: $SENTINEL"

# TASK-231 anti-repetition: record the events we just sent. Non-fatal.
log "post-send: record shown events (anti-repetition)"
node automation/record_shown.js --run-dir="$RUNDIR" >&2 || log "(record_shown failed — continuing; digest already sent)"

log "done — prepared summary sent and sentinel written: $SENTINEL"
exit 0
