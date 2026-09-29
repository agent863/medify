import { getBucket, readSiteContent } from "../../server-content";

export const dynamic = "force-dynamic";

export async function GET() {
  const content = await readSiteContent();
  if (!content.video.hasCustomVideo || !content.video.objectKey)
    return new Response("Not found", { status: 404 });
  const object = await getBucket().get(content.video.objectKey);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
