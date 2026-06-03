#!/usr/bin/env bash
# auto_git_push.sh (doctor-report/)
# Called by launchd every 5 minutes. Detects new/modified report-*.html and auto commit + push.
#
# Design:
#   - Idempotent: exits silently when nothing has changed
#   - Only stages report HTML/MD files
#   - Logs to auto_push.log (keeps last 500 lines)

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$REPO/auto_push.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

cd "$REPO"

# ── Confirm git repo ─────────────────────────────────────────────────────────
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  log "ERROR: not a git repo, skipping"
  exit 0
fi

# ── Check for uncommitted report files ──────────────────────────────────────
CHANGED=$(git status --porcelain | grep -E 'report-.*\.html' || true)

if [[ -z "$CHANGED" ]]; then
  exit 0
fi

log "Changes detected: $(echo "$CHANGED" | tr '\n' ' ')"

# ── Git user config ──────────────────────────────────────────────────────────
git config user.email "agent@iclarityvision.com" 2>/dev/null || true
git config user.name  "Claude Agent" 2>/dev/null || true

# ── Stage report files ───────────────────────────────────────────────────────
git add report-*.html report-*.md 2>/dev/null || true

if git diff --cached --quiet; then
  log "Nothing staged (already committed), attempting push"
else
  WEEK_LABEL=$(python3 -c "
from datetime import date, timedelta
today = date.today()
last_monday = today - timedelta(days=today.weekday() + 7)
week_num = last_monday.isocalendar()[1]
print(f'W{week_num:02d}')
" 2>/dev/null || echo "W??")

  git commit -m "report ${WEEK_LABEL}: auto update"
  log "Committed: report ${WEEK_LABEL}"
fi

# ── Push ─────────────────────────────────────────────────────────────────────
if git push 2>>"$LOG"; then
  log "Push succeeded"
else
  log "ERROR: push failed — check network or git auth"
  exit 1
fi

# ── Trim log to last 500 lines ───────────────────────────────────────────────
tail -500 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
