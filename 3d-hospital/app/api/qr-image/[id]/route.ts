import { QR_IDS, type QrId } from "../../../content-config";
import { getBucket, readSiteContent } from "../../../server-content";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!QR_IDS.includes(id as QrId)) return new Response("Not found", { status: 404 });

  const content = await readSiteContent();
  const qr = content.qrCodes.find((entry) => entry.id === id);
  if (!qr?.hasCustomImage || !qr.imageObjectKey)
    return new Response("Not found", { status: 404 });

  const object = await getBucket().get(qr.imageObjectKey);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
