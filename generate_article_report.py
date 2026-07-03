#!/usr/bin/env python3
"""
generate_article_report.py
Monthly HTML report for Doctor-10 article performance (last 30 days).

Usage:
  python generate_article_report.py                  # full run
  python generate_article_report.py --dry-run        # print SQL + generate sample HTML
  python generate_article_report.py --month M06      # override month label
  python generate_article_report.py --no-push        # skip git push
"""

import argparse
import os
import subprocess
import sys
from datetime import datetime, timedelta
import statistics

# ---------------------------------------------------------------------------
# CLI args
# ---------------------------------------------------------------------------
parser = argparse.ArgumentParser(description="Generate Doctor-10 monthly article report")
parser.add_argument("--dry-run", action="store_true", help="Print SQL only; generate sample HTML")
parser.add_argument("--month", default=None, help="Override month label, e.g. M06")
parser.add_argument("--no-push", action="store_true", help="Generate HTML but skip git push")
args = parser.parse_args()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BQ_PROJECT = os.environ.get("BQ_PROJECT", "my-bq-project")
BQ_DATASET = os.environ.get("BQ_DATASET", "my_dataset")

now = datetime.now()
YEAR = now.strftime("%Y")
MONTH_NUM = now.strftime("%m")            # "06"
MONTH_LABEL = args.month if args.month else f"M{MONTH_NUM}"  # "M06"
REPORT_DATE_LABEL = f"{YEAR}年{MONTH_NUM}月"                 # "2026年06月"
REPORT_PERIOD_END = now.strftime("%Y-%m-%d")
REPORT_PERIOD_START = (now - timedelta(days=30)).strftime("%Y-%m-%d")

HTML_FILENAME = f"report-{YEAR}-{MONTH_LABEL}-article-analysis.html"

# ---------------------------------------------------------------------------
# BigQuery SQL (same as Q5 in run_post_view_queries.py)
# ---------------------------------------------------------------------------
SQL = f"""
SELECT
  page_location,
  page_title,
  COUNTIF(event_name = 'page_view')  AS page_view_count,
  COUNTIF(event_name = 'scroll_75')  AS scroll_75_count,
  ROUND(
    COUNTIF(event_name = 'scroll_75')
    / NULLIF(COUNTIF(event_name = 'page_view'), 0) * 100, 1
  ) AS completion_rate
FROM (
  SELECT
    event_name,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title')    AS page_title
  FROM `{BQ_PROJECT}.{BQ_DATASET}.events_*`
  WHERE _TABLE_SUFFIX BETWEEN
    FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
    AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name IN ('page_view', 'scroll_75')
)
WHERE (
    REGEXP_CONTAINS(page_location, r'medify\\.com\\.tw/doctor-10/[^/?#]+/?$')
    OR REGEXP_CONTAINS(page_location, r'medify\\.com\\.tw/default/[^/?#]+/?$')
  )
  AND NOT REGEXP_CONTAINS(page_location, r'/category/')
GROUP BY page_location, page_title
ORDER BY page_view_count DESC
""".strip()

if args.dry_run:
    print("=" * 70)
    print("DRY-RUN MODE — SQL only (no BigQuery call)")
    print("=" * 70)
    print(SQL)
    print()

# ---------------------------------------------------------------------------
# Fetch data (or use sample data in dry-run)
# ---------------------------------------------------------------------------
def fetch_bq_data():
    from google.cloud import bigquery  # type: ignore
    client = bigquery.Client(project=BQ_PROJECT)
    rows = list(client.query(SQL).result())
    return [
        {
            "page_location": r.page_location,
            "page_title": r.page_title or r.page_location,
            "page_view_count": r.page_view_count or 0,
            "scroll_75_count": r.scroll_75_count or 0,
            "completion_rate": float(r.completion_rate or 0),
        }
        for r in rows
    ]

