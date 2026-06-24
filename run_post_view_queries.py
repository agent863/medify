#!/usr/bin/env python3
"""
run_post_view_queries.py
週報自動化腳本 — 執行 GA4 BigQuery post_view 事件分析

功能：
1. Query 1：欄位探索（確認 event_params key 名稱）
2. Query 2：熱門文章排行（group by post_id / content_id）
3. Query 3：醫師文章總瀏覽排行（group by doctor_id）
4. Query 4：WoW 週對週比較
5. Query 5：Doctor-10 文章分析（滾動 30 天）

輸出：
- 終端機格式化報告
- post_view_results_YYYY-Wxx.json（供後續 HTML 注入使用）
- article_analysis_snippet.html（Doctor-10 文章分析 HTML 片段）

設定方式：
1. 安裝相依套件：pip install google-cloud-bigquery tabulate
2. 設定 Google Cloud 認證（擇一）：
a. 服務帳號：export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
b. 使用者帳號：執行 gcloud auth application-default login
3. 修改下方 CONFIG 的 BQ_PROJECT 和 BQ_DATASET

用法：
python run_post_view_queries.py # 自動偵測上週日期範圍
python run_post_view_queries.py --week W21 # 指定週次
python run_post_view_queries.py --dry-run # 只印出 SQL，不實際執行
"""

import argparse
import json
import os
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path

# ─── 設定區 ────────────────────────────────────────────────────────────────────

CONFIG = {
    # BigQuery 設定（必填）
    "BQ_PROJECT": os.environ.get("BQ_PROJECT", "YOUR_PROJECT"),  # GCP 專案 ID
    "BQ_DATASET": os.environ.get("BQ_DATASET", "YOUR_DATASET"),  # GA4 export 資料集

    # post_view event_params 欄位名稱（Query 1 執行後若不同請更新）
    "POST_ID_KEY":    os.environ.get("POST_ID_KEY",    "post_id"),    # 文章識別符 key
    "DOCTOR_ID_KEY":  os.environ.get("DOCTOR_ID_KEY",  "doctor_id"),  # 醫師 ID key
    "POST_TITLE_KEY": os.environ.get("POST_TITLE_KEY", "post_title"), # 文章標題 key（可選）

    # 輸出目錄
    "OUTPUT_DIR": Path(__file__).parent,
}

# ──────────────────────────────────────────────────────────────────────────────

def get_week_date_range(week_label: str | None = None) -> tuple[str, str, str, str, str, str]:
    """
    回傳 (week_label, w_start, w_end, prev_start, prev_end, period_str)
    日期格式：YYYYMMDD（BQ suffix）
    """
    today = date.today()
    last_monday = today - timedelta(days=today.weekday() + 7)
    last_sunday = last_monday + timedelta(days=6)

    if week_label:
        # 以 week_label 推算（簡化：假設本年）
        wn = int(week_label.lstrip("Ww"))
        last_monday = date.fromisocalendar(today.year, wn, 1)
        last_sunday = last_monday + timedelta(days=6)
    else:
        wn = last_monday.isocalendar()[1]
        week_label = f"W{wn:02d}"

    prev_monday = last_monday - timedelta(days=7)
    prev_sunday = last_sunday - timedelta(days=7)

    fmt = "%Y%m%d"
    period_str = f"{last_monday.strftime('%m/%d')}–{last_sunday.strftime('%m/%d')}"
    return (
        week_label,
        last_monday.strftime(fmt),
        last_sunday.strftime(fmt),
        prev_monday.strftime(fmt),
        prev_sunday.strftime(fmt),
        period_str,
    )

def build_table_path() -> str:
    p = CONFIG["BQ_PROJECT"]
    d = CONFIG["BQ_DATASET"]
    return f"`{p}.{d}.events_*`"

def q1_field_exploration(table: str, w_start: str, w_end: str) -> str:
    return f"""
-- Query 1: 欄位探索
SELECT
  ep.key AS param_key,
  ep.value.string_value AS sample_string_value,
  COUNT(*) AS occurrence_count
FROM {table}, UNNEST(event_params) AS ep
WHERE event_name = 'post_view'
  AND _TABLE_SUFFIX BETWEEN '{w_start}' AND '{w_end}'
GROUP BY param_key, sample_string_value
ORDER BY occurrence_count DESC
LIMIT 30
""".strip()

