import { audioSlot, getBucket, readSiteContent } from "../../../server-content";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slot: string }> },
) {
  const { slot: rawSlot } = await context.params;
  const slot = audioSlot(rawSlot);
  if (!slot) return new Response("Not found", { status: 404 });
  const content = await readSiteContent();
  const track = content.audio[slot];
  if (!track.hasCustomAudio || !track.objectKey)
    return new Response("Not found", { status: 404 });
  const object = await getBucket().get(track.objectKey);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
