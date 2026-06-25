#!/usr/bin/env python3
"""
generate_article_report.py
月報自動化腳本 — Doctor-10 文章表現分析（近 30 天滾動窗口）

功能：
- 查詢 GA4 BigQuery：Doctor-10 文章 page_view 與 scroll_75 事件
- 動態計算瀏覽數中位數作為高/低流量分界
- 輸出 4 個維度排行的獨立 HTML 月報（密碼保護）

設定方式：
1. 安裝相依套件：pip install google-cloud-bigquery
2. 設定 Google Cloud 認證（擇一）：
   a. 服務帳號：export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
   b. 使用者帳號：執行 gcloud auth application-default login
3. 設定環境變數：
   export BQ_PROJECT='your-gcp-project-id'
   export BQ_DATASET='analytics_XXXXXXXXX'

用法：
  python generate_article_report.py               # 產生當月報告並 git push
  python generate_article_report.py --dry-run     # 產生示範 HTML，不連 BQ
  python generate_article_report.py --no-push     # 產生 HTML，不 git push
  python generate_article_report.py --month M07   # 指定月份標籤（僅影響檔名）
"""

import argparse
import os
import statistics
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

# ─── 設定區 ────────────────────────────────────────────────────────────────────

CONFIG = {
    "BQ_PROJECT": os.environ.get("BQ_PROJECT", "YOUR_PROJECT"),
    "BQ_DATASET": os.environ.get("BQ_DATASET", "YOUR_DATASET"),
    "PASSWORD":   "9053",
    "DAYS":       30,
    "OUTPUT_DIR": Path(__file__).parent,
}

# ──────────────────────────────────────────────────────────────────────────────

def build_table_path() -> str:
    p = CONFIG["BQ_PROJECT"]
    d = CONFIG["BQ_DATASET"]
    return f"`{p}.{d}.events_*`"


def q5_article_analysis(table: str, days: int = 30) -> str:
    return f"""
WITH base AS (
  SELECT
    event_name,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title')    AS page_title
  FROM {table}
  WHERE _TABLE_SUFFIX BETWEEN
    FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY))
    AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  AND event_name IN ('page_view', 'scroll_75')
),
filtered AS (
  SELECT *
  FROM base
  WHERE (
    REGEXP_CONTAINS(page_location, r'medify\\.com\\.tw/doctor-10/[^/?#]+/?$')
    OR REGEXP_CONTAINS(page_location, r'medify\\.com\\.tw/default/[^/?#]+/?$')
  )
  AND NOT REGEXP_CONTAINS(page_location, r'/category/')
)
SELECT
  page_location,
  MAX(page_title) AS page_title,
  COUNTIF(event_name = 'page_view')  AS page_view_count,
  COUNTIF(event_name = 'scroll_75')  AS scroll_75_count,
  ROUND(
    SAFE_DIVIDE(COUNTIF(event_name = 'scroll_75'), COUNTIF(event_name = 'page_view')) * 100,
    1
  ) AS completion_rate
FROM filtered
GROUP BY page_location
HAVING COUNTIF(event_name = 'page_view') > 0
ORDER BY page_view_count DESC
""".strip()


def run_query(client, sql: str) -> list[dict]:
    job = client.query(sql)
    rows = list(job.result())
    return [dict(row) for row in rows]


def truncate(s: str, n: int = 42) -> str:
    if not s:
        return "—"
    return s[:n] + "…" if len(s) > n else s


