#!/usr/bin/env python3
"""
generate_article_report.py
Monthly HTML report for Doctor-10 article performance.

Usage:
  python generate_article_report.py                                    # auto: previous calendar month
  python generate_article_report.py --date-from 2026-05-01 --date-to 2026-05-31
  python generate_article_report.py --month M05                        # override month label in filename
  python generate_article_report.py --dry-run                          # print SQL + sample HTML, no BQ
  python generate_article_report.py --no-push                          # generate HTML but skip git push
"""

import argparse
import calendar
import os
import subprocess
import sys
from datetime import datetime, timedelta
import statistics

# ---------------------------------------------------------------------------
# CLI args
# ---------------------------------------------------------------------------
parser = argparse.ArgumentParser(description="Generate Doctor-10 monthly article report")
parser.add_argument("--date-from", default=None, help="Start date YYYY-MM-DD (default: 1st of prev month)")
parser.add_argument("--date-to",   default=None, help="End date   YYYY-MM-DD (default: last of prev month)")
parser.add_argument("--month",     default=None, help="Override month label in filename, e.g. M05")
parser.add_argument("--dry-run",   action="store_true", help="Print SQL only; generate sample HTML, no BQ")
parser.add_argument("--no-push",   action="store_true", help="Generate HTML but skip git push")
args = parser.parse_args()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BQ_PROJECT  = os.environ.get("BQ_PROJECT",  "my-bq-project")
BQ_DATASET  = os.environ.get("BQ_DATASET",  "my_dataset")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "asia-east1")

now = datetime.now()

# Determine date range — default to previous full calendar month
if args.date_from and args.date_to:
    DATE_FROM = args.date_from   # e.g. "2026-05-01"
    DATE_TO   = args.date_to     # e.g. "2026-05-31"
else:
    # Previous month
    first_of_this_month = now.replace(day=1)
    last_of_prev        = first_of_this_month - timedelta(days=1)
    first_of_prev       = last_of_prev.replace(day=1)
    DATE_FROM = first_of_prev.strftime("%Y-%m-%d")
    DATE_TO   = last_of_prev.strftime("%Y-%m-%d")

# Derive year/month from DATE_FROM for labels
dt_from = datetime.strptime(DATE_FROM, "%Y-%m-%d")
YEAR        = dt_from.strftime("%Y")
MONTH_NUM   = dt_from.strftime("%m")
MONTH_LABEL = args.month if args.month else f"M{MONTH_NUM}"
REPORT_DATE_LABEL = f"{YEAR}年{MONTH_NUM}月"

HTML_FILENAME = f"report-{YEAR}-{MONTH_LABEL}-article-analysis.html"

# BQ date suffix format (YYYYMMDD)
BQ_FROM = DATE_FROM.replace("-", "")
BQ_TO   = DATE_TO.replace("-", "")

