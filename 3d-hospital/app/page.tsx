"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AmbientSound from "./AmbientSound";
import type { CameraView, CharacterInteraction } from "./HospitalScene";
import { cloneDefaultContent, type SiteContentConfig } from "./content-config";

const HospitalScene = dynamic(() => import("./HospitalScene"), { ssr: false });

type Role = "doctor" | "nurse" | "patient" | "assistant";
type Floor = 1 | 2 | 3;
type DialogContent = CharacterInteraction & { role: Role };
type ViewOption = { key: CameraView; label: string; description: string };

const floorOneViews: ViewOption[] = [
  { key: "panorama", label: "全景", description: "瀏覽整個醫院" },
  { key: "clinics", label: "診間", description: "同時瀏覽 3、4、5 號診間" },
  { key: "reception", label: "櫃檯", description: "前往服務櫃檯視角" },
  { key: "pharmacy", label: "藥局", description: "前往藥局視角" },
];

const floorTwoViews: ViewOption[] = [
  { key: "panorama", label: "全景", description: "瀏覽二樓手術與檢查中心" },
  { key: "operating", label: "手術室", description: "聚焦瀏覽手術室 1" },
  { key: "exam", label: "檢查室", description: "前往二樓檢查室視角" },
  { key: "waiting", label: "候診區", description: "前往二樓候診資訊區" },
];

const floorThreeViews: ViewOption[] = [
  { key: "panorama", label: "全景", description: "瀏覽三樓住院病房" },
  { key: "ward1", label: "病房 1", description: "聚焦瀏覽三樓病房 1" },
  { key: "ward2", label: "病房 2", description: "聚焦瀏覽三樓病房 2" },
  { key: "ward3", label: "病房 3", description: "聚焦瀏覽三樓病房 3" },
  { key: "nurseStation", label: "護理站", description: "前往三樓護理師工作站" },
  { key: "courtyard", label: "中庭", description: "前往三樓日照植栽中庭" },
];

