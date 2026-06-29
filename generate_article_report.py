#!/usr/bin/env python3
"""
generate_article_report.py
月報自動化腳本 — 文章四象限分析 + 全站 7 區塊

結構：
  [零]  Doctor-10 文章四象限分析（高/低流量 × 高/低閱讀完成比）
  [①–⑦] 全站標準 7 區塊（同週報，使用月份區間）

分析期間：自動取上個月（月初至月末），或以 --date-from / --date-to 手動指定

用法：
  python generate_article_report.py               # 產生上個月報告並 git push
  python generate_article_report.py --dry-run     # 產生示範 HTML，不連 BQ
  python generate_article_report.py --no-push     # 產生 HTML，不 git push
  python generate_article_report.py --month M07   # 指定月份標籤（影響檔名）
  python generate_article_report.py --date-from 2026-05-01 --date-to 2026-05-31
"""

import argparse
import calendar
import os
import statistics
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

# 從週報腳本匯入共用的區塊建立函式
sys.path.insert(0, str(Path(__file__).parent))
try:
    from generate_weekly_report import (
        DOCTORS, HOSPITAL_UTM, LOCATION_UTM,
        bq_table, sql_site_kpi, sql_doctor_traffic, sql_article_ranking,
        sql_category_ranking, sql_hospital_qr, sql_scroll_events,
        sql_article_pv_for_ratio, sql_reserve_clicks,
        make_sample_data as _weekly_sample_data,
        build_s1_kpi, build_s2_doctors, build_s3_articles, build_s4_categories,
        build_s5_hospital, build_s6_scroll, build_s7_reserve,
        e, fmt_num, wow_badge,
    )
    _WEEKLY_IMPORTED = True
except ImportError:
    _WEEKLY_IMPORTED = False

# ─── 設定區 ────────────────────────────────────────────────────────────────────

CONFIG = {
    "BQ_PROJECT": os.environ.get("BQ_PROJECT", "YOUR_PROJECT"),
    "BQ_DATASET": os.environ.get("BQ_DATASET", "YOUR_DATASET"),
    "PASSWORD":   "9053",
    "OUTPUT_DIR": Path(__file__).parent,
    # 閱讀完成比分界（%）
    "COMPLETION_THRESHOLD": 40,
}

# ──────────────────────────────────────────────────────────────────────────────

def prev_month_range() -> tuple[date, date]:
    """回傳上個月的第一天與最後一天"""
    today = date.today()
    first_of_this_month = today.replace(day=1)
    last_of_prev = first_of_this_month - __import__('datetime').timedelta(days=1)
    first_of_prev = last_of_prev.replace(day=1)
    return first_of_prev, last_of_prev


def build_table_path() -> str:
    return f"`{CONFIG['BQ_PROJECT']}.{CONFIG['BQ_DATASET']}.events_*`"


def q5_article_analysis(table: str, date_from: date, date_to: date) -> str:
    start = date_from.strftime("%Y%m%d")
    end   = date_to.strftime("%Y%m%d")
    return f"""
WITH base AS (
  SELECT
    event_name,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title')    AS page_title
  FROM {table}
  WHERE _TABLE_SUFFIX BETWEEN '{start}' AND '{end}'
  AND event_name IN ('page_view', 'scroll_75')
),
filtered AS (
  SELECT * FROM base
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
    SAFE_DIVIDE(COUNTIF(event_name = 'scroll_75'), COUNTIF(event_name = 'page_view')) * 100, 1
  ) AS completion_rate
FROM filtered
GROUP BY page_location
HAVING COUNTIF(event_name = 'page_view') > 0
ORDER BY page_view_count DESC
""".strip()


def run_query(client, sql: str) -> list[dict]:
    job  = client.query(sql)
    rows = list(job.result())
    return [dict(row) for row in rows]


def truncate(s: str, n: int = 44) -> str:
    if not s:
        return "—"
    return s[:n] + "…" if len(s) > n else s


# ──────────────────────────────────────────────────────────────────────────────
# HTML generation

_section_counter = 0


