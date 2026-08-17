import { QR_IDS, type QrId } from "../../content-config";
import { readSiteContent } from "../../server-content";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!QR_IDS.includes(id as QrId)) return new Response("Not found", { status: 404 });
  const content = await readSiteContent();
  const qr = content.qrCodes.find((entry) => entry.id === id);
  if (qr?.destinationUrl)
    return Response.redirect(qr.destinationUrl, 302);
  const home = new URL("/", request.url).toString();
  return new Response(
    `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${qr?.name ?? "Medify QR Code"}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#edf7f9;color:#274a62;font-family:Arial,"Noto Sans TC",sans-serif}.card{width:min(88vw,440px);padding:40px;border-radius:24px;background:white;box-shadow:0 24px 70px #315f7c22;text-align:center}h1{font-size:24px}p{line-height:1.8;color:#66808c}a{display:inline-block;margin-top:12px;padding:12px 22px;border-radius:999px;background:#45c2c7;color:white;text-decoration:none}</style><body><main class="card"><h1>${qr?.name ?? "Medify QR Code"}</h1><p>此 QR Code 尚未設定衛教內容連結，請稍後再試。</p><a href="${home}">返回 Medify 醫院</a></main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