SAMPLE_ARTICLES = [
    {"page_location": "https://medify.com.tw/doctor-10/article-a", "page_title": "高血壓患者的飲食建議", "page_view_count": 4200, "scroll_75_count": 3100, "completion_rate": 73.8},
    {"page_location": "https://medify.com.tw/doctor-10/article-b", "page_title": "糖尿病前期如何逆轉", "page_view_count": 3800, "scroll_75_count": 2700, "completion_rate": 71.1},
    {"page_location": "https://medify.com.tw/doctor-10/article-c", "page_title": "膽固醇偏高怎麼辦", "page_view_count": 3500, "scroll_75_count": 900, "completion_rate": 25.7},
    {"page_location": "https://medify.com.tw/doctor-10/article-d", "page_title": "心臟病的早期症狀", "page_view_count": 3200, "scroll_75_count": 780, "completion_rate": 24.4},
    {"page_location": "https://medify.com.tw/doctor-10/article-e", "page_title": "睡眠呼吸中止症介紹", "page_view_count": 2900, "scroll_75_count": 2100, "completion_rate": 72.4},
    {"page_location": "https://medify.com.tw/doctor-10/article-f", "page_title": "脂肪肝的飲食調整", "page_view_count": 2600, "scroll_75_count": 1950, "completion_rate": 75.0},
    {"page_location": "https://medify.com.tw/doctor-10/article-g", "page_title": "尿酸過高與痛風", "page_view_count": 2400, "scroll_75_count": 580, "completion_rate": 24.2},
    {"page_location": "https://medify.com.tw/doctor-10/article-h", "page_title": "甲狀腺功能低下症狀", "page_view_count": 2100, "scroll_75_count": 450, "completion_rate": 21.4},
    {"page_location": "https://medify.com.tw/default/article-i",   "page_title": "腎臟病患者的飲食禁忌", "page_view_count": 1200, "scroll_75_count": 960, "completion_rate": 80.0},
    {"page_location": "https://medify.com.tw/default/article-j",   "page_title": "骨質疏鬆預防方法", "page_view_count": 1100, "scroll_75_count": 850, "completion_rate": 77.3},
    {"page_location": "https://medify.com.tw/doctor-10/article-k", "page_title": "消化不良與腸胃保健", "page_view_count": 900, "scroll_75_count": 720, "completion_rate": 80.0},
    {"page_location": "https://medify.com.tw/doctor-10/article-l", "page_title": "過敏性鼻炎治療選項", "page_view_count": 800, "scroll_75_count": 190, "completion_rate": 23.8},
    {"page_location": "https://medify.com.tw/doctor-10/article-m", "page_title": "視力退化與黃斑部病變", "page_view_count": 650, "scroll_75_count": 520, "completion_rate": 80.0},
    {"page_location": "https://medify.com.tw/doctor-10/article-n", "page_title": "攝護腺肥大症狀說明", "page_view_count": 520, "scroll_75_count": 110, "completion_rate": 21.2},
    {"page_location": "https://medify.com.tw/default/article-o",   "page_title": "偏頭痛的成因與治療", "page_view_count": 400, "scroll_75_count": 80, "completion_rate": 20.0},
    {"page_location": "https://medify.com.tw/default/article-p",   "page_title": "憂鬱症的非藥物介入", "page_view_count": 300, "scroll_75_count": 240, "completion_rate": 80.0},
]

if args.dry_run:
    data = SAMPLE_ARTICLES
    print(f"Using {len(data)} sample articles for HTML generation.\n")
else:
    print("Fetching data from BigQuery …")
    data = fetch_bq_data()
    print(f"Fetched {len(data)} articles.")

# ---------------------------------------------------------------------------
# Compute median threshold
# ---------------------------------------------------------------------------
if data:
    views = [r["page_view_count"] for r in data]
    median_threshold = statistics.median(views)
else:
    median_threshold = 0

print(f"Median page_view_count: {median_threshold}")

# ---------------------------------------------------------------------------
# Segment into 4 quadrants
# Also compute completion_rate median for "高/低符合預期" split
# ---------------------------------------------------------------------------
if data:
    cr_values = [r["completion_rate"] for r in data]
    cr_median = statistics.median(cr_values)
else:
    cr_median = 50.0

def segment(row):
    high_traffic = row["page_view_count"] >= median_threshold
    high_completion = row["completion_rate"] >= cr_median
    return (high_traffic, high_completion)

q1 = [r for r in data if segment(r) == (True, True)]    # 高流量 × 高符合預期
q2 = [r for r in data if segment(r) == (True, False)]   # 高流量 × 低符合預期
q3 = [r for r in data if segment(r) == (False, True)]   # 低流量 × 高符合預期
q4 = [r for r in data if segment(r) == (False, False)]  # 低流量 × 低符合預朞