export default function Home() {
  const [sceneReady, setSceneReady] = useState(false);
  const [dialog, setDialog] = useState<DialogContent | null>(null);
  const [toast, setToast] = useState("");
  const [patientCount, setPatientCount] = useState(0);
  const [cameraView, setCameraView] = useState<CameraView>("panorama");
  const [cameraViewRequest, setCameraViewRequest] = useState(0);
  const [patientFocusClearRequest, setPatientFocusClearRequest] = useState(0);
  const [activeFloor, setActiveFloor] = useState<Floor>(1);
  const [elevatorPanelOpen, setElevatorPanelOpen] = useState(false);
  const [elevatorPanelClosing, setElevatorPanelClosing] = useState(false);
  const [elevatorOpen, setElevatorOpen] = useState(false);
  const [elevatorTraveling, setElevatorTraveling] = useState(false);
  const [elevatorDisplayArrived, setElevatorDisplayArrived] = useState(false);
  const [elevatorDisplayFloor, setElevatorDisplayFloor] = useState<Floor>(1);
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(null);
  const [floorFade, setFloorFade] = useState(false);
  const [characterSpeedMultiplier, setCharacterSpeedMultiplier] = useState<1 | 2>(1);
  const [content, setContent] = useState<SiteContentConfig>(() =>
    cloneDefaultContent(),
  );
  const contentRef = useRef(content);
  const elevatorTimers = useRef<number[]>([]);
  const elevatorTravelingRef = useRef(elevatorTraveling);
  const logoGestureArmedRef = useRef(false);
  const musicGestureArmedRef = useRef(false);

  const cameraViews = useMemo(
    () =>
      activeFloor === 1
        ? floorOneViews
        : activeFloor === 2
          ? floorTwoViews
          : floorThreeViews,
    [activeFloor],
  );

  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  useEffect(() => {
    elevatorTravelingRef.current = elevatorTraveling;
  }, [elevatorTraveling]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/content", { cache: "no-store" });
        if (!response.ok || !active) return;
        const next = (await response.json()) as SiteContentConfig;
        contentRef.current = next;
        setContent(next);
      } catch {}
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      elevatorTimers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const addElevatorTimer = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    elevatorTimers.current.push(timer);
  }, []);

  const onTalk = useCallback(
    (role: Role, interaction?: CharacterInteraction) => {
      const current = contentRef.current;
      const fallback: Record<Role, CharacterInteraction> = {
        doctor: { title: "診間醫師", line: current.dialogues.doctor },
        nurse: { title: "護理師", line: current.dialogues.lobbyNurse },
        patient: {
          title: "候診病患",
          line: `目前狀態：${current.patientStatuses.fallback}`,
        },
        assistant: {
          title: "眼球小助手",
          line: current.dialogues.eyeAssistant,
        },
      };
      setDialog({ ...(interaction ?? fallback[role]), role });
    },
    [],
  );

  const onPatientFocus = useCallback(
    (interaction: CharacterInteraction | null) =>
      setDialog(interaction ? { ...interaction, role: "patient" } : null),
    [],
  );
  const onKnock = useCallback((room: number) => {
    setToast(`已敲響 ${room} 號診間`);
    window.setTimeout(() => setToast(""), 2200);
  }, []);
  const onPatientCount = useCallback((count: number) => setPatientCount(count), []);
  const onSceneReady = useCallback(() => setSceneReady(true), []);
  const handleLogoGesture = useCallback(() => {
    // The logo is the first step of the deliberate three-click gesture. A
    // second logo click restarts the sequence instead of carrying an earlier
    // music click forward.
    logoGestureArmedRef.current = true;
    musicGestureArmedRef.current = false;
  }, []);
  const handleMusicStateChange = useCallback(
    (enabled: boolean) => {
      if (!logoGestureArmedRef.current) return;
      // Enabling music completes the second step when entering 2× mode. When
      // leaving 2× mode, accept the same music-button click even though it
      // naturally turns the already-enabled music off.
      if (enabled || characterSpeedMultiplier === 2)
        musicGestureArmedRef.current = true;
    },
    [characterSpeedMultiplier],
  );
  const handleHospitalTitleClick = useCallback(() => {
    if (!logoGestureArmedRef.current || !musicGestureArmedRef.current) return;
    setCharacterSpeedMultiplier((current) => (current === 1 ? 2 : 1));
    logoGestureArmedRef.current = false;
    musicGestureArmedRef.current = false;
  }, []);
  const closeDialog = useCallback(() => {
    if (dialog?.role === "patient")
      setPatientFocusClearRequest((request) => request + 1);
    setDialog(null);
  }, [dialog]);

  const openElevator = useCallback(() => {
    if (elevatorTravelingRef.current) return;
    setDialog(null);
    setPatientFocusClearRequest((request) => request + 1);
    setSelectedFloor(null);
    setElevatorDisplayArrived(false);
    setElevatorDisplayFloor(activeFloor);
    setElevatorPanelClosing(false);
    setElevatorOpen(true);
    setElevatorPanelOpen(true);
  }, [activeFloor]);

  const closeElevator = useCallback(() => {
    if (elevatorTraveling) return;
    setElevatorPanelOpen(false);
    setElevatorPanelClosing(false);
    setSelectedFloor(null);
    setElevatorDisplayArrived(false);
    setElevatorDisplayFloor(activeFloor);
    setElevatorOpen(false);
  }, [activeFloor, elevatorTraveling]);

  const chooseFloor = useCallback(
    (floor: Floor) => {
      if (elevatorTraveling) return;
      setSelectedFloor(floor);
      setElevatorDisplayArrived(false);
      setElevatorDisplayFloor(activeFloor);
      setElevatorPanelClosing(false);
      if (floor === activeFloor) {
        addElevatorTimer(() => setSelectedFloor(null), 520);
        return;
      }

      setElevatorTraveling(true);
      setElevatorOpen(false);
      const direction = floor > activeFloor ? 1 : -1,
        floorDistance = Math.abs(floor - activeFloor),
        departureDelay = 1100,
        // Travel to 3F at 1.4× the previous speed while keeping the door-close
        // phase and all intermediate floor indicators intact.
        travelSpeedMultiplier = floor === 3 ? 1.4 : 1,
        perFloorDuration = 1350 / travelSpeedMultiplier,
        arrivalAt = departureDelay + floorDistance * perFloorDuration;
      addElevatorTimer(() => setFloorFade(true), 1350);
      for (let step = 1; step < floorDistance; step++) {
        const passingFloor = (activeFloor + direction * step) as Floor;
        addElevatorTimer(
          () => setElevatorDisplayFloor(passingFloor),
          departureDelay + step * perFloorDuration,
        );
      }
      addElevatorTimer(() => {
        setElevatorDisplayFloor(floor);
        setActiveFloor(floor);
        // Keep the visitor's current viewing direction when the elevator
        // reaches the next floor. HospitalScene lifts the existing camera and
        // target by one storey instead of cutting to an elevator preset.
        setCameraView("panorama");
        setCameraViewRequest((request) => request + 1);
        setPatientFocusClearRequest((request) => request + 1);
        setDialog(null);
        setElevatorDisplayArrived(true);
        setElevatorOpen(true);
      }, arrivalAt);
      addElevatorTimer(() => setFloorFade(false), arrivalAt + 360);
      // Keep the current-floor display present through arrival, then fade the
      // complete elevator interface as one unit instead of hiding its screen
      // before the surrounding panel.
      addElevatorTimer(() => setElevatorPanelClosing(true), arrivalAt + 600);
      addElevatorTimer(() => {
        setElevatorPanelOpen(false);
        setElevatorPanelClosing(false);
        setElevatorTraveling(false);
      }, arrivalAt + 980);
      addElevatorTimer(() => {
        setElevatorOpen(false);
        setSelectedFloor(null);
        setElevatorDisplayArrived(false);
        setElevatorDisplayFloor(floor);
      }, arrivalAt + 1760);
    },
    [activeFloor, addElevatorTimer, elevatorTraveling],
  );

  return (
    <main className={`experience dollhouse floor-${activeFloor}`}>
      <HospitalScene
        content={content}
        onReady={onSceneReady}
        onTalk={onTalk}
        onPatientFocus={onPatientFocus}
        patientFocusClearRequest={patientFocusClearRequest}
        onKnock={onKnock}
        onPatientCount={onPatientCount}
        onElevatorOpen={openElevator}
        activeFloor={activeFloor}
        elevatorOpen={elevatorOpen}
        cameraView={cameraView}
        cameraViewRequest={cameraViewRequest}
        characterSpeedMultiplier={characterSpeedMultiplier}
      />
      <div
        className={`site-loading${sceneReady ? " ready" : ""}`}
        role="status"
        aria-live="polite"
        aria-label={sceneReady ? "Medify 3D Hospital 載入完成" : "Medify 3D Hospital 載入中"}
      >
        <div className="site-loading-content">
          <div className="site-loading-logo-wrap">
            <img src="/logo-v.png" alt="Medify" />
            <span className="site-loading-bird" aria-hidden="true">
              <span className="site-loading-bird-body">
                <i className="site-loading-bird-wing" />
                <i className="site-loading-bird-eye" />
                <i className="site-loading-bird-beak" />
                <i className="site-loading-bird-leg leg-a" />
                <i className="site-loading-bird-leg leg-b" />
              </span>
              <i className="site-loading-note note-a">♪</i>
              <i className="site-loading-note note-b">♫</i>
            </span>
          </div>
          <p>3D HOSPITAL</p>
          <div className="site-loading-track" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
      <header className="topbar">
        <div className="brand">
          <button
            type="button"
            className="brand-logo-button"
            aria-label="啟動人物加速操作"
            onClick={handleLogoGesture}
          >
            <img src="/logo-h.png" alt="Medify" />
          </button>
          {characterSpeedMultiplier === 2 && (
            <span className="speed-indicator" aria-label="人物二倍速">2×</span>
          )}
          <span className="brand-copy">3D HOSPITAL<br /><small>INTERACTIVE CLINIC</small></span>
        </div>
      </header>
      <AmbientSound
        audio={content.audio}
        activeFloor={activeFloor}
        onMusicStateChange={handleMusicStateChange}
      />

      <aside className="scene-intro">
        <p><i />MEDIFY PATIENT EXPERIENCE · {activeFloor}F</p>
        {activeFloor === 1 ? (
          <>
            <h1><button type="button" className="hospital-title-gesture" onClick={handleHospitalTitleClick}>Medify醫院</button><br /><em>互動候診大廳</em></h1>
            <span>對話報到 · 手機掃描 QR Code · 診間互動</span>
          </>
        ) : activeFloor === 2 ? (
          <>
            <h1><button type="button" className="hospital-title-gesture" onClick={handleHospitalTitleClick}>Medify醫院</button><br /><em>手術與檢查中心</em></h1>
            <span>手術室 · 檢查室 · 術前衛教候診區</span>
          </>
        ) : (
          <>
            <h1><button type="button" className="hospital-title-gesture" onClick={handleHospitalTitleClick}>Medify醫院</button><br /><em>住院病房樓層</em></h1>
            <span>住院病房 · 護理師工作站 · 日照植栽中庭</span>
          </>
        )}
      </aside>

      {activeFloor === 1 && (
        <div className="legend">
          <b>場景角色</b>
          <span><i className="doctor-dot" />醫師 × 5</span>
          <span><i className="nurse-dot" />護理師 × 9</span>
          <span><i className="pharmacist-dot" />藥師 × 2</span>
          <span><i className="assistant-dot" />眼球小助手 × 1</span>
          <span><i className="patient-dot" />院內病患 × {patientCount}</span>
        </div>
      )}

      <nav className="camera-switcher" aria-label={`${activeFloor} 樓視角切換`}>
        {cameraViews.map((view) => (
          <button
            key={view.key}
            type="button"
            className={cameraView === view.key ? "active" : ""}
            aria-pressed={cameraView === view.key}
            aria-label={view.description}
            title={view.description}
            onClick={() => {
              setCameraView(view.key);
              setCameraViewRequest((request) => request + 1);
            }}
          ><b>{view.label}</b></button>
        ))}
      </nav>

      {elevatorPanelOpen && (
        <div
          className={`elevator-overlay${elevatorPanelClosing ? " closing" : ""}`}
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeElevator();
          }}
        >
          <section
            className={`elevator-panel${elevatorTraveling ? " traveling" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="選擇樓層"
          >
            <button
              className="elevator-close"
              type="button"
              aria-label="關閉樓層選擇"
              onClick={closeElevator}
              disabled={elevatorTraveling}
            >×</button>
            <div
              className={`elevator-display${elevatorDisplayArrived ? " arrived" : ""}`}
              aria-live="polite"
            >
              {elevatorTraveling ? (
                <>
                  <small>CURRENT FLOOR</small>
                  {!elevatorDisplayArrived && (
                    <span>{selectedFloor !== null && selectedFloor > elevatorDisplayFloor ? "▲" : "▼"}</span>
                  )}
                  <b>{elevatorDisplayFloor}</b>
                </>
              ) : (
                <><small>CURRENT FLOOR</small><b>{activeFloor}</b></>
              )}
            </div>
            <div className="elevator-buttons" aria-label="樓層按鈕">
              {([3, 2, 1] as Floor[]).map((floor) => (
                <button
                  key={floor}
                  type="button"
                  className={selectedFloor === floor ? "selected" : ""}
                  aria-label={`前往 ${floor} 樓`}
                  aria-current={activeFloor === floor ? "true" : undefined}
                  onClick={() => chooseFloor(floor)}
                  disabled={elevatorTraveling}
                >{floor}</button>
              ))}
            </div>
            <p>{elevatorTraveling ? "樓層移動中" : "請選擇樓層"}</p>
          </section>
        </div>
      )}

      <div className={`floor-transition${floorFade ? " active" : ""}`} />
      {toast && <div className="toast">✓ {toast}</div>}
      {dialog && (
        <div className="dialog" role="dialog" aria-label={dialog.title}>
          <button onClick={closeDialog} aria-label="關閉對話">×</button>
          <small>{dialog.eyebrow ?? "MEDIFY CONVERSATION"}</small>
          <h2>{dialog.title}</h2>
          <p>{dialog.line}</p>
          {dialog.detail && <p className="dialog-detail">{dialog.detail}</p>}
          <span>{dialog.role === "patient" ? "點擊其他病患可切換追蹤標記" : "點擊 × 返回探索"}</span>
        </div>
      )}
      <footer>
        <span>{activeFloor}F · COLLISION-SAFE NAVIGATION</span>
        <b>用心溝通，讓醫療更容易理解。</b>
      </footer>
    </main>
  );
}
