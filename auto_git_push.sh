#!/usr/bin/env bash
# auto_git_push.sh
# 由 launchd 每 5 分鐘呼叫，偵測週報_*.html 有未推送變動時自動 commit + push
#
# 設計原則：
#   - 冪等：沒有變動時靜默結束，不報錯
#   - 只處理週報相關檔案，不碰其他變動
#   - 日誌寫入 auto_push.log（保留最後 500 行）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$SCRIPT_DIR/auto_push.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

cd "$SCRIPT_DIR"

# ── 確認是 git repo ──────────────────────────────────────────────────────────
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  log "ERROR: 不是 git repo，跳過"
  exit 0
fi

# ── 確認有未 commit 或 untracked 的週報 HTML ─────────────────────────────────
CHANGED=$(git status --porcelain | grep -E 'report-.*\.html' || true)

if [[ -z "$CHANGED" ]]; then
  # 靜默結束，什麼都不做
  exit 0
fi

log "偵測到變動：$(echo "$CHANGED" | tr '\n' ' ')"

# ── Git 使用者設定（若全域未設定）──────────────────────────────────────────
git config user.email 2>/dev/null || git config user.email "agent@iclarityvision.com"
git config user.name  2>/dev/null || git config user.name  "Claude Agent"

# ── Stage 週報檔案 ───────────────────────────────────────────────────────────
git add report-*.html report-*.md 2>/dev/null || true

if git diff --cached --quiet; then
  log "無 staged 內容（可能已 commit），直接嘗試 push"
else
  # 取得上週週次作為 commit message
  WEEK_LABEL=$(python3 -c "
from datetime import date, timedelta
today = date.today()
last_monday = today - timedelta(days=today.weekday() + 7)
week_num = last_monday.isocalendar()[1]
print(f'W{week_num:02d}')
" 2>/dev/null || echo "W??")

  git commit -m "週報 ${WEEK_LABEL}：自動更新"
  log "Commit 完成：週報 ${WEEK_LABEL}"
fi

# ── Push ──────────────────────────────────────────────────────────────────────
if git push 2>>"$LOG"; then
  log "Push 成功"
else
  log "ERROR: Push 失敗，請檢查網路或 git 認證"
  exit 1
fi

# ── 保留日誌最後 500 行 ──────────────────────────────────────────────────────
tail -500 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
