#!/usr/bin/env python3
"""
generate_weekly_report.py
標準化週報產生器 — 7 個固定區塊，每週格式完全一致

區塊（順序固定）：
  1. 全站 KPI
  2. 各醫師報告
  3. 最熱門文章（僅文章，含超連結）
  4. 最熱門文章分類
  5. 各醫院 QR Code 報告
  6. Scroll 事件分析
  7. 預約按鈕點擊
用法：
  python generate_weekly_report.py                  # 自動偵測上週
  python generate_weekly_report.py --week W26       # 指定週次
  python generate_weekly_report.py --dry-run        # 假資料，不連 BQ
  python generate_weekly_report.py --no-push        # 不 git push
"""

import argparse
import html as html_mod
import os
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

# ─── 醫師名單（來自 Notion — 固定，勿隨意修改）─────────────────────────────────

DOCTORS = [
    {"id": "doctor-10",  "name": "何宜儒醫師",   "org": "澄清眼科"},
    {"id": "doctor-43",  "name": "蔡明劭醫師",   "org": "領航醫師"},
    {"id": "doctor-44",  "name": "孫啟欽醫師",   "org": "領航醫師"},
    {"id": "doctor-76",  "name": "徐邦瀚醫師",   "org": "領航醫師"},
    {"id": "doctor-94",  "name": "陳夢柔醫師",   "org": "澄清眼科"},
    {"id": "doctor-95",  "name": "徐郁芳醫師",   "org": "澄清眼科"},
    {"id": "doctor-97",  "name": "博仁醫院示範", "org": "示範帳號"},
    {"id": "doctor-99",  "name": "吳孟憲醫師",   "org": "澄清眼科"},
    {"id": "doctor-100", "name": "陳品元醫師",   "org": "領航醫師"},
    {"id": "doctor-101", "name": "陳怡豪醫師",   "org": "澄清眼科"},
    {"id": "doctor-102", "name": "吳兆偉醫師",   "org": "澄清眼科"},
    {"id": "doctor-103", "name": "林昕穎醫師",   "org": "澄清眼科"},
]
DOCTOR_MAP = {d["id"]: d for d in DOCTORS}

# ─── 醫院 QR UTM 對照表 ────────────────────────────────────────────────────────

HOSPITAL_UTM = {
    "cceye-taipei":  "台北澄清眼科",
    "cceye-banqiao": "板橋澄清眼科",
}
LOCATION_UTM = {
    "consult":  "診間",
    "counter":  "掛號櫃檯",
    "waitting": "候診區",
    "tvwall":   "電視牆",
}

# ─── 設定 ──────────────────────────────────────────────────────────────────────

CONFIG = {
    "BQ_PROJECT":  os.environ.get("BQ_PROJECT", "YOUR_PROJECT"),
    "BQ_DATASET":  os.environ.get("BQ_DATASET", "YOUR_DATASET"),
    "BQ_LOCATION": os.environ.get("BQ_LOCATION", "asia-east1"),
    "PASSWORD":    "9053",
    "OUTPUT_DIR":  Path(__file__).parent,
}


# ─── 日期工具 ──────────────────────────────────────────────────────────────────

def get_week_range(week_label=None):
    """回傳 (label, w_start, w_end, prev_start, prev_end, w_start_dt, w_end_dt)"""
    today = date.today()
    if week_label:
        wn = int(week_label.lstrip("Ww"))
        w_start_dt = date.fromisocalendar(today.year, wn, 1)
    else:
        w_start_dt = today - timedelta(days=today.weekday() + 7)  # last Monday
    w_end_dt      = w_start_dt + timedelta(days=6)
    prev_start_dt = w_start_dt - timedelta(days=7)
    prev_end_dt   = w_end_dt   - timedelta(days=7)
    wn    = w_start_dt.isocalendar()[1]
    label = f"W{wn:02d}"
    fmt   = "%Y%m%d"
    return (label,
            w_start_dt.strftime(fmt), w_end_dt.strftime(fmt),
            prev_start_dt.strftime(fmt), prev_end_dt.strftime(fmt),
            w_start_dt, w_end_dt)


# ─── BigQuery SQL ──────────────────────────────────────────────────────────────

def bq_table():
    return f"`{CONFIG['BQ_PROJECT']}.{CONFIG['BQ_DATASET']}.events_*`"


def sql_site_kpi(t, ws, we, ps, pe):
    return f"""
SELECT
  CASE
    WHEN _TABLE_SUFFIX BETWEEN '{ws}' AND '{we}' THEN 'current'
    ELSE 'previous'
  END                                                        AS week,
  COUNT(DISTINCT user_pseudo_id)                             AS active_users,
  COUNTIF(event_name = 'first_visit')                       AS new_users,
  COUNTIF(event_name = 'session_start')                     AS sessions,
  COUNTIF(event_name = 'page_view')                         AS page_views,
  ROUND(AVG(CASE WHEN event_name = 'user_engagement'
    THEN (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec')
    ELSE NULL END) / 1000, 1)                               AS avg_engagement_sec
FROM {t}
WHERE _TABLE_SUFFIX BETWEEN '{ps}' AND '{we}'
GROUP BY week
""".strip()


