#!/usr/bin/env python3
"""
send_report_email.py
週報發信腳本 — 在 git push 後呼叫，通知收件人最新週報已更新。
發信服務：Resend (smtp.resend.com)

設定方式：
  1. 在環境變數設定 RESEND_API_KEY（Resend 控制台 → API Keys 產生）
  2. 確認 Resend 已完成網域驗證（Domains → iclarityvision.com → Verified）
  3. 修改下方 CONFIG 的 REPORT_URL 和 RECIPIENTS（如需異動）

用法：
  python send_report_email.py                     # 自動偵測本週週次
  python send_report_email.py --week W21          # 指定週次
  python send_report_email.py --dry-run           # 只印出信件內容，不實際發送
"""

import smtplib
import argparse
import os
import sys
from datetime import datetime, date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# ─── 設定區 ────────────────────────────────────────────────────────────────────

CONFIG = {
    # Gmail SMTP 設定（使用個人 Gmail + App Password）
    # 至 https://myaccount.google.com/apppasswords 產生 App Password，存入環境變數：
    #   export SMTP_PASSWORD="你的16碼AppPassword"
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": 587,
    "SMTP_USER": "medify.agent@gmail.com",
    "SMTP_PASSWORD": os.environ.get("SMTP_PASSWORD", ""),

    # 寄件人地址
    "SENDER_EMAIL": "medify.agent@gmail.com",

    # 報告設定
    "REPORT_URL": "https://agent863.github.io/data/%E9%80%B1%E5%A0%B1_2026-W21_May17-23.html",
    "REPORT_PASSWORD": "9053",

    # 收件人列表
    "RECIPIENTS": [
        "robin@iclarityvision.com",
        # "other@iclarityvision.com",  # 新增更多收件人
    ],

    # 寄件人顯示名稱
    "SENDER_NAME": "Medify 數據週報",
}

# ──────────────────────────────────────────────────────────────────────────────


def get_week_label() -> tuple[str, str, str]:
    """回傳 (週次字串, 週起日, 週末日)，以本週一為基準往前推到上週。"""
    today = date.today()
    # 上週一（本週報告的起始）
    last_monday = today - timedelta(days=today.weekday() + 7)
    last_sunday = last_monday + timedelta(days=6)
    week_num = last_monday.isocalendar()[1]
    week_label = f"W{week_num:02d}"
    period = f"{last_monday.strftime('%m/%d')}–{last_sunday.strftime('%m/%d')}"
    return week_label, last_monday.strftime("%Y-%m-%d"), period


def build_email(week_label: str, period: str) -> tuple[str, str, str]:
    """回傳 (subject, plain_text, html_body)。"""
    report_url = CONFIG["REPORT_URL"]
    password = CONFIG["REPORT_PASSWORD"]
    now_str = datetime.now().strftime("%Y/%m/%d %H:%M")

    subject = f"【全站醫師表現週報】{week_label}（{period}）已更新"

    plain = f"""Hi，

本週醫師表現週報已產出並更新。

📊 報告連結：{report_url}
🔑 瀏覽密碼：{password}

本報告由系統自動發送，每週一產出。
如有疑問請回覆此信。

—— Medify 數據週報 · {now_str}
"""

    html = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  body {{ margin:0; padding:0; background:#f6f8fb;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC",Arial,sans-serif;
    font-size:15px; line-height:1.7; color:#1a2433; }}
  .wrap {{ max-width:560px; margin:32px auto; padding:0 16px 40px; }}
  .header {{ background:linear-gradient(135deg,#0f6fff,#1f4cdb); color:#fff;
    border-radius:12px; padding:28px 32px; margin-bottom:20px; }}
  .header .eye {{ font-size:11px; letter-spacing:.15em; text-transform:uppercase; opacity:.8; margin-bottom:6px; }}
  .header h1 {{ margin:0; font-size:22px; font-weight:700; }}
  .card {{ background:#fff; border:1px solid #e6ebf2; border-radius:12px; padding:24px 28px; margin-bottom:16px; }}
  .btn {{ display:inline-block; background:#0f6fff; color:#ffffff !important; text-decoration:none;
    padding:12px 28px; border-radius:8px; font-weight:600; font-size:15px; margin:12px 0 4px; }}
  .pwd {{ display:inline-block; background:#f0f7ff; color:#0f6fff; font-family:monospace;
    font-size:20px; font-weight:700; letter-spacing:.15em; padding:8px 20px;
    border-radius:8px; border:1px solid #93c5fd; margin:8px 0; }}
  .label {{ font-size:12px; color:#8a94a6; margin-bottom:4px; }}
  .footer {{ text-align:center; font-size:12px; color:#8a94a6; margin-top:12px; }}
  .dot {{ display:inline-block; width:6px; height:6px; border-radius:50%; background:#fff; opacity:.7; margin-right:6px; }}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="eye">Weekly Performance Report · {week_label}</div>
    <h1>全站醫師表現週報</h1>
    <div style="font-size:13px;opacity:.9;margin-top:10px;">
      <span><span class="dot"></span>報告週期：{period}</span>
      &nbsp;&nbsp;
      <span><span class="dot"></span>數據來源：GA4 ＋ Looker Studio</span>
    </div>
  </div>

  <div class="card">
    <p style="margin:0 0 16px; color:#4a5670;">Hi，本週全站醫師表現週報已產出並更新，請點擊下方按鈕查閱。</p>
    <a href="{report_url}" class="btn">📊 查看本週週報</a>
    <div style="margin-top:18px;">
      <div class="label">網頁瀏覽密碼</div>
      <div class="pwd">{password}</div>
    </div>
  </div>

  <div class="footer">
    本信由系統自動發送 · {now_str}<br>
    如有疑問請回覆此信
  </div>
</div>
</body>
</html>"""

    return subject, plain, html


def send_email(subject: str, plain: str, html: str, dry_run: bool = False) -> None:
    recipients = CONFIG["RECIPIENTS"]
    sender = f"{CONFIG['SENDER_NAME']} <{CONFIG['SENDER_EMAIL']}>"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(plain, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    if dry_run:
        print("── DRY RUN MODE ── （不實際發送）")
        print(f"From:    {sender}")
        print(f"To:      {msg['To']}")
        print(f"Subject: {subject}")
        print("\n── HTML 信件內容（前 500 字）──")
        print(html[:500], "...")
        return

    if not CONFIG["SMTP_PASSWORD"]:
        print("❌ 錯誤：SMTP_PASSWORD 未設定。請執行：export SMTP_PASSWORD='你的16碼AppPassword'", file=sys.stderr)
        sys.exit(1)

    print(f"📤 寄送週報通知給：{msg['To']}")
    with smtplib.SMTP(CONFIG["SMTP_HOST"], CONFIG["SMTP_PORT"]) as server:
        server.ehlo()
        server.starttls()
        server.login(CONFIG["SMTP_USER"], CONFIG["SMTP_PASSWORD"])
        server.sendmail(CONFIG["SENDER_EMAIL"], recipients, msg.as_string())
    print(f"✅ 發信成功！主旨：{subject}")


def main():
    parser = argparse.ArgumentParser(description="發送醫師表現週報通知信")
    parser.add_argument("--week", default=None, help="指定週次，例如 W21（預設自動偵測上週）")
    parser.add_argument("--dry-run", action="store_true", help="測試模式：只印出信件內容，不實際發送")
    args = parser.parse_args()

    week_label, _, period = get_week_label()
    if args.week:
        week_label = args.week

    print(f"🗓  週次：{week_label}  週期：{period}")
    subject, plain, html = build_email(week_label, period)
    send_email(subject, plain, html, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
