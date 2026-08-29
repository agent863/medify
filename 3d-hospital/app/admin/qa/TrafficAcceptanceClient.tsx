"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type {
  CameraView,
  CharacterInteraction,
  CharacterSpeedMultiplier,
} from "../../HospitalScene";
import type { SiteContentConfig } from "../../content-config";
import type {
  ThirdFloorTrafficActorSnapshot,
  ThirdFloorTrafficSnapshot,
} from "../../scene/third-floor-care";

const HospitalScene = dynamic(() => import("../../HospitalScene"), {
  ssr: false,
});

type Props = {
  initialContent: SiteContentConfig;
  displayName: string;
  email: string;
  signOutPath: string;
};

type Verdict = "pending" | "pass" | "fail";

type AcceptanceScenario = {
  id: string;
  title: string;
  priority: "P0" | "P1";
  focus: string;
  checks: string[];
};

const scenarios: AcceptanceScenario[] = [
  {
    id: "T-01",
    title: "護理師／醫療車彈性跟隨",
    priority: "P0",
    focus: "護理師離站後遇到回病房一的病患",
    checks: ["約 2 公尺開始減速", "病患保留原路徑與速度", "距離縮小後平順跟隨"],
  },
  {
    id: "T-02",
    title: "固定靠右與對向通行",
    priority: "P0",
    focus: "病患、護理師與機器人各在不同靠右車道",
    checks: ["路徑不交疊時持續前進", "不在遠處轉角提前停等", "不回到走廊中央"],
  },
  {
    id: "T-03",
    title: "東側門回病房二",
    priority: "P0",
    focus: "病患由中庭東側自動門返回病房二",
    checks: ["沿外側／右側線前進", "不斜切病房門", "自動門與病房門口不抖動"],
  },
  {
    id: "T-04",
    title: "機器人護理站出口等候",
    priority: "P0",
    focus: "機器人離開護理站時遇指定巡房護理師或醫療車",
    checks: ["約 2 公尺內才等待", "只綁定實際衝突角色", "對方離開後恢復"],
  },
  {
    id: "T-05",
    title: "機器人安全點恢復",
    priority: "P0",
    focus: "機器人在走廊遇病患、點滴架、護理師或醫療車",
    checks: ["先退到安全點", "距離超過約 2 公尺可恢復", "仍阻擋時 2 秒後恢復角色通行"],
  },
  {
    id: "T-06",
    title: "病患門側禮讓後進出",
    priority: "P0",
    focus: "病患在門側完成停等，輪式設備需要穿門",
    checks: ["護理師、醫療車、機器人可進出", "忽略病患與點滴架角色碰撞", "固定牆面仍不可穿越"],
  },
  {
    id: "T-07",
    title: "連續病患出房隊列",
    priority: "P0",
    focus: "護理師門側等待時，兩名或三名病患連續出房",
    checks: ["前位病患先讓位", "後位病患接替門側點", "護理師保留進房空間"],
  },
  {
    id: "T-08",
    title: "護理師離房不穿牆",
    priority: "P0",
    focus: "護理師在病房內準備離開，房內已有病患",
    checks: ["沿原病房門中心線離房", "不切往另一間病房", "不在房內原地打轉"],
  },
  {
    id: "T-09",
    title: "病患 1.2 秒無位移恢復",
    priority: "P0",
    focus: "病患曾因護理師或機器人離開而停在病房外",
    checks: ["連續 1.2 秒無位移後恢復", "保留原本回床任務", "不改走錯誤病房或穿牆"],
  },
  {
    id: "T-10",
    title: "跟隨腳步與速度",
    priority: "P1",
    focus: "護理師跟隨、暫停與重新起步",
    checks: ["腳步相位跟隨實際位移", "停步時腿部穩定", "起步不突然跳動"],
  },
  {
    id: "T-11",
    title: "機器人取得病房通行",
    priority: "P0",
    focus: "病患已在門側讓機器人進房",
    checks: ["病患持續停在安全點", "機器人實際進門", "不在門外反覆打轉"],
  },
  {
    id: "T-12",
    title: "多角色壓力情境",
    priority: "P0",
    focus: "同時出現多名病患、護理師、醫療車與機器人",
    checks: ["等待綁定實際衝突對象", "遠處角色照原任務前進", "不產生全域連鎖停等"],
  },
];

