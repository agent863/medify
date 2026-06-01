-- ============================================================
-- post_view_queries.sql
-- 全站醫師表現週報 — post_view 事件分析
-- 資料來源：GA4 BigQuery Export
-- 使用方式：將 `YOUR_PROJECT.YOUR_DATASET` 替換為實際 BQ 專案/資料集名稱
--            將日期範圍替換為目標週次（格式 YYYYMMDD）
-- ============================================================

-- 【前置設定】請替換以下兩個變數
-- YOUR_PROJECT.YOUR_DATASET.events_*  ← BQ 資料集路徑
-- 日期範圍                              ← 週報週次對應日期


-- ────────────────────────────────────────────────────────────
-- Query 1：欄位探索（確認 post_view 事件的實際 event_params key）
-- 執行一次即可，用來確認欄位名稱（post_id / content_id / article_id 等）
-- ────────────────────────────────────────────────────────────
SELECT
  ep.key                       AS param_key,
  ep.value.string_value        AS sample_string,
  ep.value.int_value           AS sample_int,
  COUNT(*)                     AS occurrence_count
FROM
  `YOUR_PROJECT.YOUR_DATASET.events_*`,
  UNNEST(event_params) AS ep
WHERE
  event_name = 'post_view'
  AND _TABLE_SUFFIX BETWEEN '20260517' AND '20260523'  -- ← 替換週次
GROUP BY
  param_key, sample_string, sample_int
ORDER BY
  occurrence_count DESC
LIMIT 50;


-- ────────────────────────────────────────────────────────────
-- Query 2：熱門文章排行（post_view count，group by post_id / content_id）
--
-- 注意：若 Query 1 確認欄位名稱不是 'post_id'，請修改下方的
--       WHERE ep.key = 'post_id' 為實際欄位名稱
-- ────────────────────────────────────────────────────────────
SELECT
  -- 文章識別符（優先取 post_id，fallback 取 content_id）
  COALESCE(
    MAX(CASE WHEN ep.key = 'post_id'    THEN ep.value.string_value END),
    MAX(CASE WHEN ep.key = 'content_id' THEN ep.value.string_value END),
    MAX(CASE WHEN ep.key = 'article_id' THEN ep.value.string_value END)
  )                                       AS post_id,

  -- 文章標題（若有傳入 post_title 參數則顯示）
  MAX(CASE WHEN ep.key = 'post_title'   THEN ep.value.string_value END)
                                          AS post_title,

  -- 所屬醫師 ID
  MAX(CASE WHEN ep.key = 'doctor_id'    THEN ep.value.string_value END)
                                          AS doctor_id,

  -- post_view 次數（每次事件觸發 = 1 次瀏覽）
  COUNT(*)                                AS post_view_count,

  -- 不重複使用者數
  COUNT(DISTINCT user_pseudo_id)          AS unique_users

FROM
  `YOUR_PROJECT.YOUR_DATASET.events_*`,
  UNNEST(event_params) AS ep
WHERE
  event_name = 'post_view'
  AND _TABLE_SUFFIX BETWEEN '20260517' AND '20260523'  -- ← W21；上週改 20260510 / 20260516
GROUP BY
  -- 以 event_bundle_sequence_id 當作事件唯一鍵，避免 GROUP BY 展開 UNNEST 後重複計算
  -- 實際 group by post_id 需改用子查詢，見下方 Query 2b
  1
ORDER BY
  post_view_count DESC
LIMIT 30;


-- ────────────────────────────────────────────────────────────
-- Query 2b：熱門文章排行（子查詢版，結果更準確）
-- ────────────────────────────────────────────────────────────
WITH post_view_events AS (
  SELECT
    event_timestamp,
    user_pseudo_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'post_id')
      AS post_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'content_id')
      AS content_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'post_title')
      AS post_title,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'doctor_id')
      AS doctor_id
  FROM
    `YOUR_PROJECT.YOUR_DATASET.events_*`
  WHERE
    event_name = 'post_view'
    AND _TABLE_SUFFIX BETWEEN '20260517' AND '20260523'  -- ← 替換週次
)
SELECT
  COALESCE(post_id, content_id)   AS article_key,   -- 文章識別符
  MAX(post_title)                  AS post_title,    -- 文章標題
  MAX(doctor_id)                   AS doctor_id,     -- 所屬醫師
  COUNT(*)                         AS post_view_count,
  COUNT(DISTINCT user_pseudo_id)   AS unique_users