def sql_doctor_traffic(t, ws, we, ps, pe):
    return f"""
WITH pv AS (
  SELECT
    user_pseudo_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS url,
    REGEXP_EXTRACT(
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'),
      r'/(doctor-\\d+)(?:/|$)'
    )                                                                  AS doctor_id,
    CASE
      WHEN _TABLE_SUFFIX BETWEEN '{ws}' AND '{we}' THEN 'current'
      ELSE 'previous'
    END                                                                AS week
  FROM {t}
  WHERE event_name = 'page_view'
    AND _TABLE_SUFFIX BETWEEN '{ps}' AND '{we}'
    AND REGEXP_CONTAINS(
          (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'),
          r'/doctor-\\d+(?:/|$)'
        )
)
SELECT
  doctor_id,
  week,
  COUNT(*)                                              AS page_views,
  COUNT(DISTINCT user_pseudo_id)                        AS unique_users,
  COUNTIF(REGEXP_CONTAINS(url, CONCAT('/doctor-', REGEXP_EXTRACT(doctor_id, r'(\\d+)'), r'/?(?:[?#].*)?$')))
                                                        AS homepage_views
FROM pv
WHERE doctor_id IS NOT NULL
GROUP BY doctor_id, week
ORDER BY page_views DESC
""".strip()


def sql_article_ranking(t, ws, we):
    return f"""
WITH pv AS (
  SELECT
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS url,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title')    AS title,
    user_pseudo_id
  FROM {t}
  WHERE event_name = 'page_view'
    AND _TABLE_SUFFIX BETWEEN '{ws}' AND '{we}'
    AND REGEXP_CONTAINS(
          (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'),
          r'/(doctor-\\d+|default)/[^/?#]+'
        )
    AND NOT REGEXP_CONTAINS(
          (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'),
          r'/category/'
        )
),
sc AS (
  SELECT
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS url,
    COUNT(DISTINCT user_pseudo_id)                                                     AS scroll75_users
  FROM {t}
  WHERE event_name = 'scroll_75'
    AND _TABLE_SUFFIX BETWEEN '{ws}' AND '{we}'
  GROUP BY url
)
SELECT
  pv.url,
  MAX(pv.title)                                                               AS title,
  COUNT(*)                                                                    AS page_views,
  COUNT(DISTINCT pv.user_pseudo_id)                                           AS unique_users,
  COALESCE(MAX(sc.scroll75_users), 0)                                         AS scroll75_users,
  ROUND(SAFE_DIVIDE(COALESCE(MAX(sc.scroll75_users), 0),
                    COUNT(DISTINCT pv.user_pseudo_id)) * 100, 1)              AS completion_rate
FROM pv
LEFT JOIN sc ON pv.url = sc.url
GROUP BY pv.url
ORDER BY page_views DESC
LIMIT 20
""".strip()


def sql_category_ranking(t, ws, we):
    return f"""
SELECT
  COALESCE(
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'post_category'),
    '未分類'
  )                                               AS category,
  COUNT(DISTINCT
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location')
  )                                               AS article_count,
  COUNT(*)                                        AS total_views
FROM {t}
WHERE event_name = 'post_view'
  AND _TABLE_SUFFIX BETWEEN '{ws}' AND '{we}'
GROUP BY category
ORDER BY total_views DESC
LIMIT 10
""".strip()


def sql_hospital_qr(t, ws, we, ps, pe):
    hosp_cond = " OR ".join([
        f"(SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source') = '{k}'"
        for k in HOSPITAL_UTM
    ] + [
        f"(SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'campaign') LIKE '%{k}%'"
        for k in HOSPITAL_UTM
    ])
    hosp_cases = "\n      ".join([
        f"WHEN (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source') = '{k}'"
        f" OR (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'campaign') LIKE '%{k}%'"
        f" THEN '{k}'"
        for k in HOSPITAL_UTM
    ])
    loc_cases = "\n      ".join([
        f"WHEN (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'medium') = '{k}'"
        f" OR (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'campaign') LIKE '%{k}%'"
        f" THEN '{k}'"
        for k in LOCATION_UTM
    ])
    return f"""
WITH qr AS (
  SELECT
    CASE {hosp_cases}
      ELSE NULL
    END                                                 AS hospital_key,
    CASE {loc_cases}
      ELSE 'unknown'
    END                                                 AS location_key,
    user_pseudo_id,
    CASE
      WHEN _TABLE_SUFFIX BETWEEN '{ws}' AND '{we}' THEN 'current'
      ELSE 'previous'
    END                                                 AS week
  FROM {t}
  WHERE event_name = 'session_start'
    AND _TABLE_SUFFIX BETWEEN '{ps}' AND '{we}'
    AND ({hosp_cond})
)
SELECT
  hospital_key,
  location_key,
  week,
  COUNT(*)                        AS sessions,
  COUNT(DISTINCT user_pseudo_id)  AS unique_users
FROM qr
WHERE hospital_key IS NOT NULL
GROUP BY hospital_key, location_key, week
ORDER BY hospital_key, location_key, week
""".strip()