def make_table_section(rows: list[dict], title: str, subtitle: str,
                        header_color: str, top_n: int = 10) -> str:
    """生成單一排行表區塊 HTML"""
    if not rows:
        body = """<tr>
          <td colspan="5" style="text-align:center;padding:16px;color:#999;font-style:italic;">
            無符合條件的文章
          </td>
        </tr>"""
    else:
        body = ""
        for i, r in enumerate(rows[:top_n], 1):
            title_text = truncate(r.get("page_title") or r.get("page_location", "—"))
            pv  = r.get("page_view_count", 0)
            s75 = r.get("scroll_75_count", 0)
            cr  = r.get("completion_rate", 0.0)
            bg  = "#f9fafc" if i % 2 == 0 else "#ffffff"
            cr_color = "#27ae60" if (cr or 0) >= 50 else ("#e67e22" if (cr or 0) >= 25 else "#e74c3c")
            body += f"""        <tr style="background:{bg};">
          <td style="text-align:center;font-weight:700;padding:8px 4px;">{i}</td>
          <td style="padding:8px;">{title_text}</td>
          <td style="text-align:center;padding:8px 4px;font-weight:700;">{pv}</td>
          <td style="text-align:center;padding:8px 4px;">{s75}</td>
          <td style="text-align:center;padding:8px 4px;font-weight:700;color:{cr_color};">{cr}%</td>
        </tr>\n"""

    count_badge = f"{len(rows)} 篇" if rows else "0 篇"
    return f"""
      <div style="margin-bottom:32px;">
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px;">
          <h3 style="font-size:16px;font-weight:700;color:#1a1a2e;margin:0;">{title}</h3>
          <span style="background:{header_color};color:#fff;font-size:11px;font-weight:700;
                       padding:2px 10px;border-radius:20px;">{count_badge}</span>
        </div>
        <p style="margin:0 0 10px;font-size:12px;color:#666;">{subtitle}</p>
        <div style="background:#fff;border-radius:12px;overflow:hidden;
                    box-shadow:0 2px 10px rgba(0,0,0,.07);border:1px solid #e6ebf2;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:{header_color};color:#fff;">
                <th style="width:44px;padding:10px 4px;font-weight:600;text-align:center;">排名</th>
                <th style="padding:10px 8px;font-weight:600;text-align:left;">文章標題</th>
                <th style="width:72px;padding:10px 4px;font-weight:600;text-align:center;">瀏覽數</th>
                <th style="width:90px;padding:10px 4px;font-weight:600;text-align:center;">閱讀完成數</th>
                <th style="width:110px;padding:10px 4px;font-weight:600;text-align:center;">符合預期度(%)</th>
              </tr>
            </thead>
            <tbody>
{body}            </tbody>
          </table>
        </div>
      </div>"""