FROM
  post_view_events
GROUP BY
  article_key
ORDER BY
  post_view_count DESC
LIMIT 30;


-- ────────────────────────────────────────────────────────────
-- Query 3：醫師文章總瀏覽排行（post_view count，group by doctor_id）
-- ────────────────────────────────────────────────────────────
WITH post_view_events AS (
  SELECT
    user_pseudo_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'doctor_id')
      AS doctor_id,
    (SELECT value.string_value FROM UNNEST(event_params)
       WHERE key IN ('post_id', 'content_id', 'article_id')
       LIMIT 1)
      AS article_key
  FROM
    `YOUR_PROJECT.YOUR_DATASET.events_*`
  WHERE
    event_name = 'post_view'
    AND _TABLE_SUFFIX BETWEEN '20260517' AND '20260523'  -- ← 替換週次
)
SELECT
  doctor_id,
  COUNT(*)                                AS total_post_view_count,   -- 總 post_view 次數
  COUNT(DISTINCT article_key)             AS distinct_articles_viewed, -- 不重複文章數
  COUNT(DISTINCT user_pseudo_id)          AS unique_users             -- 不重複使用者數
FROM
  post_view_events
WHERE
  doctor_id IS NOT NULL
GROUP BY
  doctor_id
ORDER BY
  total_post_view_count DESC;


-- ────────────────────────────────────────────────────────────
-- Query 4：WoW 比較（本週 vs 上週，by doctor_id）
-- ────────────────────────────────────────────────────────────
WITH weekly AS (
  SELECT
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'doctor_id')
      AS doctor_id,
    CASE
      WHEN _TABLE_SUFFIX BETWEEN '20260517' AND '20260523' THEN 'W21'
      WHEN _TABLE_SUFFIX BETWEEN '20260510' AND '20260516' THEN 'W20'
    END AS week_label,
    COUNT(*) AS post_view_count
  FROM
    `YOUR_PROJECT.YOUR_DATASET.events_*`
  WHERE
    event_name = 'post_view'
    AND _TABLE_SUFFIX BETWEEN '20260510' AND '20260523'  -- 兩週合併查詢
  GROUP BY
    doctor_id, week_label
)
SELECT
  w21.doctor_id,
  w21.post_view_count                                        AS w21_count,
  COALESCE(w20.post_view_count, 0)                           AS w20_count,
  w21.post_view_count - COALESCE(w20.post_view_count, 0)     AS delta,
  ROUND(
    SAFE_DIVIDE(
      w21.post_view_count - COALESCE(w20.post_view_count, 0),
      COALESCE(w20.post_view_count, 0)
    ) * 100, 1
  )                                                          AS wow_pct
FROM
  weekly w21
LEFT JOIN
  weekly w20 ON w21.doctor_id = w20.doctor_id AND w20.week_label = 'W20'
WHERE
  w21.week_label = 'W21'
  AND w21.doctor_id IS NOT NULL
ORDER BY
  w21.post_view_count DESC;


-- ────────────────────────────────────────────────────────────
-- Query 5：文章 × 醫師交叉明細（可貼入 Looker Studio 自訂查詢）
-- ────────────────────────────────────────────────────────────
WITH post_view_events AS (
  SELECT
    FORMAT_DATE('%Y-%m-%d', PARSE_DATE('%Y%m%d', event_date)) AS event_date,
    user_pseudo_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'doctor_id')
      AS doctor_id,
    COALESCE(
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'post_id'),
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'content_id')
    )                                       AS article_key,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'post_title')
      AS post_title
  FROM
    `YOUR_PROJECT.YOUR_DATASET.events_*`
  WHERE
    event_name = 'post_view'
    AND _TABLE_SUFFIX BETWEEN '20260517' AND '20260523'
)
SELECT
  event_date,
  doctor_id,
  article_key,
  MAX(post_title)                AS post_title,
  COUNT(*)                       AS post_view_count,
  COUNT(DISTINCT user_pseudo_id) AS unique_users
FROM
  post_view_events
GROUP BY
  event_date, doctor_id, article_key
ORDER BY
  event_date, post_view_count DESC;