def sql_scroll_events(t, ws, we, ps, pe):
    return f"""
SELECT
  event_name,
  CASE
    WHEN _TABLE_SUFFIX BETWEEN '{ws}' AND '{we}' THEN 'current'
    ELSE 'previous'
  END                             AS week,
  COUNT(*)                        AS event_count,
  COUNT(DISTINCT user_pseudo_id)  AS unique_users
FROM {t}
WHERE event_name IN ('scroll_25', 'scroll_50', 'scroll_75')
  AND _TABLE_SUFFIX BETWEEN '{ps}' AND '{we}'
GROUP BY event_name, week
ORDER BY event_name, week
""".strip()


def sql_article_pv_for_ratio(t, ws, we, ps, pe):
    return f"""
SELECT
  CASE
    WHEN _TABLE_SUFFIX BETWEEN '{ws}' AND '{we}' THEN 'current'
    ELSE 'previous'
  END                             AS week,
  COUNT(*)                        AS article_page_views,
  COUNT(DISTINCT user_pseudo_id)  AS article_unique_users
FROM {t}
WHERE event_name = 'page_view'
  AND _TABLE_SUFFIX BETWEEN '{ps}' AND '{we}'
  AND REGEXP_CONTAINS(
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'),
        r'/(doctor-\\d+|default)/[^/?#]+'
      )
  AND NOT REGEXP_CONTAINS(
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'),
        r'/category/'
      )
GROUP BY week
""".strip()


def sql_reserve_clicks(t, ws, we, ps, pe):
    return f"""
SELECT
  CASE
    WHEN _TABLE_SUFFIX BETWEEN '{ws}' AND '{we}' THEN 'current'
    ELSE 'previous'
  END                             AS week,
  COUNT(*)                        AS reserve_clicks,
  COUNT(DISTINCT user_pseudo_id)  AS unique_users
FROM {t}
WHERE event_name = 'reserve_btn_click'
  AND _TABLE_SUFFIX BETWEEN '{ps}' AND '{we}'
GROUP BY week
""".strip()


# ─── 乾跑假資料 ───────────────────────────────────────────────────────────────

def make_sample_data():
    """乾跑模式假資料 — 只用於測試版型，數字全部為 0 或無意義佔位符，不得用於正式報告"""
    zero_doctor = {"curr_page_views": 0, "curr_unique": 0, "curr_homepage": 0, "prev_page_views": 0}
    return {
        "site_kpi": {
            "current":  {"active_users": 0, "new_users": 0, "sessions": 0, "page_views": 0, "avg_engagement_sec": 0},
            "previous": {"active_users": 0, "new_users": 0, "sessions": 0, "page_views": 0, "avg_engagement_sec": 0},
        },
        "doctors": {d["id"]: dict(zero_doctor) for d in DOCTORS},
        "articles": [
            {"url": "https://medify.com.tw/doctor-43/TEST-ARTICLE-1", "title": "（版型測試）文章標題 1", "page_views": 0, "unique_users": 0, "scroll75_users": 0, "completion_rate": 0},
            {"url": "https://medify.com.tw/doctor-10/TEST-ARTICLE-2", "title": "（版型測試）文章標題 2", "page_views": 0, "unique_users": 0, "scroll75_users": 0, "completion_rate": 0},
            {"url": "https://medify.com.tw/doctor-44/TEST-ARTICLE-3", "title": "（版型測試）文章標題 3", "page_views": 0, "unique_users": 0, "scroll75_users": 0, "completion_rate": 0},
        ],
        "categories": [
            {"category": "（版型測試）分類 A", "article_count": 0, "total_views": 0},
            {"category": "（版型測試）分類 B", "article_count": 0, "total_views": 0},
        ],
        "hospital_qr": {
            "cceye-taipei": {
                "consult":  {"curr_sessions": 0, "curr_users": 0, "prev_sessions": 0},
                "counter":  {"curr_sessions": 0, "curr_users": 0, "prev_sessions": 0},
                "waitting": {"curr_sessions": 0, "curr_users": 0, "prev_sessions": 0},
                "tvwall":   {"curr_sessions": 0, "curr_users": 0, "prev_sessions": 0},
            },
            "cceye-banqiao": {
                "consult":  {"curr_sessions": 0, "curr_users": 0, "prev_sessions": 0},
                "counter":  {"curr_sessions": 0, "curr_users": 0, "prev_sessions": 0},
                "waitting": {"curr_sessions": 0, "curr_users": 0, "prev_sessions": 0},
                "tvwall":   {"curr_sessions": 0, "curr_users": 0, "prev_sessions": 0},
            },
        },
        "scroll": {
            "scroll_25": {"curr_count": 0, "curr_users": 0, "prev_count": 0},
            "scroll_50": {"curr_count": 0, "curr_users": 0, "prev_count": 0},
            "scroll_75": {"curr_count": 0, "curr_users": 0, "prev_count": 0},
            "article_pv_curr": 0,
            "article_pv_prev": 0,
        },
        "reserve": {
            "curr_clicks": 0, "curr_users": 0,
            "prev_clicks": 0, "prev_users": 0,
        },
    }


# ─── BigQuery 資料抓取 ─────────────────────────────────────────────────────────