# Sort within each quadrant and take top 10
q1.sort(key=lambda r: r["page_view_count"], reverse=True)
q2.sort(key=lambda r: r["page_view_count"], reverse=True)
q3.sort(key=lambda r: r["completion_rate"], reverse=True)
q4.sort(key=lambda r: r["page_view_count"], reverse=True)

q1 = q1[:10]
q2 = q2[:10]
q3 = q3[:10]
q4 = q4[:10]

# ---------------------------------------------------------------------------
# HTML helpers
# ---------------------------------------------------------------------------
def short_title(row):
    title = row["page_title"]
    if not title or title == row["page_location"]:
        # fallback: use last path segment
        segs = row["page_location"].rstrip("/").split("/")
        title = segs[-1] if segs else row["page_location"]
    return title

def build_table(rows, accent_color, empty_msg="（無資料）"):
    if not rows:
        return f'<p class="empty-msg">{empty_msg}</p>'
    cols_style = f"background:{accent_color};"
    html = '<table><thead><tr>'
    html += f'<th style="{cols_style}">排名</th>'
    html += f'<th style="{cols_style}">文章標題</th>'
    html += f'<th style="{cols_style}">瀏覽數</th>'
    html += f'<th style="{cols_style}">閱讀完成數</th>'
    html += f'<th style="{cols_style}">符合預期度(%)</th>'
    html += '</tr></thead><tbody>'
    for i, row in enumerate(rows, 1):
        title = short_title(row)
        url = row["page_location"]
        html += f"""<tr>
          <td class="center">{i}</td>
          <td><a href="{url}" target="_blank" rel="noopener">{title}</a></td>
          <td class="center">{row['page_view_count']:,}</td>
          <td class="center">{row['scroll_75_count']:,}</td>
          <td class="center">{row['completion_rate']:.1f}%</td>
        </tr>"""
    html += '</tbody></table>'
    return html

GENERATED_AT = now.strftime("%Y-%m-%d %H:%M")