def make_table_section(rows: list[dict], title: str, subtitle: str,
                        header_color: str, show_n: int = 10) -> str:
    """生成單一排行表區塊 HTML，超過 show_n 筆時可展開"""
    global _section_counter
    _section_counter += 1
    sid = f"sec{_section_counter}"

    if not rows:
        tbody = """      <tr>
        <td colspan="5" style="text-align:center;padding:16px;color:#999;font-style:italic;">
          無符合條件的文章
        </td>
      </tr>"""
        expand_btn = ""
    else:
        visible = rows[:show_n]
        hidden  = rows[show_n:]

        def row_html(i: int, r: dict, hidden_row: bool = False) -> str:
            url        = r.get("page_location", "")
            title_text = truncate(r.get("page_title") or url or "—")
            link       = f'<a href="{url}" target="_blank" style="color:#0f3460;text-decoration:none;" ' \
                         f'onmouseover="this.style.textDecoration=\'underline\'" ' \
                         f'onmouseout="this.style.textDecoration=\'none\'">{title_text}</a>' if url else title_text
            pv  = r.get("page_view_count", 0)
            s75 = r.get("scroll_75_count", 0)
            cr  = r.get("completion_rate") or 0.0
            cr_color = "#27ae60" if cr >= 40 else "#e74c3c"
            bg  = "#f9fafc" if i % 2 == 0 else "#ffffff"
            display = ' style="display:none;"' if hidden_row else ""
            return (
                f'      <tr data-hidden="{str(hidden_row).lower()}" style="background:{bg};"{display}>\n'
                f'        <td style="text-align:center;font-weight:700;padding:8px 4px;">{i}</td>\n'
                f'        <td style="padding:8px 10px;">{link}</td>\n'
                f'        <td style="text-align:center;padding:8px 4px;font-weight:700;">{pv}</td>\n'
                f'        <td style="text-align:center;padding:8px 4px;">{s75}</td>\n'
                f'        <td style="text-align:center;padding:8px 4px;font-weight:700;color:{cr_color};">{cr}%</td>\n'
                f'      </tr>\n'
            )

        all_rows_html = ""
        for i, r in enumerate(visible, 1):
            all_rows_html += row_html(i, r, False)
        for i, r in enumerate(hidden, len(visible) + 1):
            all_rows_html += row_html(i, r, True)

        tbody = all_rows_html

        if hidden:
            expand_btn = (
                f'\n      <div style="text-align:center;padding:10px 0 4px;">'
                f'<button id="btn-{sid}" onclick="toggleRows(\'{sid}\')" '
                f'style="background:none;border:1px solid {header_color};color:{header_color};'
                f'border-radius:20px;padding:6px 20px;font-size:12px;cursor:pointer;font-weight:600;">'
                f'顯示更多 {len(hidden)} 篇 ▼</button></div>'
            )
        else:
            expand_btn = ""

    count_badge = f"{len(rows)} 篇" if rows else "0 篇"

    return f"""
    <div id="{sid}" style="margin-bottom:32px;">
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
              <th style="padding:10px 10px;font-weight:600;text-align:left;">文章標題</th>
              <th style="width:68px;padding:10px 4px;font-weight:600;text-align:center;">瀏覽數</th>
              <th style="width:84px;padding:10px 4px;font-weight:600;text-align:center;">完成次數</th>
              <th style="width:100px;padding:10px 4px;font-weight:600;text-align:center;">閱讀完成比(%)</th>
            </tr>
          </thead>
          <tbody>
{tbody}          </tbody>
        </table>{expand_btn}
      </div>
    </div>"""