def fetch_all_data(ws, we, ps, pe):
    from google.cloud import bigquery
    # Auto-discover dataset location by probing known regions
    # Key logic: BigQuery returns "not found in location X" for WRONG region;
    # for the CORRECT region it either returns data or "not found" (table missing)
    # Detect location via get_dataset (no region-probing needed)
    location = None
    try:
        _dc = bigquery.Client(project=CONFIG["BQ_PROJECT"])
        _ds = _dc.get_dataset(CONFIG["BQ_DATASET"])
        location = _ds.location
        print(f"📍 BigQuery dataset location: {location}")
    except Exception as _ge:
        print(f"⚠️  get_dataset failed: {_ge}")
        location = CONFIG.get("BQ_LOCATION") or None
        if location:
            print(f"📍 Using BQ_LOCATION fallback: {location}")
        else:
            print("❌ No location — queries may fail")
    client = bigquery.Client(project=CONFIG["BQ_PROJECT"], location=location)
    t = bq_table()

    def run(sql):
        return [dict(r) for r in client.query(sql).result()]

    print("⏳ 查詢 1/7: 全站 KPI …")
    kpi_rows = run(sql_site_kpi(t, ws, we, ps, pe))
    kpi = {}
    for r in kpi_rows:
        kpi[r["week"]] = {k: v for k, v in r.items() if k != "week"}

    print("⏳ 查詢 2/7: 各醫師報告 …")
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
    # Ensure all doctors in list
    for d in DOCTORS:
        if d["id"] not in doctors:
            doctors[d["id"]] = {"curr_page_views": 0, "curr_unique": 0,
                                 "curr_homepage": 0, "prev_page_views": 0}

    print("⏳ 查詢 3/7: 熱門文章 …")
    articles = run(sql_article_ranking(t, ws, we))[:10]

    print("⏳ 查詢 4/7: 文章分類 …")
    categories = run(sql_category_ranking(t, ws, we))

    print("⏳ 查詢 5/7: 醫院 QR Code …")
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

    print("⏳ 查詢 6/7: Scroll 事件 …")
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

    print("⏳ 查詢 7/7: 預約按鈕 …")
    res_rows = run(sql_reserve_clicks(t, ws, we, ps, pe))
    reserve  = {"curr_clicks": 0, "curr_users": 0, "prev_clicks": 0, "prev_users": 0}
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


# ─── HTML 工具 ─────────────────────────────────────────────────────────────────

def e(v):
    """HTML escape"""
    return html_mod.escape(str(v)) if v is not None else "—"

def wow_badge(curr, prev):
    """WoW percentage badge HTML"""
    if not prev:
        return '<span class="badge gray">—</span>'
    pct = (curr - prev) / prev * 100
    if pct > 0:
        cls, arrow = "green", "▲"
    elif pct < 0:
        cls, arrow = "red", "▼"
    else:
        cls, arrow = "gray", "—"
    return f'<span class="badge {cls}">{arrow} {abs(pct):.1f}%</span>'

def fmt_num(v):
    if v is None:
        return "—"
    try:
        return f"{int(v):,}"
    except Exception:
        return str(v)


# ─── HTML 區塊建立 ─────────────────────────────────────────────────────────────

def section_card(number, emoji, title, body_html):
    return f"""
  <div class="section-card">
    <div class="section-header">
      <span class="section-num">{number}</span>
      <span class="section-title">{emoji} {e(title)}</span>
    </div>
    <div class="section-body">
      {body_html}
    </div>
  </div>"""


def build_s1_kpi(data):
    kpi    = data["site_kpi"]
    curr   = kpi.get("current",  {})
    prev   = kpi.get("previous", {})
    metrics = [
        ("活躍用戶",    curr.get("active_users"),      prev.get("active_users")),
        ("新用戶",      curr.get("new_users"),         prev.get("new_users")),
        ("工作階段",    curr.get("sessions"),          prev.get("sessions")),
        ("頁面瀏覽",    curr.get("page_views"),        prev.get("page_views")),
        ("平均互動時長", curr.get("avg_engagement_sec"), prev.get("avg_engagement_sec")),
    ]
    items = ""
    for label, cv, pv in metrics:
        disp = f"{cv:.1f}s" if label == "平均互動時長" and cv else fmt_num(cv)
        items += f"""
      <div class="kpi-item">
        <div class="kpi-value">{disp}</div>
        <div class="kpi-label">{label}</div>
        <div class="kpi-wow">{wow_badge(cv or 0, pv or 0)}</div>
      </div>"""
    return section_card("①", "🌐", "全站 KPI",
                        f'<div class="kpi-grid">{items}\n    </div>')


