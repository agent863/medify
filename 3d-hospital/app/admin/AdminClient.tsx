"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUDIO_SLOTS,
  PUBLIC_AUDIO_FALLBACKS,
  type AudioSlot,
  type SiteContentConfig,
} from "../content-config";
import { roleRuleGroups } from "./role-rules";

const roleRuleSections = [
  {
    floor: "共通" as const,
    eyebrow: "SHARED RULES",
    title: "跨樓層共通規則",
    description: "所有人物都必須遵守的移動、碰撞與互動底線。",
  },
  {
    floor: "二樓" as const,
    eyebrow: "SECOND FLOOR",
    title: "二樓角色規則",
    description: "手術室、檢查室及家屬等候區目前已確認的完整角色配置與行為。",
  },
  {
    floor: "一樓" as const,
    eyebrow: "FIRST FLOOR",
    title: "一樓與院外角色規則",
    description: "一樓門診、藥局、大廳與院外街景角色的行為規範。",
  },
];

type Props = {
  initialContent: SiteContentConfig;
  displayName: string;
  email: string;
  signOutPath: string;
};

type AudioDraft = {
  file: File | null;
  sourceBlob: Blob | null;
  sourceUrl: string | null;
  sourceName: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  peaks: number[];
  dirty: boolean;
  loading: boolean;
};

const audioSlots: AudioSlot[] = [...AUDIO_SLOTS];
const audioFloorGroups: Array<{
  floor: 1 | 2;
  title: string;
  slots: AudioSlot[];
}> = [
  { floor: 1, title: "一樓場景聲音", slots: ["music", "ambience", "chime"] },
  {
    floor: 2,
    title: "二樓場景聲音",
    slots: ["floor2Music", "floor2Ambience", "floor2Chime"],
  },
];
const isChimeSlot = (slot: AudioSlot) =>
  slot === "chime" || slot === "floor2Chime";
const dialogueLabels: Record<keyof SiteContentConfig["dialogues"], string> = {
  doctor: "醫師",
  counterNurse: "櫃檯護理師",
  lobbyNurse: "大廳護理師",
  clinicNurse: "診間護理師",
  pharmacist: "藥師",
  eyeAssistant: "眼球小助手",
  bird: "小鳥",
};
const statusLabels: Record<keyof SiteContentConfig["patientStatuses"], string> = {
  entering: "從街道進場",
  preScan: "前往報到 QR Code",
  counterTalk: "櫃檯報到中",
  counterScan: "掃描櫃檯 QR Code",
  checkinQueue: "排隊等候報到",
  waitingReading: "候診時查看手機",
  walkingLobbyQr: "前往大廳 QR Code",
  waiting: "一般候診",
  calledInbound: "叫號後前往診間（可使用 {room}）",
  exam: "診間檢查",
  clinicScan: "掃描診間 QR Code",
  leavingClinic: "離開診間",
  consulting: "診間看診",
  postClinicReading: "看診後查看診間內容",
  postClinicTransit: "看診後返回候診區",
  postLobbyScan: "看診後前往大廳 QR Code",
  postWaitReading: "看診後查看更多內容",
  postWaitTransit: "完成掃描返回候診區",
  payment: "繳費流程",
  pickup: "排隊領藥",
  leaving: "領藥完成／離院",
  fallback: "其他移動狀態",
};
const detailLabels: Record<keyof SiteContentConfig["patientDetails"], string> = {
  waitingReading: "首次候診閱讀感想",
  clinicReading: "診間閱讀感想",
  postWaitReading: "看診後閱讀感想",
  leaving: "領藥後感想",
};

function sourceForTrack(content: SiteContentConfig, slot: AudioSlot) {
  const track = content.audio[slot];
  return track.hasCustomAudio
    ? `/api/audio/${slot}?v=${track.sourceVersion}`
    : PUBLIC_AUDIO_FALLBACKS[slot];
}

type AudioUploadResult = {
  error?: string;
  content?: SiteContentConfig;
  uploadId?: string;
  key?: string;
  version?: number;
  partNumber?: number;
  etag?: string;
};