def fetch_standard_data(d_from: date, d_to: date, dry_run: bool) -> dict | None:
    """抓取全站標準 7 區塊資料（月份區間）"""
    if not _WEEKLY_IMPORTED:
        return None

    # 比較期：上一個月
    prev_d_to   = d_from - timedelta(days=1)
    prev_d_from = prev_d_to.replace(day=1)
    ws = d_from.strftime("%Y%m%d")
    we = d_to.strftime("%Y%m%d")
    ps = prev_d_from.strftime("%Y%m%d")
    pe = prev_d_to.strftime("%Y%m%d")

    if dry_run:
        return _weekly_sample_data()

    from google.cloud import bigquery
    client = bigquery.Client(project=CONFIG["BQ_PROJECT"])
    t = bq_table()

    def run(sql):
        return [dict(r) for r in client.query(sql).result()]

    print("⏳ 月報標準區塊 1/7: 全站 KPI …")
    kpi_rows = run(sql_site_kpi(t, ws, we, ps, pe))
    kpi = {}
    for r in kpi_rows:
        kpi[r["week"]] = {k: v for k, v in r.items() if k != "week"}

    print("⏳ 月報標準區塊 2/7: 各醫師報告 …")
    doc_rows = run(sql_doctor_traffic(t, ws, we, ps, pe))
    doctors = {}
    for r in doc_rows:
        did  = r["doctor_id"]
        week = r["week"]
        if did not in doctors:
            doctors[did] = {"curr_page_views": 0, "curr_unique": 0,
                            "curr_homepage": 0, "prev_page_views": 0}
        if week == "current":
            doctors[did]["curr_page_views"] = r["page_views"]
            doctors[did]["curr_unique"]     = r["unique_users"]
            doctors[did]["curr_homepage"]   = r.get("homepage_views", 0)
        else:
            doctors[did]["prev_page_views"] = r["page_views"]
    for d in DOCTORS:
        if d["id"] not in doctors:
            doctors[d["id"]] = {"curr_page_views": 0, "curr_unique": 0,
                                 "curr_homepage": 0, "prev_page_views": 0}

    print("⏳ 月報標準區塊 3/7: 熱門文章 …")
    articles = run(sql_article_ranking(t, ws, we))[:10]

    print("⏳ 月報標準區塊 4/7: 文章分類 …")
    categories = run(sql_category_ranking(t, ws, we))

    print("⏳ 月報標準區塊 5/7: 醫院 QR Code …")
    qr_rows = run(sql_hospital_qr(t, ws, we, ps, pe))
    hospital_qr = {}
    for r in qr_rows:
        hk = r["hospital_key"]
        lk = r["location_key"]
        if hk not in hospital_qr:
            hospital_qr[hk] = {}
        if lk not in hospital_qr[hk]:
            hospital_qr[hk][lk] = {"curr_sessions": 0, "curr_users": 0, "prev_sessions": 0}
        if r["week"] == "current":
            hospital_qr[hk][lk]["curr_sessions"] = r["sessions"]
            hospital_qr[hk][lk]["curr_users"]    = r["unique_users"]
        else:
            hospital_qr[hk][lk]["prev_sessions"] = r["sessions"]

    print("⏳ 月報標準區塊 6/7: Scroll 事件 …")
    scroll_rows = run(sql_scroll_events(t, ws, we, ps, pe))
    pv_rows     = run(sql_article_pv_for_ratio(t, ws, we, ps, pe))
    scroll = {}
    for r in scroll_rows:
        ev = r["event_name"]
        if ev not in scroll:
            scroll[ev] = {"curr_count": 0, "curr_users": 0, "prev_count": 0}
        if r["week"] == "current":
            scroll[ev]["curr_count"] = r["event_count"]
            scroll[ev]["curr_users"] = r["unique_users"]
        else:
            scroll[ev]["prev_count"] = r["event_count"]
    pv_map = {r["week"]: r for r in pv_rows}
    scroll["article_pv_curr"] = pv_map.get("current",  {}).get("article_page_views", 0)
    scroll["article_pv_prev"] = pv_map.get("previous", {}).get("article_page_views", 0)

    print("⏳ 月報標準區塊 7/7: 預約按鈕 …")
    res_rows = run(sql_reserve_clicks(t, ws, we, ps, pe))
    reserve = {"curr_clicks": 0, "curr_users": 0, "prev_clicks": 0, "prev_users": 0}
    for r in res_rows:
        if r["week"] == "current":
            reserve["curr_clicks"] = r["reserve_clicks"]
            reserve["curr_users"]  = r["unique_users"]
        else:
            reserve["prev_clicks"] = r["reserve_clicks"]
            reserve["prev_users"]  = r["unique_users"]

    return {
        "site_kpi":    kpi,
        "doctors":     doctors,
        "articles":    articles,
        "categories":  categories,
        "hospital_qr": hospital_qr,
        "scroll":      scroll,
        "reserve":     reserve,
    }


def build_standard_sections(std_data: dict) -> str:
    """組合全站標準 7 區塊 HTML"""
    if not _WEEKLY_IMPORTED or std_data is None:
        return ""
    return (
        build_s1_kpi(std_data) +
        build_s2_doctors(std_data) +
        build_s3_articles(std_data) +
        build_s4_categories(std_data) +
        build_s5_hospital(std_data) +
        build_s6_scroll(std_data) +
        build_s7_reserve(std_data)
    )