def build_s2_doctors(data):
    doctors = data["doctors"]
    # Sort: doctors with traffic first (by curr_page_views DESC), then zero-traffic
    ordered = sorted(DOCTORS,
                     key=lambda d: doctors.get(d["id"], {}).get("curr_page_views", 0),
                     reverse=True)
    cards = ""
    for doc in ordered:
        did  = doc["id"]
        info = doctors.get(did, {})
        cpv  = info.get("curr_page_views", 0)
        ppv  = info.get("prev_page_views", 0)
        cu   = info.get("curr_unique", 0)
        chp  = info.get("curr_homepage", 0)
        org_cls = "badge-org-navi" if doc["org"] == "領航醫師" else (
                  "badge-org-demo" if doc["org"] == "示範帳號" else "badge-org-cceye")
        if cpv == 0:
            cards += f"""
      <div class="doctor-card no-traffic">
        <div class="doc-name">{e(doc['name'])}</div>
        <div class="doc-org-badge {org_cls}">{e(doc['org'])}</div>
        <div class="doc-no-data">本週無流量</div>
      </div>"""
        else:
            cards += f"""
      <div class="doctor-card">
        <div class="doc-name">{e(doc['name'])}</div>
        <div class="doc-org-badge {org_cls}">{e(doc['org'])}</div>
        <div class="doc-metrics">
          <div class="doc-metric-row">
            <span class="doc-metric-label">首頁瀏覽</span>
            <span class="doc-metric-value">{fmt_num(chp)}</span>
          </div>
          <div class="doc-metric-row">
            <span class="doc-metric-label">總頁面瀏覽</span>
            <span class="doc-metric-value">{fmt_num(cpv)}</span>
          </div>
          <div class="doc-metric-row">
            <span class="doc-metric-label">不重複訪客</span>
            <span class="doc-metric-value">{fmt_num(cu)}</span>
          </div>
        </div>
        <div class="doc-wow">{wow_badge(cpv, ppv)}</div>
      </div>"""
    return section_card("②", "👨‍⚕️", "各醫師報告",
                        f'<div class="doctor-grid">{cards}\n    </div>')


def build_s3_articles(data):
    articles = data["articles"][:10]
    rows = ""
    for i, art in enumerate(articles, 1):
        url   = art.get("url", "#")
        title = art.get("title") or url
        pv    = art.get("page_views", 0)
        s75   = art.get("scroll75_users", 0)
        cr    = art.get("completion_rate", 0) or 0
        cr_cls = "green" if cr >= 40 else "red"
        rows += f"""
        <tr>
          <td class="rank">{i}</td>
          <td class="article-title"><a href="{e(url)}" target="_blank">{e(title)}</a></td>
          <td class="num">{fmt_num(pv)}</td>
          <td class="num">{fmt_num(s75)}</td>
          <td class="num {cr_cls}">{cr:.1f}%</td>
        </tr>"""
    body = f"""
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>文章標題</th>
          <th>瀏覽數</th>
          <th>閱讀完成數</th>
          <th>閱讀完成比(%)</th>
        </tr>
      </thead>
      <tbody>{rows}
      </tbody>
    </table>
    <p class="table-note">閱讀完成比 = scroll_75 不重複用戶 ÷ 頁面不重複訪客；≥40% 為綠色</p>"""
    return section_card("③", "📰", "最熱門文章（前10，僅文章頁）", body)


def build_s4_categories(data):
    cats = data["categories"]
    rows = ""
    for i, cat in enumerate(cats, 1):
        rows += f"""
        <tr>
          <td class="rank">{i}</td>
          <td>{e(cat.get('category', '未分類'))}</td>
          <td class="num">{fmt_num(cat.get('article_count', 0))}</td>
          <td class="num">{fmt_num(cat.get('total_views', 0))}</td>
        </tr>"""
    body = f"""
    <table class="data-table">
      <thead>
        <tr><th>#</th><th>分類</th><th>文章數</th><th>瀏覽總數</th></tr>
      </thead>
      <tbody>{rows}
      </tbody>
    </table>"""
    return section_card("④", "🏷️", "最熱門文章分類", body)


def build_s5_hospital(data):
    qr = data["hospital_qr"]
    parts = ""
    for h_key, h_name in HOSPITAL_UTM.items():
        h_data = qr.get(h_key, {})
        if not h_data:
            parts += f"""
    <div class="hospital-block">
      <h3 class="hospital-name">{e(h_name)}</h3>
      <p class="no-data-msg">本週無掃碼紀錄</p>
    </div>"""
            continue
        h_total_curr = sum(v.get("curr_sessions", 0) for v in h_data.values())
        h_total_prev = sum(v.get("prev_sessions", 0) for v in h_data.values())
        rows = ""
        for l_key, l_name in LOCATION_UTM.items():
            info = h_data.get(l_key, {"curr_sessions": 0, "curr_users": 0, "prev_sessions": 0})
            cs   = info.get("curr_sessions", 0)
            cu   = info.get("curr_users", 0)
            ps   = info.get("prev_sessions", 0)
            rows += f"""
          <tr>
            <td>{e(l_name)}</td>
            <td class="num">{fmt_num(cs)}</td>
            <td class="num">{fmt_num(cu)}</td>
            <td class="num">{fmt_num(ps)}</td>
            <td>{wow_badge(cs, ps)}</td>
          </tr>"""
        parts += f"""
    <div class="hospital-block">
      <h3 class="hospital-name">{e(h_name)}
        <small style="font-weight:normal;font-size:13px;margin-left:8px;">
          本週共 {fmt_num(h_total_curr)} 次掃碼  {wow_badge(h_total_curr, h_total_prev)}
        </small>
      </h3>
      <table class="data-table">
        <thead>
          <tr><th>位置</th><th>本週掃碼</th><th>不重複用戶</th><th>上週掃碼</th><th>週變化</th></tr>
        </thead>
        <tbody>{rows}
        </tbody>
      </table>
    </div>"""
    return section_card("⑤", "🏥", "各醫院 QR Code 報告", parts)