const AUDIO_PART_BYTES = 5 * 1024 * 1024;

async function audioUploadResponse(response: Response) {
  try {
    return (await response.json()) as AudioUploadResult;
  } catch {
    return {
      error:
        response.status === 413
          ? "音檔分段上傳遭到拒絕，請稍後再試。"
          : "伺服器沒有回傳有效的上傳結果。",
    };
  }
}

async function uploadAudioTrack(
  slot: AudioSlot,
  blob: Blob,
  fileName: string,
) {
  // The hosted form-data parser rejects requests near 3 MB. Use the raw-body
  // multipart flow for every audio size so compressed files do not hit that
  // parser before the application's 50 MB validation can run.
  const startResponse = await fetch(
      `/api/admin/audio?slot=${slot}&action=start`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          contentType: blob.type || "audio/wav",
          size: blob.size,
        }),
      },
    ),
    start = await audioUploadResponse(startResponse);
  if (
    !startResponse.ok ||
    !start.uploadId ||
    !start.key ||
    !start.version
  )
    throw new Error(start.error || "無法開始音檔上傳");

  const parts: Array<{ partNumber: number; etag: string }> = [];
  for (let offset = 0, partNumber = 1; offset < blob.size; partNumber++) {
    const chunk = blob.slice(offset, offset + AUDIO_PART_BYTES),
      partUrl = new URL("/api/admin/audio", window.location.origin);
    partUrl.searchParams.set("slot", slot);
    partUrl.searchParams.set("action", "part");
    partUrl.searchParams.set("key", start.key);
    partUrl.searchParams.set("uploadId", start.uploadId);
    partUrl.searchParams.set("partNumber", String(partNumber));
    const partResponse = await fetch(partUrl, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: chunk,
      }),
      part = await audioUploadResponse(partResponse);
    if (!partResponse.ok || !part.etag || !part.partNumber)
      throw new Error(part.error || `音檔第 ${partNumber} 段上傳失敗`);
    parts.push({ partNumber: part.partNumber, etag: part.etag });
    offset += chunk.size;
  }

  const completeResponse = await fetch(
      `/api/admin/audio?slot=${slot}&action=complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: start.key,
          uploadId: start.uploadId,
          version: start.version,
          fileName,
          parts,
        }),
      },
    ),
    complete = await audioUploadResponse(completeResponse);
  if (!completeResponse.ok)
    throw new Error(complete.error || "音檔合併失敗");
  return complete;
}

async function analyzeAudio(file: Blob) {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const peakCount = 180;
    const peaks = Array.from({ length: peakCount }, (_, peakIndex) => {
      const start = Math.floor((peakIndex / peakCount) * buffer.length);
      const end = Math.max(
        start + 1,
        Math.floor(((peakIndex + 1) / peakCount) * buffer.length),
      );
      const sampleStep = Math.max(1, Math.floor((end - start) / 80));
      let peak = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let sample = start; sample < end; sample += sampleStep)
          peak = Math.max(peak, Math.abs(data[sample] ?? 0));
      }
      return Math.max(0.025, peak);
    });
    const ceiling = Math.max(...peaks, 0.001);
    return {
      duration: buffer.duration,
      peaks: peaks.map((peak) => peak / ceiling),
    };
  } finally {
    await context.close();
  }
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index++)
    view.setUint8(offset + index, value.charCodeAt(index));
}

function audioBufferToWav(source: AudioBuffer, start: number, end: number) {
    const sampleRate = source.sampleRate;
    const firstSample = Math.max(0, Math.floor(start * sampleRate));
    const lastSample = Math.min(source.length, Math.ceil(end * sampleRate));
    const frames = Math.max(1, lastSample - firstSample);
    const channels = Math.min(2, source.numberOfChannels);
    const bytesPerSample = 2;
    const dataBytes = frames * channels * bytesPerSample;
    const output = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(output);
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataBytes, true);
    const channelData = Array.from({ length: channels }, (_, channel) =>
      source.getChannelData(channel),
    );
    let offset = 44;
    for (let frame = firstSample; frame < lastSample; frame++)
      for (let channel = 0; channel < channels; channel++) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
        view.setInt16(
          offset,
          sample < 0 ? sample * 0x8000 : sample * 0x7fff,
          true,
        );
        offset += 2;
      }
    return new Blob([output], { type: "audio/wav" });
}

async function trimToWav(file: Blob, start: number, end: number) {
  const context = new AudioContext();
  try {
    const source = await context.decodeAudioData(await file.arrayBuffer());
    return audioBufferToWav(source, start, end);
  } finally {
    await context.close();
  }
}

async function defaultChimeWav() {
  const sampleRate = 44100;
  const context = new OfflineAudioContext(1, Math.ceil(sampleRate * 1.9), sampleRate);
  const start = 0.04;
  [523.25, 659.25].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + index * 0.22);
    gain.gain.exponentialRampToValueAtTime(
      0.0884,
      start + index * 0.22 + 0.035,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + index * 0.22 + 1.45,
    );
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + index * 0.22);
    oscillator.stop(start + index * 0.22 + 1.5);
  });
  const rendered = await context.startRendering();
  return audioBufferToWav(rendered, 0, rendered.duration);
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
};

function WaveformEditor({
  draft,
  onStartChange,
  onEndChange,
}: {
  draft: AudioDraft;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
}) {
  if (draft.loading)
    return (
      <div className="waveform-loading" aria-live="polite">
        <span />
        正在分析音軌…
      </div>
    );
  if (!draft.duration || !draft.peaks.length)
    return <div className="waveform-loading">請上傳或重新載入音檔以顯示波形</div>;
  const startPercent = (draft.trimStart / draft.duration) * 100;
  const endPercent = (draft.trimEnd / draft.duration) * 100;
  return (
    <div className="waveform-editor">
      <div
        className="waveform-window"
        role="group"
        aria-label="拖曳頭尾控制點調整剪輯範圍"
      >
        <svg viewBox="0 0 180 80" preserveAspectRatio="none" aria-hidden="true">
          {draft.peaks.map((peak, index) => (
            <line
              key={index}
              x1={index + 0.5}
              x2={index + 0.5}
              y1={40 - peak * 34}
              y2={40 + peak * 34}
            />
          ))}
        </svg>
        <div
          className="waveform-selection"
          style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
        />
        <div className="waveform-mask left" style={{ width: `${startPercent}%` }} />
        <div className="waveform-mask right" style={{ left: `${endPercent}%` }} />
        <span className="waveform-handle start" style={{ left: `${startPercent}%` }}><b>頭</b></span>
        <span className="waveform-handle end" style={{ left: `${endPercent}%` }}><b>尾</b></span>
        <input
          className="waveform-range waveform-range-start"
          aria-label="剪輯起點"
          type="range"
          min="0"
          max={draft.duration}
          step="0.01"
          value={draft.trimStart}
          onChange={(event) => onStartChange(Number(event.target.value))}
        />
        <input
          className="waveform-range waveform-range-end"
          aria-label="剪輯終點"
          type="range"
          min="0"
          max={draft.duration}
          step="0.01"
          value={draft.trimEnd}
          onChange={(event) => onEndChange(Number(event.target.value))}
        />
      </div>
      <div className="waveform-time-scale"><span>0:00</span><span>{formatTime(draft.duration / 2)}</span><span>{formatTime(draft.duration)}</span></div>
    </div>
  );
}

export default function AdminClient({
  initialContent,
  displayName,
  email,
  signOutPath,
}: Props) {
  const [content, setContent] = useState(initialContent);
  const [activeSection, setActiveSection] = useState<
    "qr" | "dialogues" | "statuses" | "audio" | "rules"
  >("qr");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  const [audioDrafts, setAudioDrafts] = useState<Record<AudioSlot, AudioDraft>>(
    () =>
      Object.fromEntries(
        audioSlots.map((slot) => [
          slot,
          {
            file: null,
            sourceBlob: null,
            sourceUrl: sourceForTrack(initialContent, slot),
            sourceName: initialContent.audio[slot].fileName,
            duration: 0,
            trimStart: 0,
            trimEnd: 0,
            peaks: [],
            dirty: false,
            loading: true,
          },
        ]),
      ) as unknown as Record<AudioSlot, AudioDraft>,
  );
  const previewAudios = useRef<HTMLAudioElement[]>([]);
  const previewTimers = useRef<number[]>([]);
  const blobUrls = useRef(new Set<string>());

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setOrigin(window.location.origin));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    let active = true;
    const hydrate = async (slot: AudioSlot) => {
      try {
        const sourceUrl = sourceForTrack(initialContent, slot);
        const blob = sourceUrl
          ? await fetch(sourceUrl, { cache: "no-store" }).then((response) => {
              if (!response.ok) throw new Error("download failed");
              return response.blob();
            })
          : await defaultChimeWav();
        const analysis = await analyzeAudio(blob);
        if (!active) return;
        let previewUrl = sourceUrl;
        if (!previewUrl) {
          previewUrl = URL.createObjectURL(blob);
          blobUrls.current.add(previewUrl);
        }
        setAudioDrafts((drafts) => {
          if (drafts[slot].dirty || drafts[slot].file) return drafts;
          return {
            ...drafts,
            [slot]: {
              ...drafts[slot],
              sourceBlob: blob,
              sourceUrl: previewUrl,
              sourceName: initialContent.audio[slot].fileName,
              duration: analysis.duration,
              trimStart: 0,
              trimEnd: analysis.duration,
              peaks: analysis.peaks,
              loading: false,
            },
          };
        });
      } catch {
        if (active)
          setAudioDrafts((drafts) => ({
            ...drafts,
            [slot]: { ...drafts[slot], loading: false },
          }));
      }
    };
    audioSlots.forEach((slot) => void hydrate(slot));
    return () => {
      active = false;
    };
  }, [initialContent]);
  useEffect(
    () => () => {
      previewAudios.current.forEach((audio) => audio.pause());
      previewTimers.current.forEach((timer) => window.clearInterval(timer));
      blobUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const configuredQrCount = useMemo(
    () => content.qrCodes.filter((entry) => entry.destinationUrl).length,
    [content.qrCodes],
  );

  const stopPreview = () => {
    previewAudios.current.forEach((audio) => audio.pause());
    previewAudios.current = [];
    previewTimers.current.forEach((timer) => window.clearInterval(timer));
    previewTimers.current = [];
  };

  const synthesizeDefaultChime = (slot: AudioSlot) => {
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = content.audio[slot].volume;
    master.connect(context.destination);
    const start = context.currentTime + 0.03;
    [523.25, 659.25].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + index * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.0884, start + index * 0.22 + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.22 + 1.45);
      oscillator.connect(gain).connect(master);
      oscillator.start(start + index * 0.22);
      oscillator.stop(start + index * 0.22 + 1.5);
    });
    window.setTimeout(() => void context.close(), 2200);
  };

  const playSlot = (slot: AudioSlot, keepExisting = false) => {
    if (!keepExisting) stopPreview();
    const draft = audioDrafts[slot];
    if (!draft.sourceUrl) {
      if (isChimeSlot(slot)) synthesizeDefaultChime(slot);
      return;
    }
    const audio = new Audio(draft.sourceUrl);
    audio.preload = "auto";
    audio.volume = content.audio[slot].volume;
    audio.currentTime = draft.trimStart || 0;
    audio.loop = !isChimeSlot(slot);
    const end = draft.trimEnd || draft.duration;
    if (end > draft.trimStart) {
      const timer = window.setInterval(() => {
        if (audio.currentTime >= end - 0.03) {
          if (audio.loop) audio.currentTime = draft.trimStart || 0;
          else {
            audio.pause();
            window.clearInterval(timer);
          }
        }
      }, 80);
      previewTimers.current.push(timer);
    }
    previewAudios.current.push(audio);
    void audio.play();
  };

  const playMix = (floor: 1 | 2) => {
    stopPreview();
    if (floor === 1) {
      playSlot("music", true);
      playSlot("ambience", true);
    } else {
      playSlot("floor2Music", true);
      playSlot("floor2Ambience", true);
    }
  };

  const selectAudioFile = async (slot: AudioSlot, file: File | null) => {
    if (!file) return;
    setError("");
    try {
      const analysis = await analyzeAudio(file);
      const old = audioDrafts[slot];
      if (old.sourceUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(old.sourceUrl);
        blobUrls.current.delete(old.sourceUrl);
      }
      const sourceUrl = URL.createObjectURL(file);
      blobUrls.current.add(sourceUrl);
      setAudioDrafts((drafts) => ({
        ...drafts,
        [slot]: {
          file,
          sourceBlob: file,
          sourceUrl,
          sourceName: file.name,
          duration: analysis.duration,
          trimStart: 0,
          trimEnd: analysis.duration,
          peaks: analysis.peaks,
          dirty: true,
          loading: false,
        },
      }));
    } catch {
      setError("無法讀取這個音檔，請改用瀏覽器支援的 MP3、WAV、M4A 或 OGG。");
    }
  };

  const loadExistingAudio = async (slot: AudioSlot) => {
    const sourceUrl = sourceForTrack(content, slot);
    setError("");
    setAudioDrafts((drafts) => ({
      ...drafts,
      [slot]: { ...drafts[slot], loading: true },
    }));
    try {
      const blob = sourceUrl
        ? await fetch(sourceUrl, { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error("download failed");
            return response.blob();
          })
        : await defaultChimeWav();
      const analysis = await analyzeAudio(blob);
      const old = audioDrafts[slot];
      if (old.sourceUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(old.sourceUrl);
        blobUrls.current.delete(old.sourceUrl);
      }
      const previewUrl = sourceUrl ?? URL.createObjectURL(blob);
      if (!sourceUrl) blobUrls.current.add(previewUrl);
      setAudioDrafts((drafts) => ({
        ...drafts,
        [slot]: {
          file: null,
          sourceBlob: blob,
          sourceUrl: previewUrl,
          sourceName: content.audio[slot].fileName,
          duration: analysis.duration,
          trimStart: 0,
          trimEnd: analysis.duration,
          peaks: analysis.peaks,
          dirty: false,
          loading: false,
        },
      }));
    } catch {
      setError("目前無法載入既有音檔進行剪輯，請重新上傳原始檔案。");
      setAudioDrafts((drafts) => ({
        ...drafts,
        [slot]: { ...drafts[slot], loading: false },
      }));
    }
  };

  const setTrimPoint = (
    slot: AudioSlot,
    edge: "start" | "end",
    value: number,
  ) => {
    setAudioDrafts((drafts) => {
      const draft = drafts[slot];
      if (!draft.duration) return drafts;
      const minimumGap = Math.min(0.1, draft.duration);
      const trimStart =
        edge === "start"
          ? Math.max(0, Math.min(value, draft.trimEnd - minimumGap))
          : draft.trimStart;
      const trimEnd =
        edge === "end"
          ? Math.min(
              draft.duration,
              Math.max(value, draft.trimStart + minimumGap),
            )
          : draft.trimEnd;
      return {
        ...drafts,
        [slot]: {
          ...draft,
          trimStart,
          trimEnd,
          dirty: !!draft.sourceBlob,
        },
      };
    });
  };

  const downloadSlot = async (slot: AudioSlot) => {
    setError("");
    try {
      const draft = audioDrafts[slot];
      const source: Blob =
        draft.sourceBlob ??
        (draft.sourceUrl
          ? await fetch(draft.sourceUrl, { cache: "no-store" }).then(
              (response) => {
                if (!response.ok) throw new Error("download failed");
                return response.blob();
              },
            )
          : await defaultChimeWav());
      const url = URL.createObjectURL(source);
      const anchor = document.createElement("a");
      const requestedName = draft.sourceName || `${slot}.wav`;
      anchor.href = url;
      anchor.download = /\.[a-z0-9]{2,5}$/i.test(requestedName)
        ? requestedName
        : `${requestedName}.wav`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("目前無法下載這個音檔，請稍後再試。");
    }
  };

  const save = async () => {
    stopPreview();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const processedAudio = new Map<
        AudioSlot,
        { blob: Blob; duration: number; peaks: number[]; fileName: string }
      >();
      for (const slot of audioSlots) {
        const draft = audioDrafts[slot];
        if (!draft.dirty || !draft.sourceBlob) continue;
        const selectedEnd = draft.trimEnd || draft.duration,
          usesWholeTrack =
            draft.trimStart <= 0.01 &&
            selectedEnd >= Math.max(0, draft.duration - 0.01),
          output = usesWholeTrack
            ? draft.sourceBlob
            : await trimToWav(
                draft.sourceBlob,
                draft.trimStart,
                selectedEnd,
              ),
          analysis = await analyzeAudio(output),
          baseName = draft.sourceName.replace(/\.[^.]+$/, ""),
          fileName = usesWholeTrack
            ? draft.sourceName || `${slot}.audio`
            : `${baseName}-trimmed.wav`;
        await uploadAudioTrack(slot, output, fileName);
        processedAudio.set(slot, {
          blob: output,
          duration: analysis.duration,
          peaks: analysis.peaks,
          fileName,
        });
      }
      const response = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });
      const result = (await response.json()) as {
        content?: SiteContentConfig;
        error?: string;
      };
      if (!response.ok || !result.content)
        throw new Error(result.error || "內容儲存失敗");
      setContent(result.content);
      setAudioDrafts((drafts) =>
        Object.fromEntries(
          audioSlots.map((slot) => {
            const processed = processedAudio.get(slot);
            if (!processed)
              return [
                slot,
                {
                  ...drafts[slot],
                  file: null,
                  sourceUrl: sourceForTrack(result.content!, slot),
                  sourceName: result.content!.audio[slot].fileName,
                  dirty: false,
                  loading: false,
                },
              ];
            return [
              slot,
              {
                file: null,
                sourceBlob: processed.blob,
                sourceUrl: sourceForTrack(result.content!, slot),
                sourceName: processed.fileName,
                duration: processed.duration,
                trimStart: 0,
                trimEnd: processed.duration,
                peaks: processed.peaks,
                dirty: false,
                loading: false,
              },
            ];
          }),
        ) as Record<AudioSlot, AudioDraft>,
      );
      setNotice("內容已儲存並發布。公開場景重新整理後即會載入最新內容。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p>MEDIFY CONTENT STUDIO</p>
          <h1>3D 醫院內容後台</h1>
          <span>QR Code、角色文字與場景聲音可直接更新，不需重新部署。</span>
        </div>
        <div className="admin-account">
          <b>{displayName}</b>
          <small>{email}</small>
          <a href={signOutPath}>登出</a>
        </div>
      </header>

      <section className="admin-summary">
        <div><b>{content.qrCodes.length}</b><span>場景 QR Code</span></div>
        <div><b>{configuredQrCount}</b><span>已設定目的地</span></div>
        <div><b>33</b><span>角色文字項目</span></div>
        <div><b>{audioSlots.length}</b><span>獨立音軌</span></div>
      </section>

      <nav className="admin-tabs" aria-label="內容類型">
        <button className={activeSection === "qr" ? "active" : ""} onClick={() => setActiveSection("qr")}>QR Code</button>
        <button className={activeSection === "dialogues" ? "active" : ""} onClick={() => setActiveSection("dialogues")}>角色台詞</button>
        <button className={activeSection === "statuses" ? "active" : ""} onClick={() => setActiveSection("statuses")}>病患狀態</button>
        <button className={activeSection === "audio" ? "active" : ""} onClick={() => setActiveSection("audio")}>場景聲音</button>
        <button className={activeSection === "rules" ? "active" : ""} onClick={() => setActiveSection("rules")}>角色規則</button>
      </nav>

      <section className="admin-panel">
        {activeSection === "qr" && (
          <div>
            <div className="admin-section-title"><div><p>永久 QR CODE</p><h2>每一個位置都有獨立連結</h2></div><span>修改目的網址後，已印出的 QR Code 仍可繼續使用。</span></div>
            <div className="qr-admin-grid">
              {content.qrCodes.map((entry) => (
                <article className="qr-admin-card" key={entry.id}>
                  <div><small>{entry.location}</small><h3>{entry.name}</h3></div>
                  <label>目的網址<input type="url" placeholder="https://…" value={entry.destinationUrl} onChange={(event) => setContent((current) => ({ ...current, qrCodes: current.qrCodes.map((qr) => qr.id === entry.id ? { ...qr, destinationUrl: event.target.value } : qr) }))}/></label>
                  <p>永久網址：<code>{origin ? `${origin}/qr/${entry.id}` : `/qr/${entry.id}`}</code></p>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeSection === "dialogues" && (
          <div>
            <div className="admin-section-title"><div><p>CHARACTER DIALOGUE</p><h2>角色點擊台詞</h2></div><span>點擊角色時顯示於右下方對話視窗。</span></div>
            <div className="text-admin-grid">
              {(Object.keys(dialogueLabels) as Array<keyof SiteContentConfig["dialogues"]>).map((key) => (
                <label key={key}><b>{dialogueLabels[key]}</b><textarea rows={4} value={content.dialogues[key]} onChange={(event) => setContent((current) => ({ ...current, dialogues: { ...current.dialogues, [key]: event.target.value } }))}/></label>
              ))}
            </div>
          </div>
        )}

        {activeSection === "statuses" && (
          <div>
            <div className="admin-section-title"><div><p>PATIENT STATUS</p><h2>病患流程狀態與感想</h2></div><span>點擊病患後，會依目前任務顯示對應文字。</span></div>
            <h3 className="admin-subtitle">主要狀態</h3>
            <div className="status-admin-grid">
              {(Object.keys(statusLabels) as Array<keyof SiteContentConfig["patientStatuses"]>).map((key) => (
                <label key={key}><b>{statusLabels[key]}</b><input value={content.patientStatuses[key]} onChange={(event) => setContent((current) => ({ ...current, patientStatuses: { ...current.patientStatuses, [key]: event.target.value } }))}/></label>
              ))}
            </div>
            <h3 className="admin-subtitle">病患閱讀感想</h3>
            <div className="text-admin-grid compact">
              {(Object.keys(detailLabels) as Array<keyof SiteContentConfig["patientDetails"]>).map((key) => (
                <label key={key}><b>{detailLabels[key]}</b><textarea rows={3} value={content.patientDetails[key]} onChange={(event) => setContent((current) => ({ ...current, patientDetails: { ...current.patientDetails, [key]: event.target.value } }))}/></label>
              ))}
            </div>
          </div>
        )}

        {activeSection === "audio" && (
          <div>
            <div className="admin-section-title"><div><p>AUDIO MIXER</p><h2>上傳、音軌剪輯與混音試聽</h2></div><span>拖曳音軌上的「頭／尾」控制點即可選取範圍；儲存時會輸出剪輯後 WAV。</span></div>
            <div className="audio-mix-toolbar">
              <button onClick={() => playMix(1)}>▶ 一樓音樂＋環境音</button>
              <button onClick={() => playSlot("chime", true)}>＋ 一樓叫號音</button>
              <button onClick={() => playMix(2)}>▶ 二樓音樂＋環境音</button>
              <button onClick={() => playSlot("floor2Chime", true)}>＋ 二樓叫號音</button>
              <button className="muted" onClick={stopPreview}>■ 停止試聽</button>
            </div>
            {audioFloorGroups.map((group) => (
              <section className="audio-floor-section" key={group.floor}>
                <div className="audio-floor-heading"><span>{group.floor}F</span><div><h3>{group.title}</h3><p>背景音樂、環境音與叫號提示音皆獨立儲存及播放。</p></div></div>
                <div className="audio-admin-grid">
                  {group.slots.map((slot) => {
                    const track = content.audio[slot];
                    const draft = audioDrafts[slot];
                    return (
                      <article className="audio-card" key={slot}>
                        <header><div><small>{slot.toUpperCase()}</small><h3>{track.name}</h3></div><span>{track.hasCustomAudio ? "已上傳" : "目前預設"}</span></header>
                        <p className="audio-file-name">{draft.sourceName || track.fileName}</p>
                        <label className="audio-upload">選擇新音檔<input type="file" accept="audio/*" onChange={(event) => void selectAudioFile(slot, event.target.files?.[0] ?? null)}/></label>
                        <div className="audio-file-actions"><button className="audio-load" onClick={() => void loadExistingAudio(slot)}>↻ 重新載入音軌</button><button className="audio-download" onClick={() => void downloadSlot(slot)}>↓ 下載音檔</button></div>
                        <div className="audio-volume"><label><b>音量</b><span>{Math.round(track.volume * 100)}%</span></label><input type="range" min="0" max="1" step="0.01" value={track.volume} onChange={(event) => setContent((current) => ({ ...current, audio: { ...current.audio, [slot]: { ...current.audio[slot], volume: Number(event.target.value) } } }))}/></div>
                        <WaveformEditor draft={draft} onStartChange={(value) => setTrimPoint(slot, "start", value)} onEndChange={(value) => setTrimPoint(slot, "end", value)}/>
                        {draft.duration > 0 && <div className="audio-trim"><div><b>已選取範圍</b><span>{formatTime(draft.trimStart)} — {formatTime(draft.trimEnd)}（{formatTime(draft.trimEnd - draft.trimStart)}）</span></div><label>精準起點（秒）<input type="number" min="0" max={draft.trimEnd} step="0.1" value={draft.trimStart.toFixed(1)} onChange={(event) => setTrimPoint(slot, "start", Number(event.target.value))}/></label><label>精準終點（秒）<input type="number" min={draft.trimStart} max={draft.duration} step="0.1" value={draft.trimEnd.toFixed(1)} onChange={(event) => setTrimPoint(slot, "end", Number(event.target.value))}/></label></div>}
                        <button className="audio-preview" onClick={() => playSlot(slot)}>▶ 單獨試聽</button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {activeSection === "rules" && (
          <div>
            <div className="admin-section-title"><div><p>CHARACTER RULEBOOK</p><h2>角色規則細節</h2></div><span>此處彙整目前場景已確認的角色行為、流程與限制，供檢查規則是否正確落實。</span></div>
            {roleRuleSections.map((section) => {
              const groups = roleRuleGroups.filter((group) => group.floor === section.floor);
              return (
                <section className="role-rule-section" key={section.floor}>
                  <div className="role-rule-heading">
                    <div><small>{section.eyebrow}</small><h3>{section.title}</h3></div>
                    <p>{section.description}</p>
                  </div>
                  <div className="role-rule-grid">
                    {groups.map((group) => (
                      <article className="role-rule-card" key={group.role}>
                        <header><div><small>{group.meta}</small><h3>{group.role}</h3></div><span>{group.rules.length} 項</span></header>
                        <p>{group.summary}</p>
                        <ol>
                          {group.rules.map((rule) => <li key={rule}>{rule}</li>)}
                        </ol>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>

      <footer className="admin-savebar">
        <div>{error ? <span className="admin-error">{error}</span> : notice ? <span className="admin-success">{notice}</span> : <span>最後更新：{content.updatedAt ? new Date(content.updatedAt).toLocaleString("zh-TW") : "尚未從後台更新"}</span>}</div>
        <a href="/" target="_blank" rel="noreferrer">開啟公開場景</a>
        <button disabled={saving} onClick={() => void save()}>{saving ? "正在處理與發布…" : "儲存並發布"}</button>
      </footer>
    </main>
  );
}
