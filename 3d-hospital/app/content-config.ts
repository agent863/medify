export const QR_IDS = [
  "reception-checkin",
  "waiting-table-1",
  "waiting-table-2",
  "waiting-table-3",
  "waiting-table-4",
  "upper-info-screen",
  "lobby-waiting-1",
  "lobby-waiting-2",
  "lobby-waiting-3",
  "lobby-waiting-4",
  "clinic-door-1",
  "clinic-door-2",
  "clinic-door-3",
  "clinic-door-4",
  "clinic-door-5",
  "clinic-tablet-1",
  "clinic-tablet-2",
  "clinic-tablet-3",
  "clinic-tablet-4",
  "clinic-tablet-5",
] as const;

export type QrId = (typeof QR_IDS)[number];
export const AUDIO_SLOTS = [
  "music",
  "ambience",
  "chime",
  "floor2Music",
  "floor2Ambience",
  "floor2Chime",
  "floor3Music",
  "floor3Ambience",
  "floor3Chime",
] as const;
export type AudioSlot = (typeof AUDIO_SLOTS)[number];
export const AUDIO_INHERITANCE: Partial<Record<AudioSlot, AudioSlot>> = {
  floor3Music: "floor2Music",
  floor3Ambience: "floor2Ambience",
  floor3Chime: "floor2Chime",
};

export type QrEntry = {
  id: QrId;
  name: string;
  location: string;
  destinationUrl: string;
};

export type AudioTrackConfig = {
  name: string;
  fileName: string;
  objectKey: string;
  sourceVersion: number;
  volume: number;
  hasCustomAudio: boolean;
};

export type DialogueConfig = {
  doctor: string;
  counterNurse: string;
  lobbyNurse: string;
  clinicNurse: string;
  pharmacist: string;
  eyeAssistant: string;
  bird: string;
};

export type PatientStatusConfig = {
  entering: string;
  preScan: string;
  counterTalk: string;
  counterScan: string;
  checkinQueue: string;
  waitingReading: string;
  walkingLobbyQr: string;
  waiting: string;
  calledInbound: string;
  exam: string;
  clinicScan: string;
  leavingClinic: string;
  consulting: string;
  postClinicReading: string;
  postClinicTransit: string;
  postLobbyScan: string;
  postWaitReading: string;
  postWaitTransit: string;
  payment: string;
  pickup: string;
  leaving: string;
  fallback: string;
};

export type PatientDetailConfig = {
  waitingReading: string;
  clinicReading: string;
  postWaitReading: string;
  leaving: string;
};

export type SiteContentConfig = {
  qrCodes: QrEntry[];
  dialogues: DialogueConfig;
  patientStatuses: PatientStatusConfig;
  patientDetails: PatientDetailConfig;
  audio: Record<AudioSlot, AudioTrackConfig>;
  updatedAt: string;
};

const qr = (id: QrId, name: string, location: string): QrEntry => ({
  id,
  name,
  location,
  destinationUrl: "",
});