def build_html(rows: list[dict], month_label: str, generated_at: str,
               date_from: str, date_to: str) -> str:
    """組裝完整 HTML 月報"""

    pw = CONFIG["PASSWORD"]
    total = len(rows)

    if rows:
        views = [r["page_view_count"] for r in rows]
        median_views = statistics.median(views)
        threshold = int(median_views) if median_views == int(median_views) else round(median_views, 1)
    else:
        threshold = 0

    high = [r for r in rows if r["page_view_count"] >  threshold]
    low  = [r for r in rows if r["page_view_count"] <= threshold]

    # 高流量高符合：按 completion_rate DESC
    hh = sorted(high, key=lambda x: (x.get("completion_rate") or 0), reverse=True)
    # 高流量低符合：按 completion_rate ASC
    hl = sorted(high, key=lambda x: (x.get("completion_rate") or 0))
    # 低流量高符合：按 completion_rate DESC
    lh = sorted(low,  key=lambda x: (x.get("completion_rate") or 0), reverse=True)
    # 低流量低符合：按 completion_rate ASC
    ll = sorted(low,  key=lambda x: (x.get("completion_rate") or 0))

    sections_html = (
        make_table_section(hh, "🔥 高流量 × 高符合預期（表現最佳）",
                           f"瀏覽數 &gt; {threshold}，符合預期度由高到低排列",
                           "#27ae60") +
        make_table_section(hl, "⚠️ 高流量 × 低符合預期（流量好，讀者跑掉）",
                           f"瀏覽數 &gt; {threshold}，符合預期度由低到高排列 — 優先優化內容結構",
                           "#e67e22") +
        make_table_section(lh, "💎 低流量 × 高符合預期（隱藏寶石）",
                           f"瀏覽數 &le; {threshold}，符合預期度由高到低排列 — 加強推廣與 SEO",
                           "#2980b9") +
        make_table_section(ll, "🔻 低流量 × 低符合預期（需要關注）",
                           f"瀏覽數 &le; {threshold}，符合預期度由低到高排列 — 評估是否重寫或下架",
                           "#c0392b")
    )

    # 年月顯示
    try:
        m_num = int(month_label.lstrip("Mm"))
        display_month = f"{date.today().year} 年 {m_num:02d} 月"
    except Exception:
        display_month = month_label

    html = f"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>文章表現月報 | Doctor-10 | {display_month}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", Arial, sans-serif;
      background: #f6f8fb; color: #1a1a2e;
    }}

    /* ===== PASSWORD GATE ===== */
    #gate {{
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #0f3460 0%, #16213e 100%);
    }}
    .gate-box {{
      background: white; border-radius: 16px; padding: 48px 40px;
      text-align: center; max-width: 360px; width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,.4);
    }}
    .gate-logo {{ font-size: 36px; margin-bottom: 8px; }}
    .gate-title {{ font-size: 22px; font-weight: 700; color: #0f3460; margin-bottom: 4px; }}
    .gate-sub {{ font-size: 13px; color: #888; margin-bottom: 28px; }}
    .gate-box input {{
      width: 100%; padding: 12px 16px; font-size: 18px; letter-spacing: 6px;
      border: 2px solid #dde3ef; border-radius: 10px; text-align: center;
      outline: none; transition: border .2s;
    }}
    .gate-box input:focus {{ border-color: #0f3460; }}
    .gate-box button {{
      width: 100%; margin-top: 16px; padding: 13px; font-size: 16px; font-weight: 600;
      background: #0f3460; color: white; border: none; border-radius: 10px;
      cursor: pointer; transition: background .2s;
    }}
    .gate-box button:hover {{ background: #1a4a80; }}
    #pw-error {{ display: none; color: #e74c3c; font-size: 13px; margin-top: 10px; }}

    /* ===== REPORT ===== */
    #report {{ display: none; }}

    .header {{
      background: linear-gradient(135deg, #0f3460 0%, #1a4a80 100%);
      color: white; padding: 32px 40px;
    }}
    .header-top {{
      display: flex; justify-content: space-between; align-items: center;
      flex-wrap: wrap; gap: 12px;
    }}
    .header-brand {{ font-size: 22px; font-weight: 700; opacity: .9; }}
    .header-period {{ font-size: 14px; opacity: .75; }}
    .header h1 {{ font-size: 28px; font-weight: 800; margin-top: 16px; }}
    .header-badge {{
      display: inline-block; margin-top: 8px; padding: 4px 14px;
      background: rgba(255,255,255,.15); border-radius: 20px;
      font-size: 13px; letter-spacing: .5px;
    }}

    .container {{ max-width: 960px; margin: 0 auto; padding: 32px 24px; }}

    .summary-bar {{
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 14px; margin-bottom: 32px;
    }}
    .summary-card {{
      background: white; border-radius: 12px; padding: 20px 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,.06); border-top: 4px solid #0f3460;
      text-align: center;
    }}
    .summary-label {{
      font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase;
      letter-spacing: .8px; margin-bottom: 8px;
    }}
    .summary-value {{ font-size: 30px; font-weight: 800; color: #1a1a2e; line-height: 1; }}
    .summary-sub {{ font-size: 12px; color: #aaa; margin-top: 6px; }}

    .section-label {{
      font-size: 18px; font-weight: 700; color: #0f3460;
      margin-bottom: 20px; padding-bottom: 10px;
      border-bottom: 3px solid #0f3460;
    }}

    .footer {{
      text-align: center; color: #aaa; font-size: 12px;
      padding: 28px 24px;
      border-top: 1px solid #e6ebf2; margin-top: 8px;
    }}
  </style>
</head>
<body>

<!-- PASSWORD GATE -->
<div id="gate">
  <div class="gate-box">
    <div class="gate-logo">📖</div>
    <div class="gate-title">Medify 月報</div>
    <div class="gate-sub">Doctor-10 文章分析 · {display_month}</div>
    <input type="password" id="pw" placeholder="請輸入密碼" autofocus>
    <button onclick="checkPw()">進入報告</button>
    <div id="pw-error">密碼錯誤，請再試一次</div>
  </div>
</div>

<!-- REPORT -->
<div id="report">

  <div class="header">
    <div class="header-top">
      <div class="header-brand">🏥 Medify 醫病關係平台</div>
      <div class="header-period">資料來源：GA4 BigQuery</div>
    </div>
    <h1>Doctor-10 文章表現月報 — {month_label}</h1>
    <div class="header-badge">
      📅 分析期間：{date_from} – {date_to} ｜ 產生時間：{generated_at}
    </div>
  </div>

  <div class="container">

    <div class="summary-bar">
      <div class="summary-card">
        <div class="summary-label">分析文章數</div>
        <div class="summary-value">{total}</div>
        <div class="summary-sub">近 {CONFIG["DAYS"]} 天</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">流量中位數</div>
        <div class="summary-value">{threshold}</div>
        <div class="summary-sub">高低流量分界</div>
      </div>
      <div class="summary-card" style="border-top-color:#27ae60;">
        <div class="summary-label">高流量文章</div>
        <div class="summary-value" style="color:#27ae60;">{len(high)}</div>
        <div class="summary-sub">瀏覽 &gt; {threshold}</div>
      </div>
      <div class="summary-card" style="border-top-color:#2980b9;">
        <div class="summary-label">低流量文章</div>
        <div class="summary-value" style="color:#2980b9;">{len(low)}</div>
        <div class="summary-sub">瀏覽 &le; {threshold}</div>
      </div>
    </div>

    <div class="section-label">📊 Doctor-10 文章分析（近 {CONFIG["DAYS"]} 天）</div>

{sections_html}

  </div>

  <div class="footer">
    文章表現月報 {month_label} ｜ 資料來源：GA4 BigQuery ｜ 產生時間：{generated_at}<br>
    Doctor-10 何宜儒醫師 · 澄清眼科 · 自動生成 by Claude Agent
  </div>

</div><!-- /report -->

<script>
  const CORRECT = '{pw}';
  function checkPw() {{
    if (document.getElementById('pw').value === CORRECT) {{
      document.getElementById('gate').style.display = 'none';
      document.getElementById('report').style.display = 'block';
    }} else {{
      document.getElementById('pw-error').style.display = 'block';
      document.getElementById('pw').value = '';
      document.getElementById('pw').focus();
    }}
  }}
  document.getElementById('pw').addEventListener('keypress', e => {{
    if (e.key === 'Enter') checkPw();
  }});
</script>
</body>
</html>"""
    return html


# ──────────────────────────────────────────────────────────────────────────────
# DRY-RUN sample data

SAMPLE_ROWS = [
    {"page_location": "https://medify.com.tw/doctor-10/smile-vs-lasik/",
     "page_title": "SMILE 近視雷射 vs LASIK 怎麼選？術前完整比較", "page_view_count": 87, "scroll_75_count": 62, "completion_rate": 71.3},
    {"page_location": "https://medify.com.tw/doctor-10/dry-eye-cause/",
     "page_title": "眼睛好乾！乾眼症的常見原因與治療方式完整說明", "page_view_count": 74, "scroll_75_count": 58, "completion_rate": 78.4},
    {"page_location": "https://medify.com.tw/doctor-10/eye-drops-after-surgery/",
     "page_title": "近視雷射、老花雷射、白內障術後為什麼要點眼藥水？", "page_view_count": 68, "scroll_75_count": 31, "completion_rate": 45.6},
    {"page_location": "https://medify.com.tw/doctor-10/myopia-3c-children/",
     "page_title": "3C 傷眼？兒童近視失控怎麼辦？矯正與預防一次搞懂", "page_view_count": 55, "scroll_75_count": 42, "completion_rate": 76.4},
    {"page_location": "https://medify.com.tw/doctor-10/macula-supplement/",
     "page_title": "預防黃斑部病變，哪些保健食品成分才有效？", "page_view_count": 49, "scroll_75_count": 12, "completion_rate": 24.5},
    {"page_location": "https://medify.com.tw/doctor-10/smile-recovery-time/",
     "page_title": "SMILE 近視雷射術後要休息多久？常見 Q&A 完整解答", "page_view_count": 43, "scroll_75_count": 38, "completion_rate": 88.4},
    {"page_location": "https://medify.com.tw/doctor-10/fish-oil-eye/",
     "page_title": "吃哪種魚對眼睛最好？深海魚營養排行榜一次看懂", "page_view_count": 31, "scroll_75_count": 8, "completion_rate": 25.8},
    {"page_location": "https://medify.com.tw/doctor-10/cataract-guide/",
     "page_title": "白內障手術完整指南：人工水晶體怎麼選？費用說明", "page_view_count": 28, "scroll_75_count": 22, "completion_rate": 78.6},
    {"page_location": "https://medify.com.tw/doctor-10/ortho-k-lens/",
     "page_title": "角膜塑形片（OK 鏡）適合哪些人？配戴注意事項", "page_view_count": 19, "scroll_75_count": 4, "completion_rate": 21.1},
    {"page_location": "https://medify.com.tw/doctor-10/presbyopia-laser/",
     "page_title": "老花雷射手術費用與成效：和老花眼鏡相比哪個好？", "page_view_count": 14, "scroll_75_count": 11, "completion_rate": 78.6},
    {"page_location": "https://medify.com.tw/doctor-10/blue-light-glasses/",
     "page_title": "藍光眼鏡有效嗎？護眼效果的科學分析", "page_view_count": 11, "scroll_75_count": 1, "completion_rate": 9.1},
    {"page_location": "https://medify.com.tw/doctor-10/vision-check-frequency/",
     "page_title": "多久做一次眼睛檢查才夠？不同年齡族群建議", "page_view_count": 8, "scroll_75_count": 6, "completion_rate": 75.0},
]

# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Doctor-10 文章分析月報產生器")
    parser.add_argument("--dry-run",  action="store_true", help="使用示範資料，不連 BigQuery")
    parser.add_argument("--no-push",  action="store_true", help="產生 HTML 但不 git push")
    parser.add_argument("--month",    default=None,        help="指定月份標籤，例如 M06")
    args = parser.parse_args()

    today = date.today()
    if args.month:
        month_label = args.month.upper()
        if not month_label.startswith("M"):
            month_label = "M" + month_label
    else:
        month_label = f"M{today.month:02d}"

    days         = CONFIG["DAYS"]
    date_from    = (today.__class__.fromordinal(today.toordinal() - days)).strftime("%Y/%m/%d")
    date_to      = today.strftime("%Y/%m/%d")
    generated_at = datetime.now().strftime("%Y/%m/%d %H:%M")
    filename     = f"report-{today.year}-{month_label}-article-analysis.html"
    output_path  = CONFIG["OUTPUT_DIR"] / filename

    if args.dry_run:
        print("🧪 DRY-RUN 模式：使用示範資料")
        rows = SAMPLE_ROWS
    else:
        if CONFIG["BQ_PROJECT"] == "YOUR_PROJECT":
            print("❌ BQ_PROJECT 未設定。請執行：")
            print("   export BQ_PROJECT='your-gcp-project-id'")
            print("   export BQ_DATASET='analytics_XXXXXXXXX'")
            sys.exit(1)
        try:
            from google.cloud import bigquery
        except ImportError:
            print("❌ 缺少相依套件：pip install google-cloud-bigquery")
            sys.exit(1)
        client = bigquery.Client(project=CONFIG["BQ_PROJECT"])
        sql    = q5_article_analysis(build_table_path(), days)
        print(f"🔍 查詢 BigQuery（近 {days} 天）...")
        rows = run_query(client, sql)
        print(f"   回傳 {len(rows)} 篇文章")

    html = build_html(rows, month_label, generated_at, date_from, date_to)
    output_path.write_text(html, encoding="utf-8")
    print(f"✅ 月報已產生：{output_path.name}")

    if not args.no_push and not args.dry_run:
        repo_dir = str(CONFIG["OUTPUT_DIR"])
        cmds = [
            ["git", "-C", repo_dir, "add",    filename],
            ["git", "-C", repo_dir, "commit", "-m", f"月報 {month_label}：Doctor-10 文章分析"],
            ["git", "-C", repo_dir, "push"],
        ]
        for cmd in cmds:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"⚠️  {' '.join(cmd[3:])} 失敗：{result.stderr.strip()}")
            else:
                print(f"   ✓ {' '.join(cmd[3:])}")
        print(f"\n🌐 月報已推送：https://agent863.github.io/medify/{filename}")
    elif args.dry_run:
        print(f"（dry-run：未 push，請手動移至 medify repo）")


if __name__ == "__main__":
    main()
