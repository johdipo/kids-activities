#!/usr/bin/env bash
#
# Kids Activities — MORNING prepare step (token-consuming) of the split reviewed summary.
#
# Decouples the TASK-231 LLM re-rank (which runs inside the collect step) from the
# evening delivery, so the Claude token cost lands in the 00:00-12:00 low-load window
# instead of at 18:00. Produces a fully rendered digest + a pointer file that the
# evening send script (send_prepared_summary.sh) consumes. NO send happens here.
#
# Pipeline: fixture-test -> collect (incl. LLM re-rank) -> monitor gate ->
# consolidate --from-queue -> verify summary -> write .prepared-latest.json pointer.
# Any failure alerts Ops privately and exits non-zero so the cron failureAlert fires.
#
set -euo pipefail

ROOT="/home/isaak/.openclaw/workspace/kids-activities"
ALERT="8589279354"              # Ops private DM (blocker alerts)
OPENCLAW_BIN="${OPENCLAW_BIN:-/home/isaak/.npm-global/bin/openclaw}"
[ -x "$OPENCLAW_BIN" ] || OPENCLAW_BIN="openclaw"
POINTER="$ROOT/automation/out/.prepared-latest.json"

cd "$ROOT"

log() { echo "[prepare_reviewed_summary $(date -u +%FT%TZ)] $*" >&2; }

alert_and_die() {
  local msg="$1"
  log "FAILED: $msg"
  "$OPENCLAW_BIN" message send --channel telegram --target "$ALERT" \
    --message "⚠️ Résumé Activités en famille — préparation matinale échouée: ${msg}" >&2 2>&1 || \
    log "(alert send itself failed)"
  exit 1
}

log "step 1/4 fixture-test"
node kids_activities_v1.js --fixture-test >&2 || alert_and_die "fixture-test failed"

log "step 2/4 collect (live pipeline run, incl. TASK-231 LLM re-rank)"
node kids_activities_v1.js >&2 || alert_and_die "pipeline collect failed"

# Newest run dir (v02-<ISO> names sort lexically = chronologically).
RUNDIR="$(ls -d automation/out/v02-* 2>/dev/null | sort | tail -1)"
[ -n "$RUNDIR" ] && [ -d "$RUNDIR" ] || alert_and_die "no v02 run dir after collect"
log "run dir: $RUNDIR"

log "step 3/4 monitor quality gate"
node automation/monitor_v02.js --run-dir="$RUNDIR" >&2 || alert_and_die "monitor quality gate failed for $RUNDIR"

log "step 4/4 consolidate (deterministic, from queue)"
node automation/consolidate_reviews.js --from-queue --run-dir="$RUNDIR" >&2 || alert_and_die "consolidate failed for $RUNDIR"

SUMMARY="$RUNDIR/telegram-summary-reviewed.txt"
[ -s "$SUMMARY" ] || alert_and_die "reviewed summary empty/missing: $SUMMARY"

# Write the pointer the evening send script consumes. preparedDateLocal is the
# Europe/Zurich calendar day; the evening script refuses to send a stale prep.
POINTER="$POINTER" RUNDIR="$RUNDIR" SUMMARY="$SUMMARY" \
PREP_DATE="$(TZ=Europe/Zurich date +%F)" node -e '
  const fs = require("fs");
  fs.writeFileSync(process.env.POINTER, JSON.stringify({
    runDir: process.env.RUNDIR,
    summaryFile: process.env.SUMMARY,
    preparedAt: new Date().toISOString(),
    preparedDateLocal: process.env.PREP_DATE,
    tz: "Europe/Zurich",
    method: "prepare_reviewed_summary.sh"
  }, null, 2) + "\n");
' || alert_and_die "failed to write pointer: $POINTER"

log "done — prepared $RUNDIR for evening send (pointer: $POINTER)"
exit 0