def build_html(rows: list[dict], month_label: str, generated_at: str,
               date_from_str: str, date_to_str: str,
               standard_sections_html: str = "") -> str:
    global _section_counter
    _section_counter = 0

    pw    = CONFIG["PASSWORD"]
    ct    = CONFIG["COMPLETION_THRESHOLD"]
    total = len(rows)

    if rows:
        views_list   = [r["page_view_count"] for r in rows]
        median_views = statistics.median(views_list)
        threshold    = int(median_views) if median_views == int(median_views) else round(median_views, 1)
    else:
        threshold = 0

    high = [r for r in rows if r["page_view_count"] >  threshold]
    low  = [r for r in rows if r["page_view_count"] <= threshold]

    hh = sorted([r for r in high if (r.get("completion_rate") or 0) >= ct],
                key=lambda x: (x.get("completion_rate") or 0), reverse=True)
    hl = sorted([r for r in high if (r.get("completion_rate") or 0) <  ct],
                key=lambda x: (x.get("completion_rate") or 0))
    lh = sorted([r for r in low  if (r.get("completion_rate") or 0) >= ct],
                key=lambda x: (x.get("completion_rate") or 0), reverse=True)
    ll = sorted([r for r in low  if (r.get("completion_rate") or 0) <  ct],
                key=lambda x: (x.get("completion_rate") or 0))

    sections_html = (
        make_table_section(hh,
            "🔥 高流量 × 高閱讀完成（表現最佳）",
            f"瀏覽數 &gt; {threshold} 且閱讀完成比 &ge; {ct}%，由高到低排序",
            "#27ae60") +
        make_table_section(hl,
            "⚠️ 高流量 × 低閱讀完成（流量好，讀者跑掉）",
            f"瀏覽數 &gt; {threshold} 且閱讀完成比 &lt; {ct}%，由低到高排序 — 優先優化內容結構",
            "#e67e22") +
        make_table_section(lh,
            "💎 低流量 × 高閱讀完成（隱藏寶石）",
            f"瀏覽數 &le; {threshold} 且閱讀完成比 &ge; {ct}%，由高到低排序 — 加強推廣與 SEO",
            "#2980b9") +
        make_table_section(ll,
            "🔻 低流量 × 低閱讀完成（需要關注）",
            f"瀏覽數 &le; {threshold} 且閱讀完成比 &lt; {ct}%，由低到高排序 — 評估是否重寫或下架",
            "#c0392b")
    )

    try:
        m_num = int(month_label.lstrip("Mm"))
        display_month = f"{date.today().year} 年 {m_num:02d} 月"
    except Exception:
        display_month = month_label

    return f"""<!DOCTYPE html>
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
      display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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
    .summary-value {{ font-size: 28px; font-weight: 800; color: #1a1a2e; line-height: 1; }}
    .summary-sub {{ font-size: 12px; color: #aaa; margin-top: 6px; }}
    .section-label {{
      font-size: 18px; font-weight: 700; color: #0f3460;
      margin-bottom: 20px; padding-bottom: 10px;
      border-bottom: 3px solid #0f3460;
    }}
    .footer {{
      text-align: center; color: #aaa; font-size: 12px;
      padding: 28px 24px; border-top: 1px solid #e6ebf2; margin-top: 8px;
    }}
  </style>
</head>
<body>

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

<div id="report">
  <div class="header">
    <div class="header-top">
      <div class="header-brand">🏥 Medify 醫病關係平台</div>
      <div class="header-period">資料來源：GA4 BigQuery</div>
    </div>
    <h1>Doctor-10 文章表現月報 — {month_label}</h1>
    <div class="header-badge">
      📅 分析期間：{date_from_str} – {date_to_str} ｜ 產生時間：{generated_at}
    </div>
  </div>

  <div class="container">

    <div class="summary-bar">
      <div class="summary-card">
        <div class="summary-label">分析文章數</div>
        <div class="summary-value">{total}</div>
        <div class="summary-sub">有瀏覽紀錄的文章</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">瀏覽數中位數</div>
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
      <div class="summary-card" style="border-top-color:#888;">
        <div class="summary-label">閱讀完成比門檻</div>
        <div class="summary-value" style="color:#555;">{ct}%</div>
        <div class="summary-sub">高低分界</div>
      </div>
    </div>

    <div class="section-label">📊 Doctor-10 文章四象限分析（{date_from_str} – {date_to_str}）</div>

{sections_html}

    {"" if not standard_sections_html else '<div class="section-label" style="margin-top:40px;">📈 全站標準報告（' + date_from_str + ' – ' + date_to_str + '）</div>' + standard_sections_html}

  </div>

  <div class="footer">
    文章表現月報 {month_label} ｜ 資料來源：GA4 BigQuery ｜ 產生時間：{generated_at}<br>
    Doctor-10 何宜儒醫師 · 澄清眼科 · 自動生成 by Claude Agent
  </div>
</div>

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

  function toggleRows(sid) {{
    const section = document.getElementById(sid);
    const hidden  = section.querySelectorAll('tr[data-hidden="true"]');
    const btn     = document.getElementById('btn-' + sid);
    const isHidden = hidden[0] && hidden[0].style.display === 'none';
    hidden.forEach(r => r.style.display = isHidden ? '' : 'none');
    if (isHidden) {{
      btn.textContent = '收合 ▲';
    }} else {{
      const count = hidden.length;
      const origText = btn.dataset.orig || (btn.dataset.orig = btn.textContent);
      btn.textContent = origText;
    }}
  }}
</script>
</body>
</html>"""