const cameraViews: Array<{ key: CameraView; label: string }> = [
  { key: "panorama", label: "全景" },
  { key: "courtyard", label: "中庭" },
  { key: "nurseStation", label: "護理站" },
  { key: "ward1", label: "病房 1" },
  { key: "ward2", label: "病房 2" },
  { key: "ward3", label: "病房 3" },
];

const speedOptions: Array<{ value: CharacterSpeedMultiplier; label: string }> = [
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
  { value: 3, label: "3×" },
  { value: 4, label: "4×" },
];

const stateLabels: Record<string, string> = {
  bedRest: "床上休息",
  bedEat: "床上用餐",
  waitingMedication: "等待給藥",
  medicationSittingUp: "坐起服藥",
  takingMedication: "服藥中",
  medicationSettling: "躺回病床",
  rising: "起身中",
  walking: "行走中",
  parkingIv: "停放點滴架",
  settling: "躺回定位",
  courtyardSit: "中庭休息",
  socialTalk: "交談中",
  waitingCheck: "等待檢查",
  beingChecked: "接受檢查",
  station: "護理站工作",
  outbound: "前往病房",
  checking: "病房檢查",
  waitingNext: "等待下一位",
  returning: "返回護理站",
  home: "護理站待機",
  serving: "床邊給藥",
};

const formatNumber = (value: number) => value.toFixed(2);

function actorTone(actor: ThirdFloorTrafficActorSnapshot) {
  if (actor.noMovementTime >= 1) return "warning";
  if (actor.reason) return "waiting";
  if (actor.moving) return "moving";
  return "idle";
}

function ActorCard({ actor }: { actor: ThirdFloorTrafficActorSnapshot }) {
  const tone = actorTone(actor);
  return (
    <article className={`traffic-actor-card ${tone}`}>
      <header>
        <div>
          <small>{actor.role.toUpperCase()}</small>
          <h3>{actor.label}</h3>
        </div>
        <span className={`traffic-live-dot ${tone}`} aria-label={tone} />
      </header>
      <p className="traffic-actor-status">{actor.status}</p>
      <dl>
        <div>
          <dt>狀態</dt>
          <dd>{stateLabels[actor.state] ?? actor.state}</dd>
        </div>
        <div>
          <dt>位置</dt>
          <dd>
            {formatNumber(actor.position.x)}, {formatNumber(actor.position.z)}
          </dd>
        </div>
        <div>
          <dt>路點</dt>
          <dd>
            {actor.waypoint + 1} / {actor.routeLength}
          </dd>
        </div>
        <div>
          <dt>無位移</dt>
          <dd>{formatNumber(actor.noMovementTime)} 秒</dd>
        </div>
      </dl>
      <div className="traffic-actor-meta">
        <span>{actor.reason ?? (actor.moving ? "持續前進" : "目前無等待")}</span>
        {actor.following && <span>跟隨：{actor.following}</span>}
        {actor.target && <span>目標：{actor.target}</span>}
      </div>
      {actor.role === "nurse" && actor.cartPosition && (
        <small className="traffic-cart-position">
          醫療車：{formatNumber(actor.cartPosition.x)}, {formatNumber(actor.cartPosition.z)}
        </small>
      )}
    </article>
  );
}

