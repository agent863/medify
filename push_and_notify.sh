#!/usr/bin/env bash
# push_and_notify.sh
# 週報發布腳本：git push 後自動寄送通知信
#
# 用法：
#   bash push_and_notify.sh               # 自動偵測本週次
#   bash push_and_notify.sh --week W21    # 指定週次
#   bash push_and_notify.sh --dry-run     # 測試模式（不實際 push 或發信）
#
# 環境變數：
#   SMTP_PASSWORD   Gmail App Password（必填，否則發信失敗）
#   SMTP_USER       寄件信箱（選填，預設 agent@iclarityvision.com）

set -euo pipefail

# ─── 參數解析 ──────────────────────────────────────────────────────────────────
WEEK_ARG=""
DRY_RUN=false
SKIP_BQ=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --week)    WEEK_ARG="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --skip-bq) SKIP_BQ=true; shift ;;    # 略過 BQ 查詢（BQ 未設定時使用）
    *) echo "未知參數：$1"; exit 1 ;;
  esac
done

# ─── 路徑設定 ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMAIL_SCRIPT="$SCRIPT_DIR/send_report_email.py"
BQ_SCRIPT="$SCRIPT_DIR/run_post_view_queries.py"

# ─── 步驟 0：執行 post_view BigQuery 查詢 ─────────────────────────────────────
if $SKIP_BQ; then
  echo "⏭️  略過 BigQuery 查詢（--skip-bq）"
elif [[ -z "${BQ_PROJECT:-}" ]]; then
  echo "⚠️  BQ_PROJECT 未設定，略過 post_view 查詢。"
  echo "   若要啟用，請先執行："
  echo "   export BQ_PROJECT='your-gcp-project-id'"
  echo "   export BQ_DATASET='analytics_XXXXXXXXX'"
else
  echo "📊 執行 post_view 查詢..."
  BQ_ARGS=()
  [[ -n "$WEEK_ARG" ]] && BQ_ARGS+=("--week" "$WEEK_ARG")
  $DRY_RUN && BQ_ARGS+=("--dry-run")

  python3 "$BQ_SCRIPT" "${BQ_ARGS[@]}" || {
    echo "⚠️  post_view 查詢失敗（見上方錯誤），繼續執行發布流程..."
  }
  echo ""
fi

# ─── 確認 git repo ────────────────────────────────────────────────────────────
cd "$SCRIPT_DIR"

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  echo "❌ 目前目錄不是 git repository：$SCRIPT_DIR"
  exit 1
fi

# ─── 確認有可提交的週報 HTML ──────────────────────────────────────────────────
HTML_FILES=$(git status --short | grep 'report-.*\.html' | wc -l | tr -d ' ')

if [[ "$HTML_FILES" -eq 0 ]]; then
  echo "ℹ️  沒有新的週報 HTML 檔案需要提交，檢查是否已推送？"
  # 仍繼續發信（若報告已在線上更新）
else
  echo "📁 發現 $HTML_FILES 個週報 HTML 待提交"
fi

# ─── Git 操作 ─────────────────────────────────────────────────────────────────
if $DRY_RUN; then
  echo "── DRY RUN MODE ── 跳過 git 操作"
else
  # 僅 stage 週報相關檔案（避免意外提交其他變更）
  git add report-*.html report-*.md 2>/dev/null || true

  # 取得本週次 label（Python 腳本相同邏輯）
  WEEK_LABEL="${WEEK_ARG:-$(python3 -c "
from datetime import date, timedelta
today = date.today()
last_monday = today - timedelta(days=today.weekday() + 7)
week_num = last_monday.isocalendar()[1]
print(f'W{week_num:02d}')
")}"

  COMMIT_MSG="週報 ${WEEK_LABEL}：自動更新"

  # 若沒有 staged 變更則跳過 commit
  if git diff --cached --quiet; then
    echo "ℹ️  無新增 staged 內容，略過 commit（若週報已提交則直接 push）"
  else
    echo "📝 Commit：$COMMIT_MSG"
    git commit -m "$COMMIT_MSG"
  fi

  echo "🚀 git push..."
  git push
  echo "✅ Push 完成"
fi

# ─── 發送通知信 ───────────────────────────────────────────────────────────────
echo ""
echo "📨 執行發信腳本..."

PYTHON_ARGS=()
[[ -n "$WEEK_ARG" ]] && PYTHON_ARGS+=("--week" "$WEEK_ARG")
$DRY_RUN && PYTHON_ARGS+=("--dry-run")

python3 "$EMAIL_SCRIPT" "${PYTHON_ARGS[@]}"

echo ""
echo "🎉 完成！"