def build_s6_scroll(data):
    sc       = data["scroll"]
    pv_curr  = sc.get("article_pv_curr", 0)
    pv_prev  = sc.get("article_pv_prev", 0)
    s75_curr = sc.get("scroll_75", {}).get("curr_count", 0)
    s75_prev = sc.get("scroll_75", {}).get("prev_count", 0)
    cr_curr  = round(s75_curr / pv_curr * 100, 1) if pv_curr else 0
    cr_prev  = round(s75_prev / pv_prev * 100, 1) if pv_prev else 0
    events   = [
        ("scroll_25", "Scroll 25%"),
        ("scroll_50", "Scroll 50%"),
        ("scroll_75", "Scroll 75%"),
    ]
    rows = ""
    for ev_key, ev_label in events:
        info = sc.get(ev_key, {})
        cc   = info.get("curr_count", 0)
        cu   = info.get("curr_users", 0)
        pc   = info.get("prev_count", 0)
        rows += f"""
        <tr>
          <td><strong>{ev_label}</strong></td>
          <td class="num">{fmt_num(cc)}</td>
          <td class="num">{fmt_num(cu)}</td>
          <td class="num">{fmt_num(pc)}</td>
          <td>{wow_badge(cc, pc)}</td>
        </tr>"""
    body = f"""
    <table class="data-table">
      <thead>
        <tr><th>事件</th><th>本週次數</th><th>本週不重複用戶</th><th>上週次數</th><th>週變化</th></tr>
      </thead>
      <tbody>{rows}
      </tbody>
    </table>
    <div class="metric-highlight">
      <span class="mh-label">全站閱讀完成比（scroll_75 / 文章頁面瀏覽）</span>
      <span class="mh-value">{cr_curr:.1f}%</span>
      {wow_badge(cr_curr, cr_prev)}
      <span class="mh-prev">上週 {cr_prev:.1f}%</span>
    </div>"""
    return section_card("⑥", "📊", "Scroll 事件分析", body)


def build_s7_reserve(data):
    res  = data["reserve"]
    cc   = res.get("curr_clicks", 0)
    cu   = res.get("curr_users",  0)
    pc   = res.get("prev_clicks", 0)
    pu   = res.get("prev_users",  0)
    body = f"""
    <div class="reserve-hero">
      <div class="res-big">{fmt_num(cc)}</div>
      <div class="res-label">預約按鈕點擊次數</div>
      <div class="res-wow">{wow_badge(cc, pc)}</div>
    </div>
    <div class="reserve-detail">
      <div class="res-row"><span>不重複用戶</span><strong>{fmt_num(cu)}</strong> {wow_badge(cu, pu)}</div>
      <div class="res-row"><span>上週點擊次數</span><strong>{fmt_num(pc)}</strong></div>
      <div class="res-row"><span>上週不重複用戶</span><strong>{fmt_num(pu)}</strong></div>
    </div>"""
    return section_card("⑦", "📅", "預約按鈕點擊", body)


# ─── 完整 HTML 建立 ────────────────────────────────────────────────────────────

def build_html(data, week_label, w_start_dt, w_end_dt, is_dry_run):
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    period_str   = f"{w_start_dt.strftime('%b %-d')}–{w_end_dt.strftime('%-d, %Y')}"
    dry_badge    = '<span class="dry-run-badge">⚠️ 乾跑模式（假資料）</span>' if is_dry_run else ""

    s1 = build_s1_kpi(data)
    s2 = build_s2_doctors(data)
    s3 = build_s3_articles(data)
    s4 = build_s4_categories(data)
    s5 = build_s5_hospital(data)
    s6 = build_s6_scroll(data)
    s7 = build_s7_reserve(data)

    pw = CONFIG["PASSWORD"]

    return f"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Medify 週報 {week_label}</title>
