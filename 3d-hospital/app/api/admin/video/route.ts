import {
  getBucket,
  readSiteContent,
  requireAdminApi,
  writeSiteContent,
} from "../../../server-content";

export const dynamic = "force-dynamic";

const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const MAX_PART_BYTES = 6 * 1024 * 1024;

const validUploadKey = (key: unknown): key is string =>
  typeof key === "string" &&
  key.startsWith("video/ward-screens/") &&
  !key.includes("..") &&
  key.length < 240;

const safeFileName = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 180)
    : "ward-screen-video";

const safeContentType = (value: unknown) =>
  typeof value === "string" && value.startsWith("video/")
    ? value.slice(0, 100)
    : "video/mp4";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "direct";
  const bucket = getBucket();

  if (action === "start") {
    try {
      const payload = (await request.json()) as {
        fileName?: unknown;
        contentType?: unknown;
        size?: unknown;
      };
      const size = Number(payload.size);
      if (!Number.isFinite(size) || size <= 0 || size > MAX_VIDEO_BYTES)
        return Response.json(
          { error: "影片必須小於 250 MB" },
          { status: 400 },
        );
      const version = Date.now();
      const key = `video/ward-screens/${version}-${crypto.randomUUID()}`;
      const fileName = safeFileName(payload.fileName);
      const contentType = safeContentType(payload.contentType);
      const upload = await bucket.createMultipartUpload(key, {
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
        { error: error instanceof Error ? error.message : "無法開始影片上傳" },
        { status: 500 },
      );
    }
  }

  if (action === "part") {
    const key = url.searchParams.get("key");
    const uploadId = url.searchParams.get("uploadId");
    const partNumber = Number(url.searchParams.get("partNumber"));
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (
      !validUploadKey(key) ||
      !uploadId ||
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > 10000 ||
      !request.body ||
      contentLength <= 0 ||
      contentLength > MAX_PART_BYTES
    )
      return Response.json({ error: "影片分段資料無效" }, { status: 400 });
    try {
      const upload = bucket.resumeMultipartUpload(key, uploadId);
      const part = await upload.uploadPart(partNumber, request.body);
      return Response.json({ partNumber: part.partNumber, etag: part.etag });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "影片分段上傳失敗" },
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
      };
      const key = payload.key;
      const uploadId = payload.uploadId;
      const version = Number(payload.version);
      const parts = (payload.parts ?? []).map((part) => ({
        partNumber: Number(part.partNumber),
        etag: String(part.etag ?? ""),
      }));
      if (
        !validUploadKey(key) ||
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
        return Response.json({ error: "影片完成資料無效" }, { status: 400 });

      const upload = bucket.resumeMultipartUpload(key, uploadId);
      await upload.complete(parts);
      const current = await readSiteContent();
      const previousKey = current.video.objectKey;
      const fileName = safeFileName(payload.fileName);
      current.video = {
        ...current.video,
        fileName,
        objectKey: key,
        sourceVersion: version,
        hasCustomVideo: true,
      };
      try {
        const content = await writeSiteContent(current, auth.user.email);
        if (previousKey && previousKey !== key) await bucket.delete(previousKey);
        return Response.json({ video: content.video, content });
      } catch (error) {
        await bucket.delete(key);
        throw error;
      }
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "影片儲存失敗" },
        { status: 500 },
      );
    }
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return Response.json({ error: "請選擇影片" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_VIDEO_BYTES)
    return Response.json({ error: "影片必須小於 250 MB" }, { status: 400 });
  if (!file.type.startsWith("video/"))
    return Response.json({ error: "檔案格式必須是影片" }, { status: 400 });

  const current = await readSiteContent();
  const previousKey = current.video.objectKey;
  const version = Date.now();
  const key = `video/ward-screens/${version}.video`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "video/mp4" },
    customMetadata: { uploadedBy: auth.user.email, originalName: file.name },
  });
  current.video = {
    ...current.video,
    fileName: file.name,
    objectKey: key,
    sourceVersion: version,
    hasCustomVideo: true,
  };
  try {
    const content = await writeSiteContent(current, auth.user.email);
    if (previousKey && previousKey !== key) await bucket.delete(previousKey);
    return Response.json({ video: content.video, content });
  } catch (error) {
    await bucket.delete(key);
    return Response.json(
      { error: error instanceof Error ? error.message : "影片儲存失敗" },
      { status: 500 },
    );
  }
}