def q2_article_ranking(table: str, w_start: str, w_end: str) -> str:
    pk = CONFIG["POST_ID_KEY"]
    dk = CONFIG["DOCTOR_ID_KEY"]
    tk = CONFIG["POST_TITLE_KEY"]
    return f"""
-- Query 2: 熱門文章排行
WITH pv AS (
  SELECT
    user_pseudo_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = '{pk}') AS post_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = '{tk}') AS post_title,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = '{dk}') AS doctor_id
  FROM {table}
  WHERE event_name = 'post_view'
    AND _TABLE_SUFFIX BETWEEN '{w_start}' AND '{w_end}'
)
SELECT
  post_id,
  MAX(post_title) AS post_title,
  MAX(doctor_id) AS doctor_id,
  COUNT(*) AS post_view_count,
  COUNT(DISTINCT user_pseudo_id) AS unique_users
FROM pv
WHERE post_id IS NOT NULL
GROUP BY post_id
ORDER BY post_view_count DESC
LIMIT 20
""".strip()

def q3_doctor_ranking(table: str, w_start: str, w_end: str) -> str:
    pk = CONFIG["POST_ID_KEY"]
    dk = CONFIG["DOCTOR_ID_KEY"]
    return f"""
-- Query 3: 醫師文章總瀏覽排行
WITH pv AS (
  SELECT
    user_pseudo_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = '{dk}') AS doctor_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = '{pk}') AS post_id
  FROM {table}
  WHERE event_name = 'post_view'
    AND _TABLE_SUFFIX BETWEEN '{w_start}' AND '{w_end}'
)
SELECT
  doctor_id,
  COUNT(*) AS total_post_view_count,
  COUNT(DISTINCT post_id) AS distinct_articles,
  COUNT(DISTINCT user_pseudo_id) AS unique_users
FROM pv
WHERE doctor_id IS NOT NULL
GROUP BY doctor_id
ORDER BY total_post_view_count DESC
""".strip()

def q4_wow_comparison(table: str, w_start: str, w_end: str, prev_start: str, prev_end: str) -> str:
    dk = CONFIG["DOCTOR_ID_KEY"]
    return f"""
-- Query 4: WoW 比較
WITH weekly AS (
  SELECT
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = '{dk}') AS doctor_id,
    CASE
      WHEN _TABLE_SUFFIX BETWEEN '{w_start}' AND '{w_end}'     THEN 'current'
      WHEN _TABLE_SUFFIX BETWEEN '{prev_start}' AND '{prev_end}' THEN 'previous'
    END AS week_type,
    COUNT(*) AS pv_count
  FROM {table}
  WHERE event_name = 'post_view'
    AND _TABLE_SUFFIX BETWEEN '{prev_start}' AND '{w_end}'
  GROUP BY doctor_id, week_type
)
SELECT
  c.doctor_id,
  c.pv_count AS current_count,
  COALESCE(p.pv_count, 0) AS prev_count,
  c.pv_count - COALESCE(p.pv_count, 0) AS delta,
  ROUND(SAFE_DIVIDE(
    c.pv_count - COALESCE(p.pv_count, 0),
    COALESCE(p.pv_count, 0)
  ) * 100, 1) AS wow_pct
FROM weekly c
LEFT JOIN weekly p ON c.doctor_id = p.doctor_id AND p.week_type = 'previous'
WHERE c.week_type = 'current'
  AND c.doctor_id IS NOT NULL
ORDER BY c.pv_count DESC
""".strip()

def q5_article_analysis(table: str, days: int = 30) -> str:
    """
    Doctor-10 文章分析 — 滾動 {days} 天
    文章 URL 條件：
      - 符合 medify.com.tw/doctor-10/<slug> 或 medify.com.tw/default/<slug>
      - 不含 /category/
    指標：page_view_count、scroll_75_count、completion_rate
    """
    return f"""
-- Query 5: Doctor-10 文章分析（滾動 {days} 天）
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
  MAX(page_title)                                                            AS page_title,
  COUNTIF(event_name = 'page_view')                                         AS page_view_count,
  COUNTIF(event_name = 'scroll_75')                                         AS scroll_75_count,
  ROUND(
    SAFE_DIVIDE(COUNTIF(event_name = 'scroll_75'),
                COUNTIF(event_name = 'page_view')) * 100,
  1)                                                                         AS completion_rate
FROM filtered
GROUP BY page_location
HAVING COUNTIF(event_name = 'page_view') > 0
ORDER BY page_view_count DESC
""".strip()

