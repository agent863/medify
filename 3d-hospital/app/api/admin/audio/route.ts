import {
  audioSlot,
  getBucket,
  readSiteContent,
  requireAdminApi,
  writeSiteContent,
} from "../../../server-content";

export const dynamic = "force-dynamic";
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_PART_BYTES = 6 * 1024 * 1024;

const validUploadKey = (slot: string, key: unknown): key is string =>
  typeof key === "string" &&
  key.startsWith(`audio/${slot}/`) &&
  !key.includes("..") &&
  key.length < 240;

const safeFileName = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 180)
    : "audio-file";

const safeContentType = (value: unknown) =>
  typeof value === "string" && value.startsWith("audio/")
    ? value.slice(0, 100)
    : "audio/wav";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  const slot = audioSlot(new URL(request.url).searchParams.get("slot"));
  if (!slot)
    return Response.json({ error: "未知的音軌" }, { status: 400 });
  const url = new URL(request.url),
    action = url.searchParams.get("action") ?? "direct",
    bucket = getBucket();

  if (action === "start") {
    try {
      const payload = (await request.json()) as {
          fileName?: unknown;
          contentType?: unknown;
          size?: unknown;
        },
        size = Number(payload.size);
      if (!Number.isFinite(size) || size <= 0 || size > MAX_AUDIO_BYTES)
        return Response.json(
          { error: "音檔必須小於 50 MB" },
          { status: 400 },
        );
      const version = Date.now(),
        key = `audio/${slot}/${version}-${crypto.randomUUID()}`,
        fileName = safeFileName(payload.fileName),
        contentType = safeContentType(payload.contentType),
        upload = await bucket.createMultipartUpload(key, {
          httpMetadata: { contentType },
          customMetadata: {
            uploadedBy: auth.user.email,
            originalName: fileName,
          },
        });
      return Response.json({
        uploadId: upload.uploadId,
        key,
        version,
        fileName,
        contentType,
      });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "無法開始音檔上傳" },
        { status: 500 },
      );
    }
  }

  if (action === "part") {
    const key = url.searchParams.get("key"),
      uploadId = url.searchParams.get("uploadId"),
      partNumber = Number(url.searchParams.get("partNumber")),
      contentLength = Number(request.headers.get("content-length") ?? 0);
    if (
      !validUploadKey(slot, key) ||
      !uploadId ||
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > 10000 ||
      !request.body ||
      contentLength <= 0 ||
      contentLength > MAX_PART_BYTES
    )
      return Response.json({ error: "音檔分段資料無效" }, { status: 400 });
    try {
      const upload = bucket.resumeMultipartUpload(key, uploadId),
        part = await upload.uploadPart(partNumber, request.body);
      return Response.json({ partNumber: part.partNumber, etag: part.etag });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "音檔分段上傳失敗" },
        { status: 500 },
      );
    }
  }

  if (action === "complete") {
    try {
      const payload = (await request.json()) as {
          key?: unknown;
          uploadId?: unknown;
          version?: unknown;
          fileName?: unknown;
          parts?: Array<{ partNumber?: unknown; etag?: unknown }>;
        },
        key = payload.key,
        uploadId = payload.uploadId,
        version = Number(payload.version),
        parts = (payload.parts ?? []).map((part) => ({
          partNumber: Number(part.partNumber),
          etag: String(part.etag ?? ""),
        }));
      if (
        !validUploadKey(slot, key) ||
        typeof uploadId !== "string" ||
        !Number.isFinite(version) ||
        !parts.length ||
        parts.some(
          (part) =>
            !Number.isInteger(part.partNumber) ||
            part.partNumber < 1 ||
            !part.etag,
        )
      )
        return Response.json({ error: "音檔完成資料無效" }, { status: 400 });
      const upload = bucket.resumeMultipartUpload(key, uploadId);
      await upload.complete(parts);
      const current = await readSiteContent(),
        previousKey = current.audio[slot].objectKey,
        fileName = safeFileName(payload.fileName);
      current.audio[slot] = {
        ...current.audio[slot],
        fileName,
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
        throw error;
      }
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "音檔儲存失敗" },
        { status: 500 },
      );
    }
  }

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
