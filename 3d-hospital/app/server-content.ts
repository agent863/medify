import {
  AUDIO_SLOTS,
  DEFAULT_CONTENT,
  QR_IDS,
  cloneDefaultContent,
  mergeContentConfig,
  type AudioSlot,
  type SiteContentConfig,
} from "./content-config";
import { getChatGPTUser, type ChatGPTUser } from "./chatgpt-auth";

type RuntimeBindings = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  ADMIN_EMAILS?: string;
};

declare global {
  // The Worker entry assigns the platform bindings before handing each request
  // to Vinext. This keeps route modules portable for artifact validation while
  // retaining the real D1/R2 objects at runtime.
  var __MEDIFY_RUNTIME_ENV__: RuntimeBindings | undefined;
}

const CONTENT_ID = "main";
const runtime = () => globalThis.__MEDIFY_RUNTIME_ENV__ ?? {};

export function getDatabase(): D1Database {
  const database = runtime().DB;
  if (!database) throw new Error("D1 binding DB is unavailable");
  return database;
}

export function getBucket(): R2Bucket {
  const bucket = runtime().BUCKET;
  if (!bucket) throw new Error("R2 binding BUCKET is unavailable");
  return bucket;
}

export async function readSiteContent(): Promise<SiteContentConfig> {
  try {
    const row = await getDatabase()
      .prepare("SELECT payload, updated_at FROM site_content WHERE id = ?")
      .bind(CONTENT_ID)
      .first<{ payload: string; updated_at: string }>();
    if (!row) return cloneDefaultContent();
    const parsed = JSON.parse(row.payload) as Partial<SiteContentConfig>;
    return mergeContentConfig({ ...parsed, updatedAt: row.updated_at });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no such table") || message.includes("DB is unavailable"))
      return cloneDefaultContent();
    throw error;
  }
}

export async function writeSiteContent(
  content: SiteContentConfig,
  updatedBy: string,
): Promise<SiteContentConfig> {
  const updatedAt = new Date().toISOString();
  const normalized = mergeContentConfig({ ...content, updatedAt });
  await getDatabase()
    .prepare(
      `INSERT INTO site_content (id, payload, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(CONTENT_ID, JSON.stringify(normalized), updatedAt, updatedBy)
    .run();
  return normalized;
}

const cleanText = (value: unknown, fallback: string, maxLength = 1200) => {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : fallback;
};

const cleanDestinationUrl = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return "";
  const trimmed = value.trim().slice(0, 2048);
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("QR Code 連結必須是完整的 http:// 或 https:// 網址");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("QR Code 連結只允許 http:// 或 https:// 網址");
  return parsed.toString();
};

const cleanVolume = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
};

export function normalizeAdminContent(
  input: unknown,
  current: SiteContentConfig,
): SiteContentConfig {
  if (!input || typeof input !== "object") throw new Error("缺少內容設定");
  const raw = input as Partial<SiteContentConfig>;
  const result = mergeContentConfig(current);
  const rawQr = new Map((raw.qrCodes ?? []).map((entry) => [entry.id, entry]));
  result.qrCodes = result.qrCodes.map((entry) => {
    if (!QR_IDS.includes(entry.id)) return entry;
    const incoming = rawQr.get(entry.id);
    return {
      ...entry,
      destinationUrl: cleanDestinationUrl(incoming?.destinationUrl),
    };
  });
  for (const key of Object.keys(DEFAULT_CONTENT.dialogues) as Array<
    keyof SiteContentConfig["dialogues"]
  >)
    result.dialogues[key] = cleanText(
      raw.dialogues?.[key],
      result.dialogues[key],
    );
  for (const key of Object.keys(DEFAULT_CONTENT.patientStatuses) as Array<
    keyof SiteContentConfig["patientStatuses"]
  >)
    result.patientStatuses[key] = cleanText(
      raw.patientStatuses?.[key],
      result.patientStatuses[key],
    );
  for (const key of Object.keys(DEFAULT_CONTENT.patientDetails) as Array<
    keyof SiteContentConfig["patientDetails"]
  >)
    result.patientDetails[key] = cleanText(
      raw.patientDetails?.[key],
      result.patientDetails[key],
    );
  for (const slot of AUDIO_SLOTS)
    result.audio[slot] = {
      ...current.audio[slot],
      volume: cleanVolume(raw.audio?.[slot]?.volume, current.audio[slot].volume),
    };
  return result;
}

export async function getAdminUser(): Promise<ChatGPTUser | null> {
  const user = await getChatGPTUser();
  if (!user) return null;
  const allowlist = (runtime().ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(user.email.toLowerCase()) ? user : null;
}

export async function requireAdminApi(): Promise<
  | { user: ChatGPTUser }
  | { response: Response }
> {
  const signedIn = await getChatGPTUser();
  if (!signedIn)
    return {
      response: Response.json({ error: "請先登入後台" }, { status: 401 }),
    };
  const admin = await getAdminUser();
  if (!admin)
    return {
      response: Response.json({ error: "此帳號沒有後台權限" }, { status: 403 }),
    };
  return { user: admin };
}

export function audioSlot(value: string | null): AudioSlot | null {
  return AUDIO_SLOTS.includes(value as AudioSlot) ? (value as AudioSlot) : null;
}