export const DEFAULT_CONTENT: SiteContentConfig = {
  qrCodes: [
    qr("reception-checkin", "櫃檯報到 QR Code", "服務櫃檯立牌"),
    qr("waiting-table-1", "候診桌 QR Code 1", "左前候診區"),
    qr("waiting-table-2", "候診桌 QR Code 2", "右前候診區"),
    qr("waiting-table-3", "候診桌 QR Code 3", "左後候診區"),
    qr("waiting-table-4", "候診桌 QR Code 4", "右後候診區"),
    qr("upper-info-screen", "二樓資訊螢幕 QR Code", "二樓候診資訊螢幕"),
    ...Array.from({ length: 4 }, (_, index) =>
      qr(
        `lobby-waiting-${index + 1}` as QrId,
        `二樓候診桌 QR Code ${index + 1}`,
        `二樓候診區 ${index + 1}`,
      ),
    ),
    ...Array.from({ length: 5 }, (_, index) =>
      qr(
        `clinic-door-${index + 1}` as QrId,
        `${index + 1} 號診間門口 QR Code`,
        `${index + 1} 號診間門口`,
      ),
    ),
    ...Array.from({ length: 5 }, (_, index) =>
      qr(
        `clinic-tablet-${index + 1}` as QrId,
        `${index + 1} 號診間平板 QR Code`,
        `${index + 1} 號診間桌面`,
      ),
    ),
  ],
  dialogues: {
    doctor:
      "Medify 的智慧醫療服務將重複性的問診過程簡化，且讓病患取得妥善審核過的衛教資訊。",
    counterNurse: "報到後請到右手邊掃描 QRcode 閱讀相關衛教資訊。",
    lobbyNurse:
      "報到後請先在候診區稍作等候，掃描候診區桌上的 QRcode 閱讀相關衛教資訊，輪到您診間叫號機會通知您前往。",
    clinicNurse:
      "請掃描平板上的 QRcode 閱讀與您與醫師諮詢的相關衛教資訊，包含後續的照護與注意事項。",
    pharmacist: "請掃描藥袋上的 QRcode 閱讀用藥須知。",
    eyeAssistant: "嗨！我是眼球小助手。需要我陪你確認報到、候診或看診流程嗎？",
    bird: "祝你有美好的一天，啾～",
  },
  patientStatuses: {
    entering: "正從街道進入醫院",
    preScan: "正前往報到 QR Code",
    counterTalk: "正在櫃檯辦理報到",
    counterScan: "正在掃描櫃檯 QR Code",
    checkinQueue: "正在排隊等候報到",
    waitingReading: "正在查看 QRcode 中的內容並等候叫號",
    walkingLobbyQr: "正前往大廳 QR Code",
    waiting: "正在候診大廳等候",
    calledInbound: "已叫號，正前往 {room} 號診間",
    exam: "正在診間接受檢查",
    clinicScan: "正在診間掃描衛教 QR Code",
    leavingClinic: "已完成看診，正離開診間",
    consulting: "正在診間看診",
    postClinicReading: "正在查看診間 QRcode 中的內容",
    postClinicTransit: "已完成看診，正前往候診區",
    postLobbyScan: "正前往大廳掃描 QR Code",
    postWaitReading: "正在查看更多衛教內容",
    postWaitTransit: "完成掃描後正前往候診區",
    payment: "正在完成繳費流程",
    pickup: "正在櫃檯排隊領藥",
    leaving: "已領藥",
    fallback: "正在依照院內流程移動",
  },
  patientDetails: {
    waitingReading:
      "這裡有許多與我有關的資訊，非常清楚且容易閱讀，接下來看診比較不緊張了！",
    clinicReading: "這裡有清楚的衛教資訊與後續照護方式，很好理解呢！",
    postWaitReading: "這些內容可以帶回家仔細閱讀，也讓家人一起安心。",
    leaving: "藥袋上的 QRcode 中有清楚的用藥方式與須知，讓人很安心。",
  },
  audio: {
    music: {
      name: "一樓背景音樂",
      fileName: "StudioKolomna - 30 sec version.mp3",
      objectKey: "",
      sourceVersion: 0,
      volume: 0.065,
      hasCustomAudio: false,
    },
    ambience: {
      name: "一樓醫院環境音",
      fileName: "hospital-waiting-room-ambience.mp3",
      objectKey: "",
      sourceVersion: 0,
      volume: 0.144,
      hasCustomAudio: false,
    },
    chime: {
      name: "一樓診間叫號音",
      fileName: "系統雙音叫號音",
      objectKey: "",
      sourceVersion: 0,
      volume: 0.18,
      hasCustomAudio: false,
    },
    floor2Music: {
      name: "二樓背景音樂",
      fileName: "StudioKolomna - 30 sec version.mp3",
      objectKey: "",
      sourceVersion: 0,
      volume: 0.065,
      hasCustomAudio: false,
    },
    floor2Ambience: {
      name: "二樓醫院環境音",
      fileName: "hospital-waiting-room-ambience.mp3",
      objectKey: "",
      sourceVersion: 0,
      volume: 0.144,
      hasCustomAudio: false,
    },
    floor2Chime: {
      name: "二樓叫號提示音",
      fileName: "系統雙音叫號音",
      objectKey: "",
      sourceVersion: 0,
      volume: 0.18,
      hasCustomAudio: false,
    },
    floor3Music: {
      name: "三樓背景音樂",
      fileName: "沿用二樓背景音樂",
      objectKey: "",
      sourceVersion: 0,
      volume: 0.065,
      hasCustomAudio: false,
    },
    floor3Ambience: {
      name: "三樓醫院環境音",
      fileName: "沿用二樓醫院環境音",
      objectKey: "",
      sourceVersion: 0,
      volume: 0.144,
      hasCustomAudio: false,
    },
    floor3Chime: {
      name: "三樓叫號提示音",
      fileName: "沿用二樓叫號提示音",
      objectKey: "",
      sourceVersion: 0,
      volume: 0.18,
      hasCustomAudio: false,
    },
  },
  updatedAt: "",
};

export const PUBLIC_AUDIO_FALLBACKS: Record<AudioSlot, string | null> = {
  music: "/medify-open-morning.mp3",
  ambience: "/hospital-waiting-room-ambience.mp3",
  chime: null,
  floor2Music: "/medify-open-morning.mp3",
  floor2Ambience: "/hospital-waiting-room-ambience.mp3",
  floor2Chime: null,
  floor3Music: "/medify-open-morning.mp3",
  floor3Ambience: "/hospital-waiting-room-ambience.mp3",
  floor3Chime: null,
};

export function cloneDefaultContent(): SiteContentConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as SiteContentConfig;
}

export function mergeContentConfig(
  stored?: Partial<SiteContentConfig> | null,
): SiteContentConfig {
  const base = cloneDefaultContent();
  if (!stored) return base;
  const storedQr = new Map((stored.qrCodes ?? []).map((entry) => [entry.id, entry]));
  base.qrCodes = base.qrCodes.map((entry) => ({
    ...entry,
    ...(storedQr.get(entry.id) ?? {}),
    id: entry.id,
  }));
  base.dialogues = { ...base.dialogues, ...(stored.dialogues ?? {}) };
  base.patientStatuses = {
    ...base.patientStatuses,
    ...(stored.patientStatuses ?? {}),
  };
  base.patientDetails = {
    ...base.patientDetails,
    ...(stored.patientDetails ?? {}),
  };
  for (const slot of AUDIO_SLOTS)
    base.audio[slot] = { ...base.audio[slot], ...(stored.audio?.[slot] ?? {}) };
  // Existing installations predate the 3F mixer. On first load, seed its
  // independent volume controls from 2F while source resolution continues to
  // inherit the corresponding 2F audio until a dedicated 3F file is uploaded.
  for (const [floor3Slot, floor2Slot] of Object.entries(AUDIO_INHERITANCE) as Array<
    [AudioSlot, AudioSlot]
  >)
    if (!stored.audio?.[floor3Slot])
      base.audio[floor3Slot] = {
        ...base.audio[floor3Slot],
        volume: base.audio[floor2Slot].volume,
      };
  base.updatedAt = stored.updatedAt ?? "";
  return base;
}