# ──────────────────────────────────────────────────────────────────────────────
# DRY-RUN sample data (May 2026 simulated)

SAMPLE_ROWS = [
    {"page_location": "https://medify.com.tw/doctor-10/smile-vs-lasik/",
     "page_title": "SMILE 近視雷射 vs LASIK 怎麼選？術前完整比較",
     "page_view_count": 112, "scroll_75_count": 89, "completion_rate": 79.5},
    {"page_location": "https://medify.com.tw/doctor-10/dry-eye-cause/",
     "page_title": "眼睛好乾！乾眼症的常見原因與治療方式完整說明",
     "page_view_count": 98, "scroll_75_count": 72, "completion_rate": 73.5},
    {"page_location": "https://medify.com.tw/doctor-10/eye-drops-after-surgery/",
     "page_title": "近視雷射、老花雷射、白內障術後為什麼要點眼藥水？",
     "page_view_count": 87, "scroll_75_count": 31, "completion_rate": 35.6},
    {"page_location": "https://medify.com.tw/doctor-10/myopia-3c-children/",
     "page_title": "3C 傷眼？兒童近視失控怎麼辦？矯正與預防一次搞懂",
     "page_view_count": 74, "scroll_75_count": 58, "completion_rate": 78.4},
    {"page_location": "https://medify.com.tw/doctor-10/macula-supplement/",
     "page_title": "預防黃斑部病變，哪些保健食品成分才有效？",
     "page_view_count": 66, "scroll_75_count": 14, "completion_rate": 21.2},
    {"page_location": "https://medify.com.tw/doctor-10/smile-recovery-time/",
     "page_title": "SMILE 近視雷射術後要休息多久？常見 Q&A 完整解答",
     "page_view_count": 59, "scroll_75_count": 52, "completion_rate": 88.1},
    {"page_location": "https://medify.com.tw/doctor-10/fish-oil-eye/",
     "page_title": "吃哪種魚對眼睛最好？深海魚營養排行榜一次看懂",
     "page_view_count": 51, "scroll_75_count": 11, "completion_rate": 21.6},
    {"page_location": "https://medify.com.tw/doctor-10/cataract-guide/",
     "page_title": "白內障手術完整指南：人工水晶體怎麼選？費用說明",
     "page_view_count": 44, "scroll_75_count": 36, "completion_rate": 81.8},
    {"page_location": "https://medify.com.tw/doctor-10/ortho-k-lens/",
     "page_title": "角膜塑形片（OK 鏡）適合哪些人？配戴注意事項",
     "page_view_count": 38, "scroll_75_count": 7, "completion_rate": 18.4},
    {"page_location": "https://medify.com.tw/doctor-10/presbyopia-laser/",
     "page_title": "老花雷射手術費用與成效：和老花眼鏡相比哪個好？",
     "page_view_count": 31, "scroll_75_count": 25, "completion_rate": 80.6},
    {"page_location": "https://medify.com.tw/doctor-10/blue-light-glasses/",
     "page_title": "藍光眼鏡有效嗎？護眼效果的科學分析",
     "page_view_count": 27, "scroll_75_count": 3, "completion_rate": 11.1},
    {"page_location": "https://medify.com.tw/doctor-10/vision-check-frequency/",
     "page_title": "多久做一次眼睛檢查才夠？不同年齡族群建議",
     "page_view_count": 22, "scroll_75_count": 18, "completion_rate": 81.8},
    {"page_location": "https://medify.com.tw/doctor-10/laser-eye-recovery-diet/",
     "page_title": "近視雷射術後飲食禁忌：哪些食物要避免？",
     "page_view_count": 19, "scroll_75_count": 8, "completion_rate": 42.1},
    {"page_location": "https://medify.com.tw/doctor-10/eye-allergy-treatment/",
     "page_title": "過敏性結膜炎怎麼治療？春天眼睛癢的完整對策",
     "page_view_count": 15, "scroll_75_count": 2, "completion_rate": 13.3},
    {"page_location": "https://medify.com.tw/doctor-10/high-myopia-retina/",
     "page_title": "高度近視的視網膜風險：什麼情況要立即就醫？",
     "page_view_count": 11, "scroll_75_count": 9, "completion_rate": 81.8},
]

# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Doctor-10 文章分析月報產生器")
    parser.add_argument("--dry-run",    action="store_true", help="使用示範資料，不連 BigQuery")
    parser.add_argument("--no-push",    action="store_true", help="產生 HTML 但不 git push")
    parser.add_argument("--month",      default=None,        help="月份標籤，例如 M06")
    parser.add_argument("--date-from",  default=None,        help="查詢起始日，格式 YYYY-MM-DD")
    parser.add_argument("--date-to",    default=None,        help="查詢結束日，格式 YYYY-MM-DD")
    args = parser.parse_args()

    # 確定查詢日期範圍
    if args.date_from and args.date_to:
        d_from = date.fromisoformat(args.date_from)
        d_to   = date.fromisoformat(args.date_to)
    else:
        d_from, d_to = prev_month_range()

    # 月份標籤
    if args.month:
        month_label = args.month.upper()
        if not month_label.startswith("M"):
            month_label = "M" + month_label
    else:
        month_label = f"M{d_from.month:02d}"

    date_from_str = d_from.strftime("%Y/%m/%d")
    date_to_str   = d_to.strftime("%Y/%m/%d")
    generated_at  = datetime.now().strftime("%Y/%m/%d %H:%M")
    filename      = f"report-{d_from.year}-{month_label}-article-analysis.html"
    output_path   = CONFIG["OUTPUT_DIR"] / filename

    if args.dry_run:
        print("🧪 DRY-RUN 模式：使用示範資料")
        rows = SAMPLE_ROWS
    else:
        if CONFIG["BQ_PROJECT"] == "YOUR_PROJECT":
            print("❌ BQ_PROJECT 未設定：export BQ_PROJECT='...' BQ_DATASET='...'")
            sys.exit(1)
        try:
            from google.cloud import bigquery
        except ImportError:
            print("❌ pip install google-cloud-bigquery")
            sys.exit(1)
        client = bigquery.Client(project=CONFIG["BQ_PROJECT"])
        sql    = q5_article_analysis(build_table_path(), d_from, d_to)
        print(f"🔍 查詢 BigQuery 文章四象限（{date_from_str} – {date_to_str}）...")
        rows = run_query(client, sql)
        print(f"   回傳 {len(rows)} 篇文章")

    # 全站標準 7 區塊
    if _WEEKLY_IMPORTED:
        print(f"🔍 查詢全站標準 7 區塊{'（乾跑）' if args.dry_run else ''}...")
        std_data = fetch_standard_data(d_from, d_to, args.dry_run)
        std_html = build_standard_sections(std_data)
    else:
        print("⚠️  generate_weekly_report.py 未找到，略過標準 7 區塊")
        std_html = ""

    html = build_html(rows, month_label, generated_at, date_from_str, date_to_str,
                      standard_sections_html=std_html)
    output_path.write_text(html, encoding="utf-8")
    print(f"✅ 月報已產生：{output_path.name}")
    print(f"   分析期間：{date_from_str} – {date_to_str}")

    if not args.no_push and not args.dry_run:
        repo_dir = str(CONFIG["OUTPUT_DIR"])
        for cmd in [
            ["git", "-C", repo_dir, "add",    filename],
            ["git", "-C", repo_dir, "commit", "-m", f"月報 {month_label}：Doctor-10 文章分析 {date_from_str}–{date_to_str}"],
            ["git", "-C", repo_dir, "push"],
        ]:
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode != 0:
                print(f"⚠️  {' '.join(cmd[3:])} 失敗：{r.stderr.strip()}")
            else:
                print(f"   ✓ {' '.join(cmd[3:])}")
        print(f"\n🌐 https://agent863.github.io/medify/{filename}")
    elif args.dry_run:
        print("（dry-run：未 push）")


if __name__ == "__main__":
    main()
