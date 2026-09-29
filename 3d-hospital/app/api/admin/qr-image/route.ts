import {
  QR_IDS,
  type QrId,
} from "../../../content-config";
import {
  getBucket,
  readSiteContent,
  requireAdminApi,
  writeSiteContent,
} from "../../../server-content";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!QR_IDS.includes(id as QrId))
    return Response.json({ error: "QR Code 位置無效" }, { status: 400 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return Response.json({ error: "請選擇 QR Code 圖片" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES)
    return Response.json({ error: "QR Code 圖片必須小於 10 MB" }, { status: 400 });
  if (!file.type.startsWith("image/"))
    return Response.json({ error: "檔案格式必須是圖片" }, { status: 400 });

  const bucket = getBucket();
  const current = await readSiteContent();
  const entry = current.qrCodes.find((qr) => qr.id === id);
  if (!entry) return Response.json({ error: "找不到 QR Code 設定" }, { status: 404 });

  const version = Date.now();
  const key = `qr-images/${id}/${version}-${crypto.randomUUID()}`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      uploadedBy: auth.user.email,
      originalName: file.name.slice(0, 180),
    },
  });

  const next = {
    ...current,
    qrCodes: current.qrCodes.map((qr) =>
      qr.id === id
        ? {
            ...qr,
            imageFileName: file.name.slice(0, 180),
            imageObjectKey: key,
            imageSourceVersion: version,
            hasCustomImage: true,
          }
        : qr,
    ),
  };

  try {
    const content = await writeSiteContent(next, auth.user.email);
    if (entry.imageObjectKey && entry.imageObjectKey !== key)
      await bucket.delete(entry.imageObjectKey);
    return Response.json({ entry: content.qrCodes.find((qr) => qr.id === id), content });
  } catch (error) {
    await bucket.delete(key);
    return Response.json(
      { error: error instanceof Error ? error.message : "QR Code 圖片儲存失敗" },
      { status: 500 },
    );
  }
}
