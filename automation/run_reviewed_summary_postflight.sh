#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/isaak/.openclaw/workspace/kids-activities"
LOG_DIR="$ROOT/automation/logs"
mkdir -p "$LOG_DIR"

cd "$ROOT"

{
  echo "=== $(date -Is) kids activities reviewed summary postflight ==="
  /usr/bin/node automation/reviewed_summary_postflight.js \
    --send \
    --max-age-hours=4 \
    --channel=telegram \
    --target=-1003706257133 \
    --alert-on-blocker \
    --alert-channel=telegram \
    --alert-target=8589279354
  echo "=== $(date -Is) postflight finished ==="
} >> "$LOG_DIR/reviewed-summary-postflight.log" 2>&1