# ---------------------------------------------------------------------------
# Build HTML
# ---------------------------------------------------------------------------
HTML = f"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>文章表現月報 | Doctor-10 | {REPORT_DATE_LABEL}</title>
<style>
  /* ── Reset ── */
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

  /* ── Tokens ── */
  :root {{
    --bg: #f6f8fb;
    --navy-start: #0f3460;
    --navy-end: #1a5276;
    --card-bg: #ffffff;
    --card-border: #e6ebf2;
    --text-primary: #1a2332;
    --text-secondary: #5a6a7a;
    --font: -apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", Arial, sans-serif;
    --radius: 12px;
  }}

  body {{
    font-family: var(--font);
    background: var(--bg);
    color: var(--text-primary);
    min-height: 100vh;
  }}

  /* ── Lock screen ── */
  #lock-screen {{
    position: fixed; inset: 0;
    background: linear-gradient(135deg, var(--navy-start), var(--navy-end));
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
  }}
  .lock-box {{
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 20px;
    padding: 48px 40px;
    text-align: center;
    width: 360px;
    backdrop-filter: blur(12px);
  }}
  .lock-icon {{ font-size: 52px; margin-bottom: 16px; }}
  .lock-title {{ color: #fff; font-size: 20px; font-weight: 600; margin-bottom: 6px; }}
  .lock-sub {{ color: rgba(255,255,255,0.65); font-size: 13px; margin-bottom: 28px; }}
  .lock-box input[type="password"] {{
    width: 100%;
    padding: 14px 18px;
    font-size: 18px;
    letter-spacing: 6px;
    border: none;
    border-radius: 10px;
    background: rgba(255,255,255,0.15);
    color: #fff;
    text-align: center;
    outline: none;
    margin-bottom: 16px;
    transition: background 0.2s;
  }}
  .lock-box input[type="password"]::placeholder {{ letter-spacing: 2px; color: rgba(255,255,255,0.45); font-size: 14px; }}
  .lock-box input[type="password"]:focus {{ background: rgba(255,255,255,0.25); }}
  .lock-btn {{
    width: 100%;
    padding: 14px;
    background: rgba(255,255,255,0.9);
    color: var(--navy-start);
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
    font-family: var(--font);
  }}
  .lock-btn:hover {{ opacity: 0.88; }}
  .lock-error {{ color: #ff8080; font-size: 13px; margin-top: 12px; min-height: 18px; }}

  /* ── Main content (hidden until unlock) ── */
  #main-content {{ display: none; }}

  /* ── Header ── */
  .report-header {{
    background: linear-gradient(135deg, var(--navy-start), var(--navy-end));
    color: #fff;
    padding: 36px 40px 32px;
  }}
  .report-header h1 {{ font-size: 26px; font-weight: 700; margin-bottom: 6px; }}
  .report-header .subtitle {{ font-size: 14px; opacity: 0.75; }}

  /* ── Container ── */
  .container {{ max-width: 1100px; margin: 0 auto; padding: 32px 24px; }}

  /* ── Summary cards ── */
  .summary-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 36px;
  }}
  .summary-card {{
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: var(--radius);
    padding: 20px 24px;
    text-align: center;
  }}
  .summary-card .label {{ font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .5px; }}
  .summary-card .value {{ font-size: 26px; font-weight: 700; color: var(--navy-start); }}

  /* ── Section ── */
  .section {{
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: var(--radius);
    margin-bottom: 28px;
    overflow: hidden;
  }}
  .section-header {{
    padding: 18px 24px;
    display: flex;
    align-items: center;
    gap: 10px;
  }}
  .section-header h2 {{ font-size: 16px; font-weight: 600; color: #fff; }}
  .section-header .badge {{
    font-size: 11px;
    background: rgba(255,255,255,0.2);
    color: #fff;
    border-radius: 20px;
    padding: 2px 10px;
  }}
  .section-body {{ padding: 0; }}

  /* ── Table ── */
  table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
  thead tr {{ }}
  th {{
    padding: 11px 16px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
  }}
  td {{
    padding: 12px 16px;
    border-bottom: 1px solid var(--card-border);
    vertical-align: middle;
    color: var(--text-primary);
  }}
  td.center {{ text-align: center; }}
  tr:last-child td {{ border-bottom: none; }}
  tr:hover td {{ background: #f9fbfe; }}
  td a {{ color: var(--navy-start); text-decoration: none; }}
  td a:hover {{ text-decoration: underline; }}

  .empty-msg {{ padding: 24px; color: var(--text-secondary); text-align: center; font-size: 14px; }}

  /* ── Footer ── */
  .report-footer {{
    text-align: center;
    padding: 28px;
    font-size: 12px;
    color: var(--text-secondary);
    border-top: 1px solid var(--card-border);
    margin-top: 16px;
  }}

  /* ── Responsive ── */
  @media (max-width: 640px) {{
    .report-header {{ padding: 24px 16px; }}
    .container {{ padding: 20px 12px; }}
    th, td {{ padding: 10px 10px; }}
  }}
</style>
</head>
<body>

<!-- ══════════════════ LOCK SCREEN ══════════════════ -->
<div id="lock-screen">
  <div class="lock-box">
    <div class="lock-icon">🔒</div>
    <div class="lock-title">文章表現月報</div>
    <div class="lock-sub">Doctor-10 · {REPORT_DATE_LABEL} · 請輸入密碼查看</div>
    <input type="password" id="pwd-input" placeholder="輸入密碼" maxlength="20"
           onkeydown="if(event.key==='Enter')checkPwd()">
    <button class="lock-btn" onclick="checkPwd()">解鎖報告</button>
    <div class="lock-error" id="lock-error"></div>
  </div>
</div>

<!-- ══════════════════ MAIN CONTENT ══════════════════ -->
<div id="main-content">

  <!-- Header -->
  <div class="report-header">
    <h1>📖 文章表現月報</h1>
    <div class="subtitle">Doctor-10 · {REPORT_DATE_LABEL} · 數據來源：GA4</div>
  </div>

  <div class="container">

    <!-- Summary cards -->
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">分析期間</div>
        <div class="value" style="font-size:16px;margin-top:4px;">{REPORT_PERIOD_START}<br>→ {REPORT_PERIOD_END}</div>
      </div>
      <div class="summary-card">
        <div class="label">分析文章數</div>
        <div class="value">{len(data)}</div>
      </div>
      <div class="summary-card">
        <div class="label">流量中位數</div>
        <div class="value">{int(median_threshold):,}</div>
      </div>
      <div class="summary-card">
        <div class="label">符合預期度中位數</div>
        <div class="value">{cr_median:.1f}%</div>
      </div>
    </div>

    <!-- Section header banner -->
    <div style="background:linear-gradient(135deg,#0f3460,#1a5276);border-radius:12px;padding:20px 24px;margin-bottom:28px;color:#fff;">
      <h2 style="font-size:18px;font-weight:700;">📖 Doctor-10 文章表現分析（近30天）</h2>
      <p style="font-size:13px;opacity:.75;margin-top:4px;">依流量與閱讀完成度分為四象限，每欄顯示前 10 篇</p>
    </div>

    <!-- Q1: 高流量 × 高符合預期 — green -->
    <div class="section">
      <div class="section-header" style="background:#1e7e34;">
        <h2>🔥 高流量 × 高符合預期（表現最佳）</h2>
        <span class="badge">{len(q1)} 篇</span>
      </div>
      <div class="section-body">
        {build_table(q1, "#1e7e34")}
      </div>
    </div>

    <!-- Q2: 高流量 × 低符合預期 — orange -->
    <div class="section">
      <div class="section-header" style="background:#d4660a;">
        <h2>⚠️ 高流量 × 低符合預期（流量好，讀者跑掉）</h2>
        <span class="badge">{len(q2)} 篇</span>
      </div>
      <div class="section-body">
        {build_table(q2, "#d4660a")}
      </div>
    </div>

    <!-- Q3: 低流量 × 高符合預期 — blue -->
    <div class="section">
      <div class="section-header" style="background:#1565c0;">
        <h2>💎 低流量 × 高符合預期（隱藏寶石）</h2>
        <span class="badge">{len(q3)} 篇</span>
      </div>
      <div class="section-body">
        {build_table(q3, "#1565c0")}
      </div>
    </div>

    <!-- Q4: 低流量 × 低符合預期 — red -->
    <div class="section">
      <div class="section-header" style="background:#b71c1c;">
        <h2>🔻 低流量 × 低符合預期（需要關注）</h2>
        <span class="badge">{len(q4)} 篇</span>
      </div>
      <div class="section-body">
        {build_table(q4, "#b71c1c")}
      </div>
    </div>

    <!-- Footer -->
    <div class="report-footer">
      數據來源：GA4 &nbsp;|&nbsp; 報告生成時間：{GENERATED_AT} &nbsp;|&nbsp; Doctor-10 文章分析月報
    </div>

  </div><!-- /container -->
</div><!-- /main-content -->

<script>
  const CORRECT = "9053";
  function checkPwd() {{
    var v = document.getElementById("pwd-input").value.trim();
    if (v === CORRECT) {{
      document.getElementById("lock-screen").style.display = "none";
      document.getElementById("main-content").style.display = "block";
    }} else {{
      document.getElementById("lock-error").textContent = "密碼錯誤，請再試一次";
      document.getElementById("pwd-input").value = "";
    }}
  }}
</script>

</body>
</html>
"""

# ---------------------------------------------------------------------------
# Write HTML
# ---------------------------------------------------------------------------
with open(HTML_FILENAME, "w", encoding="utf-8") as f:
    f.write(HTML)

print(f"HTML written → {HTML_FILENAME}")

# ---------------------------------------------------------------------------
# Git push (unless --dry-run or --no-push)
# ---------------------------------------------------------------------------
if args.dry_run or args.no_push:
    print("Skipping git push (--dry-run or --no-push).")
else:
    commit_msg = f"月報 {MONTH_LABEL}：Doctor-10 文章分析"
    cmds = [
        ["git", "add", HTML_FILENAME],
        ["git", "commit", "-m", commit_msg],
        ["git", "push"],
    ]
    for cmd in cmds:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"ERROR running {' '.join(cmd)}:\n{result.stderr}", file=sys.stderr)
            sys.exit(1)
        print(f"✓ {' '.join(cmd)}")
    print(f"Done! Report pushed: {HTML_FILENAME}")
