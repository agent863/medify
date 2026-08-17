import {
  audioSlot,
  getBucket,
  readSiteContent,
  requireAdminApi,
  writeSiteContent,
} from "../../../server-content";

export const dynamic = "force-dynamic";
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  const slot = audioSlot(new URL(request.url).searchParams.get("slot"));
  if (!slot)
    return Response.json({ error: "未知的音軌" }, { status: 400 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return Response.json({ error: "請選擇音檔" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_AUDIO_BYTES)
    return Response.json(
      { error: "剪輯後的音檔必須小於 50 MB" },
      { status: 400 },
    );
  if (!file.type.startsWith("audio/"))
    return Response.json({ error: "檔案格式必須是音訊" }, { status: 400 });

  const current = await readSiteContent();
  const previousKey = current.audio[slot].objectKey;
  const version = Date.now();
  const key = `audio/${slot}/${version}.wav`;
  const bucket = getBucket();
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "audio/wav" },
    customMetadata: { uploadedBy: auth.user.email, originalName: file.name },
  });
  current.audio[slot] = {
    ...current.audio[slot],
    fileName: file.name,
    objectKey: key,
    sourceVersion: version,
    hasCustomAudio: true,
  };
  try {
    const content = await writeSiteContent(current, auth.user.email);
    if (previousKey && previousKey !== key) await bucket.delete(previousKey);
    return Response.json({ track: content.audio[slot], content });
  } catch (error) {
    await bucket.delete(key);
    return Response.json(
      { error: error instanceof Error ? error.message : "音檔儲存失敗" },
      { status: 500 },
    );
  }
}