export default function TrafficAcceptanceClient({
  initialContent,
  displayName,
  email,
  signOutPath,
}: Props) {
  const [sceneKey, setSceneKey] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [snapshot, setSnapshot] = useState<ThirdFloorTrafficSnapshot | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState("T-01");
  const [cameraView, setCameraView] = useState<CameraView>("panorama");
  const [cameraViewRequest, setCameraViewRequest] = useState(0);
  const [characterSpeedMultiplier, setCharacterSpeedMultiplier] =
    useState<CharacterSpeedMultiplier>(1);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(() =>
    Object.fromEntries(scenarios.map((scenario) => [scenario.id, "pending"])),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});

  const selectedScenario =
    scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0];
  const allActors = useMemo(
    () =>
      snapshot
        ? [...snapshot.patients, ...snapshot.nurses, snapshot.robot]
        : [],
    [snapshot],
  );
  const waitingCount = allActors.filter((actor) => actor.reason).length;
  const warningCount = allActors.filter((actor) => actor.noMovementTime >= 1).length;
  const passedCount = Object.values(verdicts).filter((value) => value === "pass").length;
  const failedCount = Object.values(verdicts).filter((value) => value === "fail").length;

  const onTrafficSnapshot = useCallback(
    (nextSnapshot: ThirdFloorTrafficSnapshot) => setSnapshot(nextSnapshot),
    [],
  );
  const onSceneReady = useCallback(() => setSceneReady(true), []);
  const resetScene = useCallback(() => {
    setSceneReady(false);
    setSnapshot(null);
    setSceneKey((key) => key + 1);
  }, []);
  const selectCameraView = useCallback((view: CameraView) => {
    setCameraView(view);
    setCameraViewRequest((request) => request + 1);
  }, []);
  const setVerdict = useCallback((scenarioId: string, verdict: Verdict) => {
    setVerdicts((current) => ({ ...current, [scenarioId]: verdict }));
  }, []);

  const noOpTalk = useCallback(
    (
      role: "doctor" | "nurse" | "patient" | "assistant",
      interaction?: CharacterInteraction,
    ) => {
      void role;
      void interaction;
    },
    [],
  );
  const noOpPatientFocus = useCallback((interaction: CharacterInteraction | null) => {
    void interaction;
  }, []);
  const noOpKnock = useCallback((room: number) => {
    void room;
  }, []);
  const noOpPatientCount = useCallback((count: number) => {
    void count;
  }, []);
  const noOpElevator = useCallback(() => {}, []);

  return (
    <main className="traffic-qa-shell">
      <header className="traffic-qa-header">
        <div>
          <p>MEDIFY 3D HOSPITAL · INTERNAL QA</p>
          <h1>三樓交通驗收</h1>
          <span>以 v345 為基準，觀察三樓病患、護理師、醫療車與給藥機器人的實際狀態。</span>
        </div>
        <div className="traffic-qa-account">
          <b>{displayName}</b>
          <small>{email}</small>
          <div>
            <Link href="/admin">返回內容後台</Link>
            <Link href="/">開啟公開場景</Link>
            <a href={signOutPath}>登出</a>
          </div>
        </div>
      </header>

      <section className="traffic-qa-summary" aria-label="驗收摘要">
        <div>
          <b>{sceneReady ? "LIVE" : "…"}</b>
          <span>三樓場景</span>
        </div>
        <div>
          <b>{snapshot?.patients.length ?? "—"}</b>
          <span>監測病患</span>
        </div>
        <div>
          <b>{waitingCount || "—"}</b>
          <span>目前有原因狀態</span>
        </div>
        <div>
          <b className={warningCount ? "traffic-number-warning" : ""}>{warningCount || "—"}</b>
          <span>接近 1.2 秒無位移</span>
        </div>
        <div>
          <b>{passedCount} / {scenarios.length}</b>
          <span>已標記通過</span>
        </div>
      </section>

      <section className="traffic-qa-workspace">
        <div className="traffic-qa-scene-card">
          <header className="traffic-qa-section-heading">
            <div>
              <p>LIVE SCENE</p>
              <h2>三樓即時場景</h2>
            </div>
            <span>{snapshot ? `已觀測 ${snapshot.elapsed.toFixed(1)} 秒` : "正在建立狀態觀測…"}</span>
          </header>
          <div className="traffic-qa-scene">
            <HospitalScene
              key={sceneKey}
              content={initialContent}
              onReady={onSceneReady}
              onTalk={noOpTalk}
              onPatientFocus={noOpPatientFocus}
              patientFocusClearRequest={0}
              onKnock={noOpKnock}
              onPatientCount={noOpPatientCount}
              onElevatorOpen={noOpElevator}
              onThirdFloorTrafficSnapshot={onTrafficSnapshot}
              activeFloor={3}
              elevatorOpen={false}
              cameraView={cameraView}
              cameraViewRequest={cameraViewRequest}
              characterSpeedMultiplier={characterSpeedMultiplier}
            />
            {!sceneReady && <div className="traffic-qa-scene-loading">正在載入三樓驗收場景</div>}
          </div>
          <div className="traffic-qa-viewbar">
            <div className="traffic-qa-view-controls">
              <div className="traffic-camera-buttons">
                {cameraViews.map((view) => (
                  <button
                    className={cameraView === view.key ? "active" : ""}
                    key={view.key}
                    onClick={() => selectCameraView(view.key)}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              <div className="traffic-speed-buttons" aria-label="驗收場景速度">
                <span>速度</span>
                {speedOptions.map((option) => (
                  <button
                    className={characterSpeedMultiplier === option.value ? "active" : ""}
                    key={option.value}
                    aria-label={`場景${option.label}速`}
                    aria-pressed={characterSpeedMultiplier === option.value}
                    onClick={() => setCharacterSpeedMultiplier(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="traffic-secondary-button" onClick={resetScene}>↻ 重設三樓場景</button>
          </div>
        </div>

        <aside className="traffic-qa-scenario-panel">
          <header className="traffic-qa-section-heading">
            <div>
              <p>ACCEPTANCE MATRIX</p>
              <h2>情境清單</h2>
            </div>
            <span>{failedCount ? `${failedCount} 項未通過` : "尚未完成標記"}</span>
          </header>
          <div className="traffic-scenario-list">
            {scenarios.map((scenario) => (
              <button
                className={`traffic-scenario-row ${selectedScenario.id === scenario.id ? "active" : ""}`}
                key={scenario.id}
                onClick={() => setSelectedScenarioId(scenario.id)}
              >
                <span className="traffic-scenario-id">{scenario.id}</span>
                <span className="traffic-scenario-copy">
                  <b>{scenario.title}</b>
                  <small>{scenario.focus}</small>
                </span>
                <span className={`traffic-verdict-dot ${verdicts[scenario.id]}`}>
                  {verdicts[scenario.id] === "pass" ? "✓" : verdicts[scenario.id] === "fail" ? "!" : "·"}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="traffic-qa-detail-grid">
        <article className="traffic-qa-detail-card">
          <header className="traffic-qa-section-heading">
            <div>
              <p>{selectedScenario.priority} · {selectedScenario.id}</p>
              <h2>{selectedScenario.title}</h2>
            </div>
            <span>目前狀態：{verdicts[selectedScenario.id] === "pending" ? "待回放" : verdicts[selectedScenario.id] === "pass" ? "通過" : "未通過"}</span>
          </header>
          <p className="traffic-qa-focus">觀察重點：{selectedScenario.focus}</p>
          <ul className="traffic-check-list">
            {selectedScenario.checks.map((check) => <li key={check}>{check}</li>)}
          </ul>
          <div className="traffic-verdict-actions">
            <button className={verdicts[selectedScenario.id] === "pass" ? "active pass" : "pass"} onClick={() => setVerdict(selectedScenario.id, "pass")}>✓ 標記通過</button>
            <button className={verdicts[selectedScenario.id] === "fail" ? "active fail" : "fail"} onClick={() => setVerdict(selectedScenario.id, "fail")}>! 標記未通過</button>
            <button className={verdicts[selectedScenario.id] === "pending" ? "active pending" : "pending"} onClick={() => setVerdict(selectedScenario.id, "pending")}>清除標記</button>
          </div>
          <label className="traffic-note-field">
            驗收備註
            <textarea
              rows={3}
              placeholder="記錄卡住角色、等待原因、發生位置或重現步驟…"
              value={notes[selectedScenario.id] ?? ""}
              onChange={(event) => setNotes((current) => ({ ...current, [selectedScenario.id]: event.target.value }))}
            />
          </label>
        </article>

        <article className="traffic-qa-detail-card traffic-observation-card">
          <header className="traffic-qa-section-heading">
            <div>
              <p>RUNTIME OBSERVATION</p>
              <h2>即時角色狀態</h2>
            </div>
            <span>每 0.25 秒更新</span>
          </header>
          <p className="traffic-qa-explanation">這些資料直接來自目前三樓交通邏輯；等待原因與無位移時間可協助定位問題，穿牆、融合與抖動仍需配合場景畫面確認。</p>
          <div className="traffic-actor-grid">
            {snapshot ? (
              <>
                {snapshot.nurses.map((actor) => <ActorCard actor={actor} key={actor.id} />)}
                <ActorCard actor={snapshot.robot} />
                {snapshot.patients.map((actor) => <ActorCard actor={actor} key={actor.id} />)}
              </>
            ) : (
              <div className="traffic-empty-state">場景啟動後會在此顯示角色狀態。</div>
            )}
          </div>
        </article>
      </section>

      <footer className="traffic-qa-footer">
        <span>本頁為內部驗收工具，不加入公開網站導覽；所有標記目前只保留在本次瀏覽工作階段。</span>
        <span>公開基準：v345 · 矩陣：THIRD_FLOOR_TRAFFIC_ACCEPTANCE.md</span>
      </footer>
    </main>
  );
}