<style>
  :root {{
    --navy: #0f3460; --navy2: #1a4a80;
    --green: #16a34a; --red: #dc2626; --gray: #6b7280;
    --bg: #f6f8fb; --card: #ffffff;
    --border: #e2e8f0;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: var(--bg); color: #1e293b; }}

  /* Lock screen */
  #lock-screen {{
    position: fixed; inset: 0; background: linear-gradient(135deg, var(--navy), var(--navy2));
    display: flex; align-items: center; justify-content: center; z-index: 9999;
  }}
  .lock-box {{
    background: #fff; border-radius: 16px; padding: 40px 48px; text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,.4); max-width: 360px; width: 90%;
  }}
  .lock-icon {{ font-size: 48px; margin-bottom: 16px; }}
  .lock-box h2 {{ color: var(--navy); margin-bottom: 8px; font-size: 20px; }}
  .lock-box p  {{ color: var(--gray); font-size: 14px; margin-bottom: 24px; }}
  #pw-input {{
    width: 100%; padding: 12px 16px; border: 2px solid var(--border);
    border-radius: 8px; font-size: 18px; letter-spacing: 4px; text-align: center;
    margin-bottom: 12px;
  }}
  #pw-input:focus {{ outline: none; border-color: var(--navy); }}
  #pw-btn {{
    width: 100%; padding: 12px; background: linear-gradient(135deg, var(--navy), var(--navy2));
    color: #fff; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;
  }}
  #pw-error {{ color: var(--red); font-size: 13px; margin-top: 8px; display: none; }}

  /* Main */
  #main-content {{ display: none; }}
  .site-header {{
    background: linear-gradient(135deg, var(--navy), var(--navy2));
    color: #fff; padding: 24px 32px;
  }}
  .site-header h1 {{ font-size: 24px; font-weight: 700; }}
  .site-header .sub  {{ font-size: 14px; opacity: .8; margin-top: 4px; }}
  .dry-run-badge {{
    display: inline-block; background: #f97316; color: #fff;
    padding: 2px 10px; border-radius: 12px; font-size: 12px; margin-left: 12px;
  }}
  .container {{ max-width: 1100px; margin: 0 auto; padding: 24px 20px; }}

  /* Section cards */
  .section-card {{
    background: var(--card); border-radius: 12px; margin-bottom: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,.06); overflow: hidden;
  }}
  .section-header {{
    background: linear-gradient(135deg, var(--navy), var(--navy2));
    color: #fff; padding: 14px 20px; display: flex; align-items: center; gap: 10px;
  }}
  .section-num  {{ font-size: 22px; }}
  .section-title {{ font-size: 16px; font-weight: 600; }}
  .section-body  {{ padding: 20px; }}

  /* Badges */
  .badge {{ display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }}
  .badge.green  {{ background: #dcfce7; color: var(--green); }}
  .badge.red    {{ background: #fee2e2; color: var(--red); }}
  .badge.gray   {{ background: #f1f5f9; color: var(--gray); }}

  /* KPI grid */
  .kpi-grid {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }}
  @media(max-width:700px) {{ .kpi-grid {{ grid-template-columns: repeat(2, 1fr); }} }}
  .kpi-item {{ text-align: center; padding: 16px 8px; background: var(--bg);
               border-radius: 10px; border: 1px solid var(--border); }}
  .kpi-value {{ font-size: 28px; font-weight: 700; color: var(--navy); }}
  .kpi-label {{ font-size: 12px; color: var(--gray); margin: 4px 0; }}
  .kpi-wow   {{ font-size: 12px; }}

  /* Doctor grid */
  .doctor-grid {{
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
  }}
  @media(max-width:700px) {{ .doctor-grid {{ grid-template-columns: repeat(2, 1fr); }} }}
  .doctor-card {{
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px; position: relative;
  }}
  .doctor-card.no-traffic {{ opacity: .55; }}
  .doc-name {{ font-weight: 600; font-size: 15px; margin-bottom: 4px; }}
  .doc-org-badge {{
    display: inline-block; font-size: 11px; padding: 1px 8px;
    border-radius: 10px; margin-bottom: 10px;
  }}
  .badge-org-navi  {{ background: #dbeafe; color: #1d4ed8; }}
  .badge-org-cceye {{ background: #d1fae5; color: #065f46; }}
  .badge-org-demo  {{ background: #f3f4f6; color: #6b7280; }}
  .doc-metrics {{ font-size: 13px; }}
  .doc-metric-row {{ display: flex; justify-content: space-between; padding: 2px 0;
                     border-bottom: 1px solid var(--border); }}
  .doc-metric-label {{ color: var(--gray); }}
  .doc-metric-value {{ font-weight: 600; }}
  .doc-wow  {{ margin-top: 8px; text-align: right; }}
  .doc-no-data {{ font-size: 13px; color: var(--gray); font-style: italic; }}

  /* Tables */
  .data-table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
  .data-table th {{ background: var(--bg); color: var(--gray); font-weight: 600;
                    padding: 8px 12px; text-align: left; border-bottom: 2px solid var(--border); }}
  .data-table td {{ padding: 8px 12px; border-bottom: 1px solid var(--border); }}
  .data-table tr:last-child td {{ border-bottom: none; }}
  .data-table tr:hover td {{ background: #f8fafc; }}
  td.num   {{ text-align: right; font-variant-numeric: tabular-nums; }}
  td.rank  {{ text-align: center; color: var(--gray); font-weight: 700; width: 36px; }}
  td.green {{ color: var(--green); font-weight: 600; }}
  td.red   {{ color: var(--red); font-weight: 600; }}
  .article-title a {{ color: var(--navy); text-decoration: none; }}
  .article-title a:hover {{ text-decoration: underline; }}
  .table-note {{ font-size: 12px; color: var(--gray); margin-top: 8px; }}

  /* Hospital */
  .hospital-block {{ margin-bottom: 24px; }}
  .hospital-block:last-child {{ margin-bottom: 0; }}
  .hospital-name {{ font-size: 15px; font-weight: 700; color: var(--navy);
                    margin-bottom: 10px; padding-bottom: 6px;
                    border-bottom: 2px solid var(--border); }}
  .no-data-msg {{ color: var(--gray); font-style: italic; font-size: 14px; }}

  /* Scroll section */
  .metric-highlight {{
    margin-top: 16px; background: var(--bg); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px 20px; display: flex; align-items: center; gap: 12px;
    flex-wrap: wrap;
  }}
  .mh-label {{ color: var(--gray); font-size: 13px; flex: 1; }}
  .mh-value {{ font-size: 28px; font-weight: 700; color: var(--navy); }}
  .mh-prev  {{ font-size: 13px; color: var(--gray); }}

  /* Reserve */
  .reserve-hero {{
    text-align: center; padding: 24px;
    background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
    border-radius: 10px; margin-bottom: 16px;
  }}
  .res-big   {{ font-size: 56px; font-weight: 700; color: var(--navy); line-height: 1; }}
  .res-label {{ color: var(--gray); font-size: 15px; margin: 6px 0; }}
  .res-wow   {{ font-size: 18px; }}
  .reserve-detail {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }}
  @media(max-width:600px) {{ .reserve-detail {{ grid-template-columns: 1fr; }} }}
  .res-row {{
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 12px; text-align: center; font-size: 13px;
  }}
  .res-row span   {{ display: block; color: var(--gray); margin-bottom: 4px; }}
  .res-row strong {{ font-size: 20px; color: var(--navy); display: block; }}

  /* Footer */
  .footer {{ text-align: center; color: var(--gray); font-size: 12px;
             padding: 20px; margin-top: 8px; }}
</style>
</head>
<body>

<!-- Lock Screen -->
<div id="lock-screen">
  <div class="lock-box">
    <div class="lock-icon">🔐</div>
    <h2>Medify 週報</h2>
    <p>{week_label}｜{period_str}</p>
    <input id="pw-input" type="password" placeholder="請輸入密碼" autocomplete="off">
    <button id="pw-btn" onclick="checkPw()">進入</button>
    <div id="pw-error">密碼錯誤，請再試一次</div>
  </div>
</div>

<!-- Main Content -->
<div id="main-content">
  <div class="site-header">
    <h1>🏥 Medify 週報 {week_label}</h1>
    <div class="sub">{period_str}　{dry_badge}</div>
    <div class="sub" style="margin-top:4px;font-size:12px;opacity:.6;">產生時間：{generated_at}</div>
  </div>
  <div class="container">
    {s1}
    {s2}
    {s3}
    {s4}
    {s5}
    {s6}
    {s7}
    <div class="footer">資料來源：GA4 BigQuery Export｜© Medify</div>
  </div>
</div>

<script>
  const CORRECT = '{pw}';
  function checkPw() {{
    const v = document.getElementById('pw-input').value;
    if (v === CORRECT) {{
      document.getElementById('lock-screen').style.display = 'none';
      document.getElementById('main-content').style.display = 'block';
    }} else {{
      document.getElementById('pw-error').style.display = 'block';
      document.getElementById('pw-input').value = '';
    }}
  }}
  document.getElementById('pw-input').addEventListener('keydown', e => {{
    if (e.key === 'Enter') checkPw();
  }});
</script>
</body>
</html>"""


# ─── Git Push ─────────────────────────────────────────────────────────────────

def git_push(output_path, week_label):
    cwd = str(CONFIG["OUTPUT_DIR"])
    subprocess.run(["git", "add", str(output_path)], cwd=cwd, check=True)
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"], cwd=cwd)
    if result.returncode == 0:
        print("ℹ️  沒有新的變更要 commit")
        return
    subprocess.run(
        ["git", "commit", "-m", f"週報 {week_label}：自動產生"],
        cwd=cwd, check=True)
    subprocess.run(["git", "push"], cwd=cwd, check=True)
    print(f"✅ 已 push：{output_path.name}")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Medify 標準化週報產生器")
    parser.add_argument("--week",     default=None, help="週次，例如 W26")
    parser.add_argument("--dry-run",  action="store_true", help="使用假資料，不連 BQ")
    parser.add_argument("--no-push",  action="store_true", help="不 git push")
    args = parser.parse_args()

    label, ws, we, ps, pe, w_start_dt, w_end_dt = get_week_range(args.week)
    period = f"{w_start_dt.strftime('%m/%d')}–{w_end_dt.strftime('%m/%d')}"
    year   = w_start_dt.year

    print(f"📅 週次：{label}（{period} {year}）")
    print(f"   BQ suffix 本週：{ws}–{we}  上週：{ps}–{pe}")

    if args.dry_run:
        print("🧪 乾跑模式 — 使用假資料")
        data = make_sample_data()
    else:
        if CONFIG["BQ_PROJECT"] == "YOUR_PROJECT":
            print("❌ 錯誤：BQ_PROJECT 未設定。請執行：")
            print("   export BQ_PROJECT='your-gcp-project-id'")
            print("   export BQ_DATASET='analytics_XXXXXXXXX'")
            sys.exit(1)
        data = fetch_all_data(ws, we, ps, pe)

    html_content  = build_html(data, label, w_start_dt, w_end_dt, args.dry_run)
    output_path   = CONFIG["OUTPUT_DIR"] / f"report-{year}-{label}.html"
    output_path.write_text(html_content, encoding="utf-8")
    print(f"📄 已輸出：{output_path}")

    if not args.no_push:
        git_push(output_path, label)

    print("\n🎉 完成！尚未寄信，等候指示。")


if __name__ == "__main__":
    main()