# ---------------------------------------------------------------------------
# BigQuery SQL (same logic as Q5 in run_post_view_queries.py)
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
  WHERE _TABLE_SUFFIX BETWEEN '{BQ_FROM}' AND '{BQ_TO}'
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
    client = bigquery.Client(project=BQ_PROJECT, location=BQ_LOCATION)
    rows = list(client.query(SQL).result())
    return [
        {
            "page_location":   r.page_location,
            "page_title":      r.page_title or r.page_location,
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
    print(f"Fetching data from BigQuery ({DATE_FROM} → {DATE_TO}) …")
    data = fetch_bq_data()
    print(f"Fetched {len(data)} articles.")

# ---------------------------------------------------------------------------
# Compute thresholds (median)
# ---------------------------------------------------------------------------
if data:
    views     = [r["page_view_count"] for r in data]
    cr_values = [r["completion_rate"]  for r in data]
    median_threshold = statistics.median(views)
    cr_median        = statistics.median(cr_values)
else:
    median_threshold = 0
    cr_median        = 50.0

print(f"Median views: {median_threshold}  |  Median completion: {cr_median:.1f}%")

# ---------------------------------------------------------------------------
# Segment into 4 quadrants
# ---------------------------------------------------------------------------
def segment(row):
    return (row["page_view_count"] >= median_threshold,
            row["completion_rate"]  >= cr_median)

q1 = sorted([r for r in data if segment(r) == (True,  True)],  key=lambda r: r["page_view_count"], reverse=True)[:10]
q2 = sorted([r for r in data if segment(r) == (True,  False)], key=lambda r: r["page_view_count"], reverse=True)[:10]
q3 = sorted([r for r in data if segment(r) == (False, True)],  key=lambda r: r["completion_rate"],  reverse=True)[:10]
q4 = sorted([r for r in data if segment(r) == (False, False)], key=lambda r: r["page_view_count"], reverse=True)[:10]

# ---------------------------------------------------------------------------
# HTML helpers
# ---------------------------------------------------------------------------
def short_title(row):
    title = row["page_title"]
    if not title or title == row["page_location"]:
        segs  = row["page_location"].rstrip("/").split("/")
        title = segs[-1] if segs else row["page_location"]
    return title

def build_table(rows, accent_color):
    if not rows:
        return '<p class="empty-msg">（無資料）</p>'
    s  = f'background:{accent_color};'
    h  = '<table><thead><tr>'
    h += f'<th style="{s}">排名</th><th style="{s}">文章標題</th>'
    h += f'<th style="{s}">瀏覽數</th><th style="{s}">閱讀完成數</th><th style="{s}">符合預期度(%)</th>'
    h += '</tr></thead><tbody>'
    for i, row in enumerate(rows, 1):
        t = short_title(row)
        u = row["page_location"]
        h += f'<tr><td class="c">{i}</td><td><a href="{u}" target="_blank" rel="noopener">{t}</a></td>'
        h += f'<td class="c">{row["page_view_count"]:,}</td><td class="c">{row["scroll_75_count"]:,}</td>'
        h += f'<td class="c">{row["completion_rate"]:.1f}%</td></tr>'
    h += '</tbody></table>'
    return h

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
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
:root{{--bg:#f6f8fb;--n0:#0f3460;--n1:#1a5276;--cb:#fff;--bo:#e6ebf2;--tp:#1a2332;--ts:#5a6a7a;--font:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",Arial,sans-serif;--r:12px}}
body{{font-family:var(--font);background:var(--bg);color:var(--tp);min-height:100vh}}
#is{{position:fixed;inset:0;background:linear-gradient(135deg,var(--n0),var(--n1));display:flex;align-items:center;justify-content:center;z-index:9999}}
.lb{{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:20px;padding:48px 40px;text-align:center;width:360px;backdrop-filter:blur(12px)}}
.li{{font-size:52px;margin-bottom:16px}}
.lt{{color:#fff;font-size:20px;font-weight:600;margin-bottom:6px}}
.ls{{color:rgba(255,255,255,.65);font-size:13px;margin-bottom:28px}}
.lb input[type=password]{{width:100%;padding:14px 18px;font-size:18px;letter-spacing:6px;border:none;border-radius:10px;background:rgba(255,255,255,.15);color:#fff;text-align:center;outline:none;margin-bottom:16px;transition:background .2s}}
.lb input[type=password]::placeholder{{letter-spacing:2px;color:rgba(255,255,255,.45);font-size:14px}}
.lb input[type=password]:focus{{background:rgba(255,255,255,.25)}}
.lbtn{{width:100%;padding:14px;background:rgba(255,255,255,.9);color:var(--n0);border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;font-family:var(--font)}}
.lerr{{color:#ff8080;font-size:13px;margin-top:12px;min-height:18px}}
#mc{{display:none}}
.rh{{background:linear-gradient(135deg,var(--n0),var(--n1));color:#fff;padding:36px 40px 32px}}
.rh h1{{font-size:26px;font-weight:700;margin-bottom:6px}}
.rh .sub{{font-size:14px;opacity:.75}}
.wrap{{max-width:1100px;margin:0 auto;padding:32px 24px}}
.sg{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:36px}}
.sc{{background:var(--cb);border:1px solid var(--bo);border-radius:var(--r);padding:20px 24px;text-align:center}}
.sc .lbl{{font-size:12px;color:var(--ts);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}}
.sc .val{{font-size:26px;font-weight:700;color:var(--n0)}}
.sec{{background:var(--cb);border:1px solid var(--bo);border-radius:var(--r);margin-bottom:28px;overflow:hidden}}
.sh{{padding:18px 24px;display:flex;align-items:center;gap:10px}}
.sh h2{{font-size:16px;font-weight:600;color:#fff}}
.sh .bdg{{font-size:11px;background:rgba(255,255,255,.2);color:#fff;border-radius:20px;padding:2px 10px}}
table{{width:100%;border-collapse:collapse;font-size:14px}}
th{{padding:11px 16px;text-align:left;font-size:12px;font-weight:600;color:#fff;white-space:nowrap}}
td{{padding:12px 16px;border-bottom:1px solid var(--bo);vertical-align:middle}}
td.c{{text-align:center}}
tr:last-child td{{border-bottom:none}}
tr:hover td{{background:#f9fbfe}}
td a{{color:var(--n0);text-decoration:none}}
td a:hover{{text-decoration:underline}}
.empty-msg{{padding:24px;color:var(--ts);text-align:center;font-size:14px}}
.rf{{text-align:center;padding:28px;font-size:12px;color:var(--ts);border-top:1px solid var(--bo);margin-top:16px}}
@media(max-width:640px){{.rh{{padding:24px 16px}}.wrap{{padding:20px 12px}}th,td{{padding:10px}}}}
</style>
</head>
<body>

<div id="ls">
  <div class="lb">
    <div class="li">🔒</div>
    <div class="lt">文章表現月報</div>
    <div class="ls">Doctor-10 · {REPORT_DATE_LABEL} · 請輸入密碼查看</div>
    <input type="password" id="pw" placeholder="輸入密碼" maxlength="20" onkeydown="if(event.key==='Enter')chk()">
    <button class="lbtn" onclick="chk()">解鎖報告</button>
    <div class="lerr" id="le"></div>
  </div>
</div>

<div id="mc">
  <div class="rh">
    <h1>📖 文章表現月報</h1>
    <div class="sub">Doctor-10 · {REPORT_DATE_LABEL} · 數據來源：GA4</div>
  </div>
  <div class="wrap">
    <div class="sg">
      <div class="sc"><div class="lbl">分析期間</div><div class="val" style="font-size:15px;margin-top:4px">{DATE_FROM}<br>→ {DATE_TO}</div></div>
      <div class="sc"><div class="lbl">分析文章數</div><div class="val">{len(data)}</div></div>
      <div class="sc"><div class="lbl">流量中位數</div><div class="val">{int(median_threshold):,}</div></div>
      <div class="sc"><div class="lbl">符合預期度中位數</div><div class="val">{cr_median:.1f}%</div></div>
    </div>

    <div style="background:linear-gradient(135deg,#0f3460,#1a5276);border-radius:12px;padding:20px 24px;margin-bottom:28px;color:#fff">
      <h2 style="font-size:18px;font-weight:700">📖 Doctor-10 文章表現分析（{DATE_FROM} ～ {DATE_TO}）</h2>
      <p style="font-size:13px;opacity:.75;margin-top:4px">依流量與閱讀完成度分為四象限，每欄顯示前 10 篇</p>
    </div>

    <div class="sec">
      <div class="sh" style="background:#1e7e34"><h2>🔥 高流量 × 高符合預期（表現最佳）</h2><span class="bdg">{len(q1)} 篇</span></div>
      <div>{build_table(q1,"#1e7e34")}</div>
    </div>
    <div class="sec">
      <div class="sh" style="background:#d4660a"><h2>⚠️ 高流量 × 低符合預期（流量好，讀者跑掉）</h2><span class="bdg">{len(q2)} 篇</span></div>
      <div>{build_table(q2,"#d4660a")}</div>
    </div>
    <div class="sec">
      <div class="sh" style="background:#1565c0"><h2>💎 低流量 × 高符合預期（隱藏寶石）</h2><span class="bdg">{len(q3)} 篇</span></div>
      <div>{build_table(q3,"#1565c0")}</div>
    </div>
    <div class="sec">
      <div class="sh" style="background:#b71c1c"><h2>🔻 低流量 × 低符合預期（需要關注）</h2><span class="bdg">{len(q4)} 篇</span></div>
      <div>{build_table(q4,"#b71c1c")}</div>
    </div>

    <div class="rf">數據來源：GA4 &nbsp;|&nbsp; 報告生成時間：{GENERATED_AT} &nbsp;|&nbsp; Doctor-10 文章分析月報</div>
  </div>
</div>

<script>
const C="9053";
function chk(){{
  var v=document.getElementById("pw").value.trim();
  if(v===C){{document.getElementById("ls").style.display="none";document.getElementById("mc").style.display="block"}}
  else{{document.getElementById("le").textContent="密碼錯誤，請再試一次";document.getElementById("pw").value=""}}
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
    for cmd in [["git","add",HTML_FILENAME],["git","commit","-m",commit_msg],["git","push"]]:
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print(f"ERROR: {' '.join(cmd)}\n{r.stderr}", file=sys.stderr)
            sys.exit(1)
        print(f"✓ {' '.join(cmd)}")
    print(f"Done! {HTML_FILENAME}")
