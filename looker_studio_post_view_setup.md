# Looker Studio — post_view 分析設定指南

**適用報表：** 數據週報_全站醫師表現  
**新增功能：** 熱門文章排行 + 醫師文章總瀏覽排行（基於 GA4 `post_view` 自訂事件）

---

## 前置確認

執行 `post_view_queries.sql` 的 **Query 1**，確認：

1. `post_view` 事件確實存在於 BigQuery GA4 export
2. `event_params` 中文章識別欄位的實際 key 名稱（`post_id` / `content_id` / `article_id`）
3. `doctor_id` 欄位確實存在於 `event_params`

若 Query 1 回傳空值，表示 GA4 端尚未正確觸發 `post_view` 事件，需先在前端補實作：

```js
// GTM 或直接在文章頁加入
gtag('event', 'post_view', {
  post_id:    'lbv-lasik-presbyopia',   // 文章唯一識別符
  post_title: 'LBV裸視美老花雷射',       // 文章標題（可選）
  doctor_id:  'doctor-10',              // 所屬醫師 ID
  content_id: 'lbv-001'                 // 備用識別符（可選）
});
```

---

## 方法 A：使用 BigQuery 自訂查詢作為資料來源（推薦）

這是最靈活的方式，可在 Looker Studio 直接使用已計算好的維度/指標。

### 步驟

**1. 在 Looker Studio 新增資料來源**

- 左上角 → 「新增資料來源」 → 選「BigQuery」
- 選擇專案 → 資料集 → 選「自訂查詢」
- 貼入 `post_view_queries.sql` 的 **Query 5**（文章 × 醫師交叉明細）
- 點「連結」→「完成」

**2. 資料來源設定**

自訂查詢回傳欄位：

| 欄位名稱 | 類型 | 說明 |
|---------|------|------|
| `event_date` | 日期 | 事件日期 |
| `doctor_id` | 文字 | 醫師 ID（維度） |
| `article_key` | 文字 | 文章識別符（維度） |
| `post_title` | 文字 | 文章標題（維度） |
| `post_view_count` | 數字 | post_view 次數（指標） |
| `unique_users` | 數字 | 不重複使用者數（指標） |

**3. 新增計算欄位**

在資料來源 → 「新增欄位」：

```
# 文章瀏覽佔比
post_view_pct = post_view_count / SUM(post_view_count)
格式：百分比，小數點 1 位

# 每位使用者平均 post_view 次數
views_per_user = post_view_count / unique_users
格式：數字，小數點 1 位
```

---

## 方法 B：使用現有 GA4 資料來源 + 計算欄位（較簡單，但彈性低）

若報表已有連結 GA4 的資料來源，可直接新增計算欄位。

### 新增指標：post_view 次數

在資料來源 → 「新增欄位」→ 輸入以下公式：

```
欄位名稱：post_view_count
公式：COUNTIF(Event name, "post_view")
說明：計算 event_name = 'post_view' 的事件次數
```

> ⚠️ 注意：GA4 連接器的計算欄位**無法直接存取 event_params 子欄位**。
> 如需 `doctor_id`、`post_id` 等細粒度維度，必須使用方法 A（BigQuery 自訂查詢）。

---

## 在報表頁面新增圖表

### 圖表 1：熱門文章排行（橫條圖）

設定：
- 圖表類型：橫條圖（Bar chart）
- 維度：`post_title`（或 `article_key`）
- 指標：`post_view_count`
- 排序：`post_view_count` 遞減
- 資料列數：前 10
- 次要維度（選填）：`doctor_id`（可看出哪位醫師的文章最受歡迎）

### 圖表 2：醫師文章總瀏覽排行（橫條圖）

設定：
- 圖表類型：橫條圖（Bar chart）
- 維度：`doctor_id`
- 指標：`post_view_count`
- 排序：`post_view_count` 遞減
- 次要指標（選填）：`unique_users`

### 圖表 3：文章瀏覽趨勢（折線圖，可選）

設定：
- 圖表類型：折線圖（Time series）
- 維度：`event_date`
- 指標：`post_view_count`
- 拆分維度：`doctor_id`（每位醫師一條線）

---

## 日期篩選器設定

新增「日期範圍控制項」（Date range control）到報表頁面，連結到 post_view 資料來源。預設日期範圍設為「上週」（Last 7 days / Last week）。

若需週對週比較，可加入「比較日期範圍」功能（報表設定 → 比較 → 前一週期）。

---

## 建議的週報填入流程（每週一）

1. 開啟 BigQuery → 執行 `post_view_queries.sql` Query 2（文章排行）
2. 執行 Query 3（醫師排行）
3. 執行 Query 4（WoW 比較）
4. 將結果複製到 `週報_YYYY-Wxx_MonDD-DD.html` 的 1.4 和 1.5 表格（替換佔位資料）
5. 移除佔位資料的黃色警示列（`⚠️ 以下為示範佔位資料...` 那一行 `<tr>`）

---

## 常見問題

**Q：Query 1 執行後 post_view 事件回傳 0 筆？**  
A：GA4 BigQuery export 通常有 24–48 小時延遲，請確認查詢的日期範圍已有資料。
也可改查 `events_intraday_*` 表取得當日資料（需 BigQuery Streaming 已啟用）。

**Q：doctor_id 欄位值是 NULL？**  
A：代表前端觸發 post_view 事件時未傳入 doctor_id 參數，需更新 GTM/前端代碼。

**Q：如何過濾示範/測試頁面（如「眼科示範」）？**  
A：在 Query 2、3 的 WHERE 子句加入：
```sql
AND (
  SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'post_id'
) NOT IN ('demo', 'test', 'sample')
```
或在 Looker Studio 報表層加入篩選器：`article_key 不包含 demo`。