def run_query(client, sql: str, label: str) -> list[dict]:
    """執行 BQ 查詢，回傳 list of dict。"""
    print(f"\n🔍 執行 {label}...")
    job = client.query(sql)
    rows = list(job.result())
    print(f"   回傳 {len(rows)} 筆")
    return [dict(row) for row in rows]

def print_table(rows: list[dict], title: str) -> None:
    """格式化印出查詢結果。"""
    if not rows:
        print(f"   （{title}：無資料）")
        return
    try:
        from tabulate import tabulate
        print(f"\n📊 {title}")
        print(tabulate(rows, headers="keys", tablefmt="github", floatfmt=".1f"))
    except ImportError:
        print(f"\n📊 {title}（安裝 tabulate 可獲得更好格式：pip install tabulate）")
        headers = list(rows[0].keys())
        print("  " + " | ".join(headers))
        print("  " + "-" * 60)
        for row in rows:
            print("  " + " | ".join(str(v) for v in row.values()))

def check_fields(field_rows: list[dict]) -> None:
    """Q1 結果分析：確認必要欄位存在。"""
    pk = CONFIG["POST_ID_KEY"]
    dk = CONFIG["DOCTOR_ID_KEY"]
    found_keys = {r["param_key"] for r in field_rows}

    print("\n🔎 欄位檢查：")
    for key, label in [(pk, "文章識別符"), (dk, "醫師 ID")]:
        status = "✅" if key in found_keys else "❌ 未找到"
        print(f"   {status} {key} ({label})")

    # 若欄位不存在，提示可能的候選
    if pk not in found_keys:
        candidates = [r["param_key"] for r in field_rows
                      if any(kw in r["param_key"] for kw in ["post", "article", "content"])]
        if candidates:
            print(f"   ⚠️  可能的文章欄位候選：{candidates}")
            print(f"   → 請更新 CONFIG['POST_ID_KEY'] 或設定環境變數 POST_ID_KEY")

def save_results(results: dict, week_label: str) -> Path:
    """將結果存成 JSON 檔，供 HTML 注入使用。"""
    output_path = CONFIG["OUTPUT_DIR"] / f"post_view_results_{week_label}.json"
    # 處理不可 JSON 序列化的型別
    def default_serializer(obj):
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        return str(obj)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2, default=default_serializer)
    print(f"\n💾 結果已儲存：{output_path.name}")
    return output_path

def print_html_snippet(article_rows: list[dict], doctor_rows: list[dict], week_label: str) -> None:
    """印出可直接貼入 HTML 的表格 rows。"""
    print(f"\n{'='*60}")
    print("📋 HTML 貼入片段（替換 1.4 表格 tbody 內容）：")
    print(f"{'='*60}")
    for i, r in enumerate(article_rows[:10], 1):
        post_id = r.get("post_id", "—")
        title   = r.get("post_title") or "—"
        count   = r.get("post_view_count", 0)
        doctor  = r.get("doctor_id", "—")
        print(f'  <tr><td>{i}</td>'
              f'<td><code style="font-size:12px;font-family:monospace;">{post_id}</code></td>'
              f'<td>{title}</td>'
              f'<td class="num">{count}</td>'
              f'<td><code style="font-size:12px;font-family:monospace;">{doctor}</code></td></tr>')

    print(f"\n{'='*60}")
    print("📋 HTML 貼入片段（替換 1.5 表格 tbody 內容）：")
    print(f"{'='*60}")
    for i, r in enumerate(doctor_rows, 1):
        doctor = r.get("doctor_id", "—")
        count  = r.get("total_post_view_count", 0)
        arts   = r.get("distinct_articles", "—")
        print(f'  <tr><td>{i}</td>'
              f'<td><code style="font-size:12px;font-family:monospace;">{doctor}</code></td>'
              f'<td>（待填姓名）</td>'
              f'<td class="num">{count}</td>'
              f'<td class="num">{arts}</td>'
              f'<td><span class="pill neutral">—</span></td></tr>')

def generate_article_analysis_html(rows: list[dict]) -> str:
    """
    根據 q5 查詢結果，生成 Doctor-10 文章分析 HTML 片段。
    - 動態計算中位數作為高/低瀏覽閾值
    - 輸出 4 個排行表：高瀏覽×高完讀、高瀏覽×低完讀、低瀏覽×高完讀、低瀏覽×低完讀
    """
    if not rows:
        return "<p>⚠️ 無文章分析資料</p>"

    # 動態中位數閾值
    views = [r["page_view_count"] for r in rows]
    median_views = statistics.median(views)
    median_label = int(median_views) if median_views == int(median_views) else median_views

    high_rows = [r for r in rows if r["page_view_count"] >  median_views]
    low_rows  = [r for r in rows if r["page_view_count"] <= median_views]

    def truncate(s: str, n: int = 40) -> str:
        if not s:
            return "—"
        return s[:n] + "…" if len(s) > n else s

    TABLE_HEADER = """
        <thead>
          <tr style="background:#0f3460;color:#fff;text-align:center;">
            <th style="width:44px;padding:8px 4px;">排名</th>
            <th style="text-align:left;padding:8px;">文章標題</th>
            <th style="width:72px;padding:8px 4px;">瀏覽數</th>
            <th style="width:90px;padding:8px 4px;">閱讀完成數</th>
            <th style="width:100px;padding:8px 4px;">符合預期度(%)</th>
          </tr>
        </thead>"""

    def make_table(subset: list[dict], sort_key: str, ascending: bool, top_n: int = 5) -> str:
        sorted_subset = sorted(subset, key=lambda x: x.get(sort_key, 0), reverse=not ascending)[:top_n]
        if not sorted_subset:
            return (
                f"{TABLE_HEADER}\n"
                "        <tbody><tr><td colspan='5' style='text-align:center;padding:12px;color:#888;'>"
                "無資料</td></tr></tbody>"
            )
        rows_html = ""
        for i, r in enumerate(sorted_subset, 1):
            title = truncate(r.get("page_title") or r.get("page_location", "—"))
            pv    = r.get("page_view_count", 0)
            s75   = r.get("scroll_75_count", 0)
            cr    = r.get("completion_rate", 0.0)
            bg    = "#f9f9f9" if i % 2 == 0 else "#ffffff"
            rows_html += (
                f"          <tr style='background:{bg};'>"
                f"<td style='text-align:center;font-weight:bold;padding:7px 4px;'>{i}</td>"
                f"<td style='padding:7px 8px;'>{title}</td>"
                f"<td style='text-align:center;padding:7px 4px;'>{pv}</td>"
                f"<td style='text-align:center;padding:7px 4px;'>{s75}</td>"
                f"<td style='text-align:center;padding:7px 4px;'>{cr}%</td>"
                f"</tr>\n"
            )
        return f"{TABLE_HEADER}\n        <tbody>\n{rows_html}        </tbody>"

    SECTIONS = [
        ("🏆 高瀏覽 × 高完讀率",       "表現最佳，持續深耕",               high_rows, "completion_rate", False),
        ("⚠️ 高瀏覽 × 低完讀率",       "流量高但留存差，優先改善內容結構",   high_rows, "completion_rate", True),
        ("💎 低瀏覽 × 高完讀率",       "隱藏佳作，加強推廣與 SEO",          low_rows,  "completion_rate", False),
        ("🔴 低瀏覽 × 低完讀率",       "雙重困境，評估是否重寫或下架",       low_rows,  "completion_rate", True),
    ]

    tables_html = ""
    for title, subtitle, subset, sort_key, ascending in SECTIONS:
        inner = make_table(subset, sort_key, ascending)
        tables_html += f"""
      <div style="margin-bottom:28px;">
        <h4 style="color:#0f3460;margin:0 0 4px;font-size:15px;">{title}</h4>
        <p style="margin:0 0 8px;font-size:12px;color:#666;">{subtitle}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e0e0e0;">
          {inner}
        </table>
      </div>
"""

    total = len(rows)
    html = f"""<section style="background:#fff;border-radius:12px;padding:24px;margin-bottom:28px;box-shadow:0 2px 10px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#0f3460 0%,#16213e 100%);color:#fff;padding:18px 22px;border-radius:8px;margin-bottom:22px;">
    <h3 style="margin:0 0 6px;font-size:19px;">📊 Doctor-10 文章分析（近 30 天）</h3>
    <p style="margin:0;font-size:13px;opacity:0.88;">
      共 {total} 篇文章｜中位數瀏覽數：<strong>{median_label}</strong>
      ｜高瀏覽（&gt;{median_label}）：{len(high_rows)} 篇｜低瀏覽（&le;{median_label}）：{len(low_rows)} 篇
    </p>
  </div>
  {tables_html}
</section>"""

    return html

def main():
    parser = argparse.ArgumentParser(description="執行 post_view BigQuery 分析")
    parser.add_argument("--week",    default=None,  help="指定週次，例如 W21")
    parser.add_argument("--dry-run", action="store_true", help="只印出 SQL，不實際執行")
    parser.add_argument("--no-save", action="store_true", help="不儲存 JSON 結果檔")
    args = parser.parse_args()

    week_label, w_start, w_end, prev_start, prev_end, period = get_week_date_range(args.week)
    table = build_table_path()

    print(f"📅 週次：{week_label}（{period}）")
    print(f"   本週 suffix：{w_start} – {w_end}")
    print(f"   上週 suffix：{prev_start} – {prev_end}")
    print(f"   資料表：{table}")

    # 組合 SQL
    sql_q1 = q1_field_exploration(table, w_start, w_end)
    sql_q2 = q2_article_ranking(table, w_start, w_end)
    sql_q3 = q3_doctor_ranking(table, w_start, w_end)
    sql_q4 = q4_wow_comparison(table, w_start, w_end, prev_start, prev_end)
    sql_q5 = q5_article_analysis(table)

    if args.dry_run:
        print("\n── DRY RUN MODE ── 以下為將執行的 SQL：\n")
        for label, sql in [("Q1", sql_q1), ("Q2", sql_q2), ("Q3", sql_q3),
                           ("Q4", sql_q4), ("Q5", sql_q5)]:
            print(f"\n{'─'*40}\n{label}:\n{sql}")
        return

    # 驗證 BQ 設定
    if CONFIG["BQ_PROJECT"] == "YOUR_PROJECT":
        print("\n❌ 錯誤：BQ_PROJECT 未設定。請執行：")
        print("   export BQ_PROJECT='your-gcp-project-id'")
        print("   export BQ_DATASET='analytics_XXXXXXXXX'")
        sys.exit(1)

    # 載入 BigQuery client
    try:
        from google.cloud import bigquery
    except ImportError:
        print("\n❌ 缺少相依套件。請執行：")
        print("   pip install google-cloud-bigquery tabulate")
        sys.exit(1)

    client = bigquery.Client(project=CONFIG["BQ_PROJECT"])

    # 執行查詢
    q1_rows = run_query(client, sql_q1, "Q1 欄位探索")
    check_fields(q1_rows)
    print_table(q1_rows[:15], "欄位分布（前15）")

    q2_rows = run_query(client, sql_q2, "Q2 熱門文章排行")
    print_table(q2_rows, "熱門文章排行")

    q3_rows = run_query(client, sql_q3, "Q3 醫師文章總瀏覽")
    print_table(q3_rows, "醫師文章總瀏覽排行")

    q4_rows = run_query(client, sql_q4, "Q4 WoW 比較")
    print_table(q4_rows, "WoW 週對週比較")

    # Q5: Doctor-10 文章分析（滾動 30 天）
    q5_rows = run_query(client, sql_q5, "Q5 Doctor-10 文章分析")
    print_table(q5_rows, "Doctor-10 文章分析")

    # 生成並儲存文章分析 HTML 片段
    article_html = generate_article_analysis_html(q5_rows)
    html_path = CONFIG["OUTPUT_DIR"] / "article_analysis_snippet.html"
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(article_html)
    print(f"\n💾 文章分析 HTML 已儲存：{html_path.name}")

    # 印出 HTML 貼入片段
    print_html_snippet(q2_rows, q3_rows, week_label)

    # 儲存 JSON
    if not args.no_save:
        results = {
            "week_label":       week_label,
            "period":           period,
            "date_range":       {"start": w_start, "end": w_end},
            "article_ranking":  q2_rows,
            "doctor_ranking":   q3_rows,
            "wow_comparison":   q4_rows,
            "field_exploration":q1_rows[:20],
            "article_analysis": q5_rows,
        }
        save_results(results, week_label)

    print("\n✅ post_view 查詢完成！")
    print("   → 將上方 HTML 貼入片段複製到週報 HTML 的 1.4 / 1.5 表格中")
    print(f"   → 刪除表格內的 '⚠️ 以下為示範佔位資料' 那一列 <tr>")
    print(f"   → 文章分析片段已輸出至 article_analysis_snippet.html")

if __name__ == "__main__":
    main()
