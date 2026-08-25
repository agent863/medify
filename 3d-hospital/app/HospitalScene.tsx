"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import QRCode from "qrcode";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { QrId, SiteContentConfig } from "./content-config";
import { createThirdFloorCare } from "./scene/third-floor-care";
import {
  createThirdFloorCourtyardLife,
  type BirdActor,
  type ButterflyActor,
} from "./scene/third-floor-courtyard-life";

type Role = "doctor" | "nurse" | "patient" | "assistant";
type Gender = "male" | "female";
export type CameraView =
  | "panorama"
  | "clinics"
  | "reception"
  | "pharmacy"
  | "operating"
  | "exam"
  | "waiting"
  | "ward1"
  | "ward2"
  | "ward3"
  | "nurseStation"
  | "courtyard"
  | "elevator";
export type CharacterInteraction = {
  title: string;
  line: string;
  detail?: string;
  eyebrow?: string;
};
type Props = {
  content: SiteContentConfig;
  onReady: () => void;
  onTalk: (role: Role, interaction?: CharacterInteraction) => void;
  onPatientFocus: (interaction: CharacterInteraction | null) => void;
  patientFocusClearRequest: number;
  onKnock: (room: number) => void;
  onPatientCount: (count: number) => void;
  onElevatorOpen: () => void;
  activeFloor: 1 | 2 | 3;
  elevatorOpen: boolean;
  cameraView: CameraView;
  cameraViewRequest: number;
};
type CameraTransition = {
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  startedAt: number;
  duration: number;
};
type Obstacle = {
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
  seatId?: number;
  cx?: number;
  cz?: number;
  ux?: number;
  uz?: number;
  vx?: number;
  vz?: number;
  halfU?: number;
  halfV?: number;
  wingWall?: boolean;
};
type Walker = {
  group: THREE.Group;
  legs: THREE.Mesh[];
  arms: THREE.Mesh[];
  hands: THREE.Mesh[];
  phone?: THREE.Mesh;
  medicineBag?: THREE.Group;
  scanBadge?: THREE.Sprite;
  chart?: THREE.Mesh;
  headRig: THREE.Group;
  route: THREE.Vector3[];
  waypoint: number;
  speed: number;
  role: Role;
  gender: Gender;
  pause: number;
  stuck: number;
  action:
    | "walk"
    | "counterTalk"
    | "counterScan"
    | "doorScan"
    | "lobbyScan"
    | "clinicScan"
    | "sit"
    | "readChart"
    | "clinicSit"
    | "clinicNurseSit"
    | "clinicNurseRise"
    | "clinicNurseSeatEntry"
    | "clinicNurseDoor"
    | "clinicNurseExamStand"
    | "clinicNurseTidy"
    | "clinicChairSit"
    | "consultSit"
    | "postExamTalk"
    | "postScanTalk"
    | "bedSit"
    | "examBed"
    | "bedExit"
    | "examCare"
    | "kioskPayment"
    | "medicinePickup"
    | "socialTalk"
    | "wave";
  actionTime: number;
  lastDoor: number;
  room?: number;
  seatId?: number;
  seatPoint?: THREE.Vector3;
  seatYaw?: number;
  sitCooldown: number;
  readCooldown: number;
};
type PatientMonitor = {
  visitId: number;
  patientNo: string;
  flowStep: number;
  stateKey: string;
  stateAge: number;
  lastPosition: THREE.Vector3;
  noProgressTime: number;
  invalidPositionTime: number;
  seatExitTime: number;
  clinicTransitTime: number;
  calledTaskTime: number;
  calledTaskNoProgressTime: number;
  calledTaskLastPosition: THREE.Vector3;
  lastCalledTaskRecoveryAt: number;
  recoveries: number;
  lastRecoveryAt: number;
  lastHealthyAt: number;
};
type Door = {
  pivot: THREE.Group;
  base: number;
  closedPosition: THREE.Vector3;
  openPosition: THREE.Vector3;
  room: number;
  auto: boolean;
  knockBadge: THREE.Sprite;
  knockTime: number;
};
const BLUE = 0x4d83bc,
  CYAN = 0x45c2c7,
  CREAM = 0xf5f1e9;
const material = (color: number, r = 0.82) =>
  new THREE.MeshStandardMaterial({ color, roughness: r, metalness: 0.025 });
function box(w: number, h: number, d: number, color: number, r = 0.82) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color, r));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(r: number, h: number, color: number, seg = 20) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, seg),
    material(color),
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function put(
  parent: THREE.Group | THREE.Scene,
  obj: THREE.Object3D,
  x: number,
  y: number,
  z: number,
) {
  obj.position.set(x, y, z);
  parent.add(obj);
  return obj;
}
function roundedTopGeometry(w: number, h: number, d: number, r: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(-w / 2, h - r);
  shape.quadraticCurveTo(-w / 2, h, -w / 2 + r, h);
  shape.lineTo(w / 2 - r, h);
  shape.quadraticCurveTo(w / 2, h, w / 2, h - r);
  shape.lineTo(w / 2, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: true,
    bevelSize: 0.04,
    bevelThickness: 0.04,
    bevelSegments: 4,
  });
  geo.translate(0, 0, -d / 2);
  return geo;
}
function roundedPanelGeometry(w: number, h: number, d: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, 0);
  s.lineTo(w / 2 - r, 0);
  s.quadraticCurveTo(w / 2, 0, w / 2, r);
  s.lineTo(w / 2, h - r);
  s.quadraticCurveTo(w / 2, h, w / 2 - r, h);
  s.lineTo(-w / 2 + r, h);
  s.quadraticCurveTo(-w / 2, h, -w / 2, h - r);
  s.lineTo(-w / 2, r);
  s.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: d,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    bevelSegments: 4,
  });
  geo.translate(0, 0, -d / 2);
  return geo;
}
function leafGeometry(w: number, h: number, d = 0.055) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(w * 0.7, h * 0.24, w * 0.55, h * 0.76, 0, h);
  s.bezierCurveTo(-w * 0.55, h * 0.76, -w * 0.7, h * 0.24, 0, 0);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: d,
    bevelEnabled: true,
    bevelSize: 0.018,
    bevelThickness: 0.015,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -d / 2);
  return geo;
}
function canvasTexture(main: string, sub = "") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff";
  x.fillRect(16, 16, 480, 224);
  x.strokeStyle = "#dce8e6";
  x.lineWidth = 8;
  x.strokeRect(16, 16, 480, 224);
  x.textAlign = "center";
  x.fillStyle = "#4d83bc";
  x.font = "700 112px Arial";
  x.fillText(main, 256, 146);
  if (sub) {
    x.fillStyle = "#365c70";
    x.font = "600 24px Arial";
    x.fillText(sub, 256, 202);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function elevatorFloorNumberTexture(label: string, active = false) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, 256, 256);
  x.fillStyle = active ? "#355d72" : "#496b7d";
  x.font = "800 150px Arial, sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(label, 128, 137);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function elevatorButtonTexture(label: "▲" | "▼") {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, 256, 256);
  x.fillStyle = "#73a9c4";
  x.beginPath();
  x.arc(128, 128, 104, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = "#4f83a3";
  x.lineWidth = 12;
  x.stroke();
  x.fillStyle = "#ffffff";
  x.font = "900 105px Arial, sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(label, 128, label === "▲" ? 138 : 125);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function paymentScreenTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 720;
  const x = c.getContext("2d")!;
  const gradient = x.createLinearGradient(0, 0, 0, c.height);
  gradient.addColorStop(0, "#58c5cf");
  gradient.addColorStop(1, "#4d83bc");
  x.fillStyle = gradient;
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "rgba(255,255,255,.2)";
  x.beginPath();
  x.arc(256, 180, 102, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = "#ffffff";
  x.lineWidth = 18;
  x.beginPath();
  x.arc(256, 180, 70, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.moveTo(256, 132);
  x.lineTo(256, 192);
  x.lineTo(302, 218);
  x.stroke();
  x.fillStyle = "#ffffff";
  x.textAlign = "center";
  x.font = "800 64px Arial, sans-serif";
  x.fillText("自助繳費", 256, 385);
  x.font = "600 31px Arial, sans-serif";
  x.fillText("SELF PAYMENT", 256, 438);
  x.fillStyle = "rgba(255,255,255,.86)";
  x.roundRect(76, 500, 360, 96, 30);
  x.fill();
  x.fillStyle = "#365c70";
  x.font = "700 34px Arial, sans-serif";
  x.fillText("請點選開始", 256, 561);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function paymentSuccessTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 720;
  const x = c.getContext("2d")!;
  const gradient = x.createLinearGradient(0, 0, 0, c.height);
  gradient.addColorStop(0, "#63c99c");
  gradient.addColorStop(1, "#319b77");
  x.fillStyle = gradient;
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#ffffff";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = "900 66px Arial, sans-serif";
  x.fillText("繳費成功", 256, 105);
  x.fillStyle = "rgba(255,255,255,.2)";
  x.beginPath();
  x.arc(256, 385, 154, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = "#ffffff";
  x.lineWidth = 34;
  x.lineCap = "round";
  x.lineJoin = "round";
  x.beginPath();
  x.moveTo(168, 388);
  x.lineTo(229, 451);
  x.lineTo(352, 309);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function numberTexture(label: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, 256, 256);
  x.fillStyle = "#4d83bc";
  x.beginPath();
  x.arc(128, 128, 112, 0, Math.PI * 2);
  x.fill();
  x.lineWidth = 12;
  x.strokeStyle = "#f3f8f7";
  x.stroke();
  x.fillStyle = "#fff";
  x.font = "800 132px Arial";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(label, 128, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function qrTexture(label: string, value: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff";
  x.fillRect(0, 0, 256, 320);
  x.fillStyle = "#244a62";
  x.textAlign = "center";
  x.font = "700 20px Arial";
  x.fillText(label, 128, 292);
  const code = QRCode.create(value, { errorCorrectionLevel: "M" });
  const n = code.modules.size,
    quiet = 3,
    available = 218,
    s = Math.floor(available / (n + quiet * 2)),
    size = s * (n + quiet * 2),
    ox = Math.floor((256 - size) / 2) + quiet * s,
    oy = 20 + quiet * s;
  for (let gy = 0; gy < n; gy++)
    for (let gx = 0; gx < n; gx++)
      if (code.modules.get(gx, gy)) x.fillRect(ox + gx * s, oy + gy * s, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeScanBadge() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 112;
  const x = c.getContext("2d")!;
  x.fillStyle = "rgba(255,255,255,.95)";
  x.strokeStyle = "#45c2c7";
  x.lineWidth = 8;
  x.beginPath();
  x.roundRect(8, 8, 240, 96, 34);
  x.fill();
  x.stroke();
  x.fillStyle = "#3278b4";
  x.font = "800 48px Arial";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("Scan!", 128, 58);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }),
  );
  s.scale.set(1.35, 0.59, 1);
  s.position.set(0.72, 2.08, 0);
  s.visible = false;
  s.renderOrder = 20;
  return s;
}
function makeKnockBadge() {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 220;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, 320, 220);
  x.translate(160, 110);
  x.rotate(Math.PI / 3);
  x.fillStyle = "#ffffff";
  x.font = "900 96px Arial";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("＼｜／", 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }),
  );
  s.scale.set(0.95, 0.68, 1);
  s.visible = false;
  s.renderOrder = 25;
  return s;
}
function makeBirdNote() {
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 192;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, 192, 192);
  x.fillStyle = "#44bddb";
  x.font = "800 118px Arial";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("♪", 96, 94);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }),
  );
  s.scale.set(0.72, 0.72, 1);
  s.position.set(0.18, 0.82, 0);
  s.visible = false;
  s.renderOrder = 24;
  return s;
}

function largePlant(scene: THREE.Scene, x: number, z: number, s = 1, y = 0.08) {
  const g = new THREE.Group(),
    pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.41, 0.47, 0.64, 28),
      material(BLUE, 0.58),
    ),
    rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.055, 10, 28),
      material(0x3e78ad, 0.55),
    ),
    soil = cyl(0.34, 0.035, 0x3b3028, 28);
  pot.position.y = 0.32;
  rim.position.y = 0.61;
  rim.rotation.x = Math.PI / 2;
  // Keep the visible soil clearly above the pot's closed top cap. The former
  // 2.5 mm separation became indistinguishable in the distant depth buffer and
  // made the two horizontal surfaces flicker against each other.
  soil.position.y = 0.663;
  soil.renderOrder = 2;
  g.add(pot, rim, soil);
  const leaves = [
    { yaw: 0, lean: 0, h: 1.08, w: 0.34 },
    { yaw: 0.72, lean: 0.28, h: 0.96, w: 0.32 },
    { yaw: -0.72, lean: -0.28, h: 0.98, w: 0.32 },
    { yaw: 1.45, lean: 0.48, h: 0.82, w: 0.3 },
    { yaw: -1.45, lean: -0.48, h: 0.84, w: 0.3 },
    { yaw: 2.25, lean: 0.62, h: 0.7, w: 0.27 },
    { yaw: -2.25, lean: -0.62, h: 0.72, w: 0.27 },
  ];
  leaves.forEach((d, i) => {
    const pivot = new THREE.Group(),
      stem = cyl(0.032, 0.4, i % 2 ? 0x477f42 : 0x3c743a, 10),
      leaf = new THREE.Mesh(
        leafGeometry(d.w, d.h),
        material(i % 3 ? 0x6fae45 : 0x80bd50, 0.68),
      );
    pivot.position.y = 0.61;
    pivot.rotation.y = d.yaw;
    stem.position.y = 0.2;
    stem.rotation.z = -d.lean * 0.3;
    leaf.position.y = 0.16;
    leaf.rotation.z = -d.lean;
    leaf.castShadow = true;
    pivot.add(stem, leaf);
    g.add(pivot);
  });
  g.position.set(x, y, z);
  g.rotation.y = Math.PI;
  g.scale.setScalar(s);
  scene.add(g);
  return g;
}
function smallPlant(scene: THREE.Scene, x: number, z: number, s = 1, y = 0.14) {
  const g = new THREE.Group(),
    pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.32, 0.34, 24),
      material(0xd87966, 0.58),
    ),
    rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.285, 0.045, 9, 24),
      material(0xc96859, 0.52),
    ),
    soil = cyl(0.235, 0.035, 0x3b3028, 24);
  pot.position.y = 0.17;
  rim.position.y = 0.32;
  rim.rotation.x = Math.PI / 2;
  soil.position.y = 0.325;
  g.add(pot, rim, soil);
  [
    [0, 0, 0.65, 1],
    [0.8, 0.32, 0.57, 0.82],
    [-0.8, -0.32, 0.57, 0.82],
    [1.6, 0.5, 0.49, 0.72],
    [-1.6, -0.5, 0.49, 0.72],
    [2.45, 0.58, 0.44, 0.64],
    [-2.45, -0.58, 0.44, 0.64],
    [0.35, 0.18, 0.48, 0.7],
    [-0.35, -0.18, 0.48, 0.7],
  ].forEach(([az, tilt, py, scale], i) => {
    const pivot = new THREE.Group(),
      leaf = new THREE.Mesh(
        new THREE.SphereGeometry(1, 14, 10),
        material(i % 2 ? 0x538b5b : 0x629c68, 0.72),
      );
    pivot.rotation.y = az;
    leaf.scale.set(0.13 * scale, 0.28 * scale, 0.105 * scale);
    leaf.position.set(0.11 * Math.sin(tilt), py, 0);
    leaf.rotation.z = -tilt;
    leaf.castShadow = true;
    pivot.add(leaf);
    g.add(pivot);
  });
  g.position.set(x, y, z);
  g.rotation.y = Math.PI;
  g.scale.setScalar(s);
  scene.add(g);
  return g;
}
function chair(
  scene: THREE.Scene | THREE.Group,
  x: number,
  z: number,
  color: number,
  rot = 0,
) {
  const g = new THREE.Group(),
    seat = new THREE.Mesh(
      new RoundedBoxGeometry(0.82, 0.18, 0.73, 5, 0.08),
      material(color, 0.7),
    ),
    back = new THREE.Mesh(
      new RoundedBoxGeometry(0.82, 0.76, 0.17, 5, 0.075),
      material(color, 0.7),
    );
  seat.position.set(0, 0.56, 0);
  back.position.set(0, 0.98, 0.28);
  seat.castShadow = true;
  back.castShadow = true;
  g.add(seat, back);
  [-0.3, 0.3].forEach((px) =>
    [-0.24, 0.24].forEach((pz) =>
      put(g, cyl(0.045, 0.52, 0xc5a77a, 10), px, 0.26, pz),
    ),
  );
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  scene.add(g);
}
function stool(
  scene: THREE.Scene | THREE.Group,
  x: number,
  z: number,
  color: number,
  rot = 0,
) {
  const g = new THREE.Group(),
    seat = new THREE.Mesh(
      new RoundedBoxGeometry(0.66, 0.17, 0.62, 6, 0.1),
      material(color, 0.7),
    );
  seat.position.y = 0.55;
  seat.castShadow = true;
  g.add(seat);
  [-0.23, 0.23].forEach((px) =>
    [-0.2, 0.2].forEach((pz) =>
      put(g, cyl(0.04, 0.5, 0xc5a77a, 10), px, 0.25, pz),
    ),
  );
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  scene.add(g);
}
function curvedFaceMask() {
  const geometry = new THREE.BufferGeometry(),
    vertices: number[] = [],
    indices: number[] = [],
    horizontalSegments = 10,
    verticalSegments = 5,
    halfWidth = 0.18,
    halfHeight = 0.12,
    centreY = -0.095,
    headRadius = 0.247,
    surfaceOffset = 0.009;
  // Build the mask directly on the same spherical radius as the head.  The
  // side columns recede around the cheeks and the rows follow the chin/nose
  // curve, removing the flat plate that previously intersected the face.
  for (let row = 0; row <= verticalSegments; row++) {
    const v = row / verticalSegments,
      localY = THREE.MathUtils.lerp(halfHeight, -halfHeight, v),
      faceY = centreY + localY,
      rowHalfWidth =
        halfWidth *
        (1 - Math.max(0, (v - 0.4) / 0.6) * 0.38);
    for (let column = 0; column <= horizontalSegments; column++) {
      const u = column / horizontalSegments,
        x = THREE.MathUtils.lerp(-rowHalfWidth, rowHalfWidth, u),
        sphereDepth = Math.sqrt(
          Math.max(0.001, headRadius * headRadius - x * x - faceY * faceY),
        );
      vertices.push(x, faceY, -sphereDepth - surfaceOffset);
    }
  }
  for (let row = 0; row < verticalSegments; row++)
    for (let column = 0; column < horizontalSegments; column++) {
      const a = row * (horizontalSegments + 1) + column,
        b = a + 1,
        c = a + horizontalSegments + 1,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mask = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xb8e1dc,
      roughness: 0.72,
      side: THREE.DoubleSide,
    }),
  );
  mask.castShadow = true;
  return mask;
}
function table(
  scene: THREE.Scene,
  x: number,
  z: number,
  qrId: QrId,
  interactive: THREE.Object3D[],
) {
  const g = new THREE.Group();
  put(g, cyl(0.74, 0.12, 0xe8c483, 28), 0, 0.64, 0);
  put(g, cyl(0.11, 0.6, 0xbd9664, 14), 0, 0.31, 0);
  put(g, cyl(0.14, 0.3, 0x60a66d, 12), 0.12, 0.84, -0.08);
  put(g, box(0.34, 0.035, 0.24, BLUE), -0.28, 0.74, 0.08);
  put(g, box(0.3, 0.032, 0.22, 0xf5f2e8), -0.02, 0.755, 0.1);
  const stand = new THREE.Group(),
    card = box(0.28, 0.38, 0.035, 0xffffff),
    face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.29),
      new THREE.MeshBasicMaterial({
        map: qrTexture("WAITING", `${window.location.origin}/qr/${qrId}`),
        side: THREE.DoubleSide,
      }),
    );
  card.position.y = 0.95;
  face.position.set(0, 0.95, 0.021);
  face.userData = { interactive: "qr", qrId };
  interactive.push(face);
  put(stand, box(0.34, 0.035, 0.2, 0x7895a0), 0, 0.755, 0.035);
  stand.add(card, face);
  stand.position.set(-0.35, 0, 0.3);
  g.add(stand);
  g.position.set(x, 0, z);
  scene.add(g);
}
function person(
  scene: THREE.Scene | THREE.Group,
  role: Role,
  color: number,
  start: THREE.Vector3,
  route: THREE.Vector3[],
  speed: number,
  room?: number,
  gender: Gender = "female",
  styleSeed = 0,
): Walker {
  const g = new THREE.Group(),
    uniform = role === "doctor" ? 0xf8fbfa : color,
    skin = 0xe4b08b;
  // A deliberately simple, rounded toy-like silhouette: body, four limbs and head.
  const legs = [-0.13, 0.13].map((x) => {
    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.085, 0.34, 3, 8),
      material(gender === "female" ? 0x526c82 : 0x41637b),
    );
    leg.position.set(x, 0.31, 0);
    leg.castShadow = true;
    g.add(leg);
    return leg;
  });
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(gender === "female" ? 0.28 : 0.31, 0.37, 4, 10),
    material(uniform),
  );
  torso.position.y = 0.98;
  torso.castShadow = true;
  torso.userData.uniformPart = true;
  g.add(torso);
  const hands: THREE.Mesh[] = [];
  const arms = [-0.36, 0.36].map((x) => {
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.07, 0.36, 3, 8),
      material(uniform),
    );
    arm.position.set(x, 1.18, 0);
    arm.geometry.translate(0, -0.2, 0);
    arm.castShadow = true;
    arm.userData.uniformPart = true;
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      material(skin),
    );
    hand.userData.handPart = true;
    hand.position.set(0, -0.49, 0);
    arm.add(hand);
    hands.push(hand);
    g.add(arm);
    return arm;
  });
  if (role === "doctor") {
    put(g, box(0.025, 0.48, 0.018, CYAN), 0, 1.02, -0.31);
    put(g, box(0.13, 0.09, 0.018, BLUE), 0.15, 1.13, -0.31);
  }
  if (role === "nurse") {
    put(g, box(0.14, 0.04, 0.018, 0xffffff), 0.13, 1.08, -0.29);
    put(g, box(0.04, 0.14, 0.018, 0xffffff), 0.13, 1.08, -0.3);
  }
  const headRig = new THREE.Group();
  headRig.position.y = 1.62;
  g.add(headRig);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 10),
    material(skin),
  );
  head.castShadow = true;
  headRig.add(head);
  // Every nurse uses one of the two tied-back clinical hairstyles requested
  // for the hospital: a low ponytail or a bun. Other roles retain the broader
  // set so patients and doctors still look varied.
  const hairStyle =
      role === "nurse"
        ? Math.abs(styleSeed) % 2 === 0
          ? 2
          : 3
        : ((styleSeed % 4) + 4) % 4,
    hairStyleNames = ["short", "bob", "lowPonytail", "bun"] as const,
    hairColors = [0x292a2d, 0x493832, 0x654532, 0x7a5540, 0x3f4a55, 0x92704f],
    hairColor =
      hairColors[
        Math.abs(styleSeed * 5 + (gender === "female" ? 1 : 3)) %
          hairColors.length
      ],
    hairMaterial = material(hairColor, 0.62),
    capCoverage = [0.42, 0.6, 0.54, 0.58][hairStyle],
    hair = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.252,
        16,
        10,
        0,
        Math.PI * 2,
        0,
        Math.PI * capCoverage,
      ),
      hairMaterial,
    ),
    addHairPiece = (
      geometry: THREE.BufferGeometry,
      position: [number, number, number],
      scale: [number, number, number] = [1, 1, 1],
      rotation: [number, number, number] = [0, 0, 0],
    ) => {
      const piece = new THREE.Mesh(geometry, hairMaterial);
      piece.userData.hairPart = true;
      piece.position.set(...position);
      piece.scale.set(...scale);
      piece.rotation.set(...rotation);
      piece.castShadow = true;
      headRig.add(piece);
      return piece;
    };
  hair.position.y = hairStyle === 0 ? 0.085 : 0.045;
  hair.userData.hairPart = true;
  hair.castShadow = true;
  headRig.add(hair);
  if (hairStyle === 1) {
    // The bob is a single curved rear shell that shares the cap's centre and
    // radius.  Its generous overlap removes the exposed head ring and avoids
    // the sunken or ear-like look caused by separate side and nape pieces.
    addHairPiece(
      new THREE.SphereGeometry(
        0.258,
        18,
        10,
        0,
        Math.PI,
        Math.PI * 0.43,
        Math.PI * 0.4,
      ),
      [0, 0.045, 0],
    );
  } else if (hairStyle === 3) {
    addHairPiece(
      new THREE.SphereGeometry(0.13, 12, 9),
      [0, 0.015, 0.225],
      [1, 0.9, 0.86],
    );
  } else if (hairStyle === 2) {
    // Low ponytail, tucked into the back of the cap instead of floating.
    addHairPiece(
      new THREE.SphereGeometry(0.115, 12, 9),
      [0, -0.075, 0.245],
      [0.88, 1.38, 0.82],
      [0.16, 0, 0],
    );
  }
  if (role === "nurse") {
    const cap = box(0.43, 0.08, 0.3, 0xffffff),
      capCrown = box(0.24, 0.14, 0.18, 0xffffff),
      capMarkH = box(0.1, 0.028, 0.02, CYAN),
      capMarkV = box(0.028, 0.1, 0.02, CYAN);
    cap.position.set(0, 0.24, 0);
    headRig.add(cap);
    put(headRig, capCrown, 0, 0.32, 0.01);
    put(headRig, capMarkH, 0, 0.33, -0.1);
    put(headRig, capMarkV, 0, 0.33, -0.11);
    [cap, capCrown, capMarkH, capMarkV].forEach((part) => {
      part.userData.nurseCapPart = true;
    });
  }
  let phone: THREE.Mesh | undefined,
    medicineBag: THREE.Group | undefined,
    scanBadge: THREE.Sprite | undefined,
    chart: THREE.Mesh | undefined;
  if (role === "patient") {
    phone = box(0.14, 0.27, 0.03, 0x172b3b, 0.3);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 0.225),
      new THREE.MeshBasicMaterial({ color: 0x8adce4 }),
    );
    screen.position.z = 0.016;
    phone.add(screen);
    phone.visible = false;
    hands[1].add(phone);
    medicineBag = new THREE.Group();
    const bagBody = new THREE.Mesh(
        new RoundedBoxGeometry(0.32, 0.4, 0.065, 4, 0.035),
        material(0xf7f4ea, 0.7),
      ),
      bagHandle = new THREE.Mesh(
        new THREE.TorusGeometry(0.085, 0.016, 7, 16, Math.PI),
        material(0x7895a0, 0.65),
      );
    bagBody.position.y = -0.19;
    bagHandle.position.set(0, 0.05, 0);
    bagHandle.rotation.z = Math.PI;
    medicineBag.add(bagBody, bagHandle);
    put(medicineBag, box(0.085, 0.022, 0.01, CYAN), 0, -0.18, -0.038);
    put(medicineBag, box(0.022, 0.085, 0.01, CYAN), 0, -0.18, -0.04);
    medicineBag.position.set(0, -0.075, -0.012);
    medicineBag.visible = false;
    hands[0].add(medicineBag);
    scanBadge = makeScanBadge();
    g.add(scanBadge);
  } else if (role === "doctor" || (role === "nurse" && room !== undefined)) {
    chart = box(0.42, 0.5, 0.035, 0xf4eee2, 0.65);
    chart.position.set(0, 0.94, -0.39);
    chart.rotation.x = -0.36;
    chart.visible = role === "doctor";
    g.add(chart);
    const clip = box(0.11, 0.05, 0.018, BLUE);
    clip.position.set(0, 0.21, -0.025);
    chart.add(clip);
  }
  g.position.copy(start);
  g.userData = {
    interactive: "person",
    role,
    room,
    gender,
    hairStyle,
    hairStyleName: hairStyleNames[hairStyle],
    turnRate: 0.14 + Math.random() * 0.22,
    gaitRate: 5.7 + Math.random() * 2.9,
    gaitPhase: Math.random() * Math.PI * 2,
  };
  g.traverse((o) => {
    o.userData.hitRoot = g;
  });
  scene.add(g);
  return {
    group: g,
    legs,
    arms,
    hands,
    phone,
    medicineBag,
    scanBadge,
    chart,
    headRig,
    route,
    waypoint: 1,
    speed,
    role,
    gender,
    pause: Math.random() * 0.45,
    stuck: 0,
    action: "walk",
    actionTime: 0,
    lastDoor: 0,
    room,
    sitCooldown: 0,
    readCooldown: 3 + Math.random() * 6,
  };
}

function eyeAssistant(
  scene: THREE.Scene,
  start: THREE.Vector3,
  route: THREE.Vector3[],
  speed: number,
): Walker {
  const g = new THREE.Group(),
    navy = 0x416a99,
    headRig = new THREE.Group();
  headRig.position.y = 0.8;
  g.add(headRig);

  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 28, 20),
    material(0xf6f7df, 0.76),
  );
  eye.castShadow = true;
  headRig.add(eye);

  // Concentric spherical caps follow the eyeball curvature, so the iris and
  // pupil read as one continuous globe instead of flat discs stuck on it.
  const faceCap = (radius: number, angle: number, color: number) => {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(
        radius,
        32,
        12,
        0,
        Math.PI * 2,
        0,
        angle,
      ),
      material(color, 0.58),
    );
    cap.rotation.x = -Math.PI / 2;
    cap.castShadow = true;
    headRig.add(cap);
    return cap;
  };
  faceCap(0.352, 0.73, 0x438cff);
  faceCap(0.355, 0.38, 0x0b3141);
  [
    [-0.086, 0.11, 0.068],
    [0.08, -0.066, 0.046],
  ].forEach(([x, y, r]) => {
    const shine = new THREE.Mesh(
      new THREE.SphereGeometry(r, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    shine.scale.z = 0.2;
    const surfaceZ = -Math.sqrt(
      Math.max(0.01, 0.355 * 0.355 - x * x - y * y),
    );
    shine.position.set(x, y, surfaceZ - 0.012);
    headRig.add(shine);
  });
  const makeArm = (side: number) => {
    const arm = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(side * 0.06, -0.16, 0),
          new THREE.Vector3(side * 0.27, -0.21, 0.01),
        ),
        16,
        0.024,
        8,
        false,
      ),
      material(navy, 0.62),
    );
    arm.position.set(side * 0.31, 0.71, 0);
    arm.castShadow = true;
    g.add(arm);
    return arm;
  };
  const arms = [makeArm(-1), makeArm(1)];
  const legs = [-0.115, 0.115].map((x) => {
    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.032, 0.21, 4, 8),
      material(navy, 0.62),
    );
    leg.position.set(x, 0.255, 0);
    leg.castShadow = true;
    g.add(leg);
    const foot = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.09,
        18,
        10,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2,
      ),
      material(navy, 0.62),
    );
    foot.scale.set(0.54, 0.34, 0.775);
    foot.position.set(0, -0.145, -0.045);
    foot.castShadow = true;
    leg.add(foot);
    return leg;
  });

  g.position.copy(start);
  g.userData = {
    interactive: "person",
    role: "assistant",
    gender: "female",
    eyeAssistant: true,
    eyeHeadBaseY: 0.8,
    turnRate: 0.16 + Math.random() * 0.16,
    gaitRate: 5.1 + Math.random() * 1.4,
    gaitPhase: Math.random() * Math.PI * 2,
  };
  g.traverse((o) => {
    o.userData.hitRoot = g;
  });
  scene.add(g);
  return {
    group: g,
    legs,
    arms,
    hands: [],
    headRig,
    route,
    waypoint: 1,
    speed,
    role: "assistant",
    gender: "female",
    pause: 0.18 + Math.random() * 0.35,
    stuck: 0,
    action: "walk",
    actionTime: 0,
    lastDoor: 0,
    sitCooldown: 0,
    readCooldown: 99,
  };
}
function blocked(
  p: THREE.Vector3,
  obs: Obstacle[],
  r = 0.32,
  allowedSeat?: number,
  ignoreWingWalls = false,
) {
  return obs.some((o) => {
    if (ignoreWingWalls && o.wingWall) return false;
    if (allowedSeat !== undefined && o.seatId === allowedSeat) return false;
    if (o.cx !== undefined) {
      const dx = p.x - o.cx,
        dz = p.z - o.cz!,
        u = Math.abs(dx * o.ux! + dz * o.uz!),
        v = Math.abs(dx * o.vx! + dz * o.vz!);
      return u < o.halfU! + r && v < o.halfV! + r;
    }
    return (
      p.x > o.minX! - r &&
      p.x < o.maxX! + r &&
      p.z > o.minZ! - r &&
      p.z < o.maxZ! + r
    );
  });
}

export default function HospitalScene({
  content,
  onReady,
  onTalk,
  onPatientFocus,
  patientFocusClearRequest,
  onKnock,
  onPatientCount,
  onElevatorOpen,
  activeFloor,
  elevatorOpen,
  cameraView,
  cameraViewRequest,
}: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraTransitionRef = useRef<CameraTransition | null>(null);
  const clearPatientFocusRef = useRef<(() => void) | null>(null);
  const applyFloorRef = useRef<((floor: 1 | 2 | 3) => void) | null>(null);
  const activeFloorRef = useRef<1 | 2 | 3>(activeFloor);
  const elevatorOpenRef = useRef(elevatorOpen);
  const previousCameraViewRef = useRef<CameraView>("panorama");
  const previousActiveFloorRef = useRef<1 | 2 | 3>(activeFloor);
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  useEffect(() => {
    activeFloorRef.current = activeFloor;
    applyFloorRef.current?.(activeFloor);
  }, [activeFloor]);
  useEffect(() => {
    elevatorOpenRef.current = elevatorOpen;
  }, [elevatorOpen]);
  useEffect(() => {
    if (!mount.current) return;
    const host = mount.current,
      scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f8f7);
    const camera = new THREE.PerspectiveCamera(
      host.clientWidth <= 760 ? 42 : 35,
      host.clientWidth / host.clientHeight,
      0.1,
      120,
    );
    camera.position.set(22, 18, 25);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      host.innerHTML =
        '<div class="webgl-fallback"><b>MEDIFY 3D HOSPITAL</b><span>此裝置未開啟 3D 圖形加速</span><small>請使用已啟用 WebGL 的最新版瀏覽器</small></div>';
      window.requestAnimationFrame(onReady);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    host.appendChild(renderer.domElement);
    scene.background = new THREE.Color(0xedf7f9);
    const controls = new OrbitControls(camera, renderer.domElement);
    cameraRef.current = camera;
    controlsRef.current = controls;
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    const touchDevice =
      window.matchMedia("(pointer: coarse)").matches ||
      navigator.maxTouchPoints > 0;
    // Preserve one-finger orbiting and pinch zoom while adding a two-finger
    // screen-space pan on phones and other touch-first devices. A lightweight
    // twist listener below adds yaw rotation without taking pan or zoom away.
    // Mouse panning remains disabled so desktop controls behave exactly as before.
    controls.enablePan = touchDevice;
    controls.screenSpacePanning = true;
    controls.panSpeed = 0.8;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    renderer.domElement.style.touchAction = "none";
    let twoFingerAngle: number | null = null;
    const touchAngle = (event: TouchEvent) => {
        const first = event.touches[0],
          second = event.touches[1];
        return Math.atan2(
          second.clientY - first.clientY,
          second.clientX - first.clientX,
        );
      },
      beginTwoFingerRotate = (event: TouchEvent) => {
        twoFingerAngle = event.touches.length === 2 ? touchAngle(event) : null;
      },
      rotateWithTwoFingers = (event: TouchEvent) => {
        if (event.touches.length !== 2) {
          twoFingerAngle = null;
          return;
        }
        const angle = touchAngle(event);
        if (twoFingerAngle === null) {
          twoFingerAngle = angle;
          return;
        }
        let delta = angle - twoFingerAngle;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        twoFingerAngle = angle;
        if (Math.abs(delta) < 0.002 || Math.abs(delta) > 0.35) return;
        const cameraOffset = camera.position.clone().sub(controls.target);
        cameraOffset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, delta * 0.9);
        camera.position.copy(controls.target).add(cameraOffset);
        camera.lookAt(controls.target);
      },
      endTwoFingerRotate = (event: TouchEvent) => {
        twoFingerAngle = event.touches.length === 2 ? touchAngle(event) : null;
      };
    if (touchDevice) {
      renderer.domElement.addEventListener("touchstart", beginTwoFingerRotate, {
        passive: true,
      });
      renderer.domElement.addEventListener("touchmove", rotateWithTwoFingers, {
        passive: true,
      });
      renderer.domElement.addEventListener("touchend", endTwoFingerRotate, {
        passive: true,
      });
      renderer.domElement.addEventListener("touchcancel", endTwoFingerRotate, {
        passive: true,
      });
    }
    const mobileView = () => host.clientWidth <= 760;
    controls.minDistance = 20;
    controls.maxDistance = mobileView() ? 74.4 : 48;
    controls.minPolarAngle = 0.45;
    controls.maxPolarAngle = 1.18;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.16;
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb9cbca, 2.8),
      sun = new THREE.DirectionalLight(0xfffbf3, 4.2);
    sun.position.set(12, 20, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    scene.add(hemi, sun);

    // True fan plan: narrow at the reception wall (back), opening toward the entrance (front).
    const fanShape = new THREE.Shape();
    fanShape.moveTo(-5.45, 8.75);
    fanShape.lineTo(5.45, 8.75);
    fanShape.lineTo(16.2, -6.15);
    fanShape.quadraticCurveTo(16.3, -8.35, 11, -8.85);
    fanShape.quadraticCurveTo(0, -9.55, -11, -8.85);
    fanShape.quadraticCurveTo(-16.3, -8.35, -16.2, -6.15);
    fanShape.closePath();
    const baseGeo = new THREE.ExtrudeGeometry(fanShape, {
      depth: 0.68,
      bevelEnabled: true,
      bevelSize: 0.16,
      bevelThickness: 0.12,
      bevelSegments: 3,
    });
    baseGeo.rotateX(-Math.PI / 2);
    const base = new THREE.Mesh(baseGeo, material(0xeee9df));
    base.position.y = -0.83;
    base.castShadow = true;
    base.receiveShadow = true;
    scene.add(base);
    const floorGeo = new THREE.ShapeGeometry(fanShape, 24);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, material(0xf7f4ed));
    floor.position.y = 0.075;
    floor.receiveShadow = true;
    scene.add(floor);
    const obs: Obstacle[] = [];
    const wallH = 4.15;
    // The pharmacy has an open rear edge; the reception wall now acts as its only backdrop.
    const FAN_SLOPE = 0.68,
      FAN_ANGLE = Math.atan(FAN_SLOPE),
      sideX = (side: number, z: number) => side * (5.2 + (z + 7.8) * FAN_SLOPE),
      insideLobby = (p: THREE.Vector3, margin = 0.32) =>
        p.z > -8.15 + margin &&
        p.z < 7.65 - margin &&
        Math.abs(p.x) < sideX(1, p.z) - margin;
    // Keep every ordinary lobby waypoint far enough from the angled walls for the
    // complete character silhouette (including shoulders and arms), not just the
    // character's centre point. This also repairs older route points that began
    // outside the fan-shaped boundary and could therefore never escape the wall.
    const clampLobbyPoint = (point: THREE.Vector3, margin = 1.28) => {
      const p = point.clone();
      p.z = THREE.MathUtils.clamp(p.z, -7.05, 6.85);
      const limit = Math.max(1.1, sideX(1, p.z) - margin);
      p.x = THREE.MathUtils.clamp(p.x, -limit, limit);
      return p;
    };
    const addWingWall = (side: number, z1: number, z2: number) => {
      if (z2 <= z1) return;
      const z = (z1 + z2) / 2,
        x = sideX(side, z),
        len = (z2 - z1) * Math.sqrt(1 + FAN_SLOPE * FAN_SLOPE),
        wall = box(0.38, wallH, len, CREAM);
      wall.position.set(x, wallH / 2, z);
      wall.rotation.y = side * FAN_ANGLE;
      scene.add(wall);
      for (let a = z1; a < z2; a += 0.55) {
        const b = Math.min(z2, a + 0.55),
          xa = sideX(side, a),
          xb = sideX(side, b);
        obs.push({
          minX: Math.min(xa, xb) - 0.22,
          maxX: Math.max(xa, xb) + 0.22,
          minZ: a - 0.05,
          maxZ: b + 0.05,
          wingWall: true,
        });
      }
    };
    const buildWing = (side: number, centres: number[]) => {
      const halfOpening = 1.07;
      let start = -7.8;
      [...centres]
        .sort((a, b) => a - b)
        .forEach((z) => {
          addWingWall(side, start, z - halfOpening);
          start = z + halfOpening;
        });
      addWingWall(side, start, 7.15);
    };
    buildWing(-1, [-5.7, -1.2]);
    buildWing(1, [-5.8, -1.3, 3.2]);

    const doors: Door[] = [],
      interactive: THREE.Object3D[] = [],
      callScreens: {
        room: number;
        texture: THREE.CanvasTexture;
        patientNo?: string;
      }[] = [];
    const paintCallScreen = (
      texture: THREE.CanvasTexture,
      room: number,
      patientNo?: string,
    ) => {
      const c = texture.image as HTMLCanvasElement,
        x = c.getContext("2d")!,
        gradient = x.createLinearGradient(0, 0, 0, c.height);
      gradient.addColorStop(0, "#3278b4");
      gradient.addColorStop(1, "#44bddb");
      x.fillStyle = gradient;
      x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = "rgba(255,255,255,.16)";
      x.fillRect(28, 28, c.width - 56, c.height - 56);
      x.strokeStyle = "rgba(255,255,255,.78)";
      x.lineWidth = 8;
      x.strokeRect(28, 28, c.width - 56, c.height - 56);
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillStyle = "#ffffff";
      x.font = "700 38px Arial, sans-serif";
      x.fillText("MEDIFY 叫號", c.width / 2, 82);
      if (patientNo) {
        x.font = "800 150px Arial, sans-serif";
        x.fillText(`${patientNo}號`, c.width / 2, 300);
        x.font = "700 70px Arial, sans-serif";
        x.fillText("請到", c.width / 2, 465);
        x.font = "800 104px Arial, sans-serif";
        x.fillText(`${room}診間`, c.width / 2, 585);
      } else {
        x.font = "800 92px Arial, sans-serif";
        x.fillText("候診中", c.width / 2, 330);
        x.font = "700 58px Arial, sans-serif";
        x.fillText(`${room}診間`, c.width / 2, 500);
      }
      texture.needsUpdate = true;
    };
    const makeCallTexture = (room: number) => {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 720;
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      paintCallScreen(texture, room);
      return texture;
    };
    const paintConsultingScreen = (
      texture: THREE.CanvasTexture,
      room: number,
    ) => {
      paintCallScreen(texture, room);
      const c = texture.image as HTMLCanvasElement,
        x = c.getContext("2d")!;
      x.fillStyle = "#44bddb";
      x.fillRect(40, 180, c.width - 80, 360);
      x.strokeStyle = "#ffffff";
      x.lineWidth = 7;
      x.strokeRect(40, 180, c.width - 80, 360);
      x.fillStyle = "#ffffff";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.font = "800 112px Arial, sans-serif";
      x.fillText("看診中", c.width / 2, 330);
      x.font = "700 62px Arial, sans-serif";
      x.fillText(`${room}診間`, c.width / 2, 455);
      texture.needsUpdate = true;
    };
    const setCallScreen = (room: number, patientNo?: string) => {
      const display = callScreens.find((screen) => screen.room === room);
      if (!display) return;
      display.patientNo = patientNo;
      if (patientNo === "看診中") paintConsultingScreen(display.texture, room);
      else paintCallScreen(display.texture, room, patientNo);
    };
    const makeDoor = (
      room: number,
      x: number,
      z: number,
      baseRot: number,
      lobbyFace: number,
    ) => {
      const frameGroup = new THREE.Group();
      frameGroup.position.set(x, 0, z);
      frameGroup.rotation.y = baseRot;
      const lintel = box(3.08, 1.2, 0.44, CREAM);
      lintel.position.set(0, 3.58, 0.01);
      frameGroup.add(lintel);
      [-1.11, 1.11].forEach((px) => {
        const post = new THREE.Mesh(
          new RoundedBoxGeometry(0.36, 3.08, 0.42, 10, 0.175),
          material(BLUE, 0.58),
        );
        post.position.set(px, 1.54, 0.01);
        post.castShadow = true;
        frameGroup.add(post);
      });
      const top = new THREE.Mesh(
        new RoundedBoxGeometry(2.58, 0.5, 0.42, 12, 0.235),
        material(BLUE, 0.58),
      );
      top.position.set(0, 2.9, 0.01);
      top.castShadow = true;
      frameGroup.add(top);
      const badgeMaterial = new THREE.MeshBasicMaterial({
        map: numberTexture(String(room)),
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6,
      });
      const badge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.76, 0.76),
        badgeMaterial,
      );
      badge.position.set(0, 3.58, 0.255 * lobbyFace);
      badge.rotation.y = lobbyFace < 0 ? Math.PI : 0;
      badge.renderOrder = 18;
      frameGroup.add(badge);
      scene.add(frameGroup);
      // Positive local X is the outside edge of both fan walls: visually it is the
      // left of rooms 1–2 and the right of rooms 3–5 when viewed from the lobby.
      const callTexture = makeCallTexture(room),
        callBody = new THREE.Mesh(
          new RoundedBoxGeometry(0.88, 1.42, 0.16, 7, 0.09),
          material(0x315f7c, 0.48),
        ),
        callFace = new THREE.Mesh(
          new THREE.PlaneGeometry(0.7, 1.16),
          new THREE.MeshBasicMaterial({
            map: callTexture,
            side: THREE.DoubleSide,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -5,
            polygonOffsetUnits: -5,
          }),
        );
      callBody.position.set(1.72, 1.68, 0.16 * lobbyFace);
      callFace.position.set(1.72, 1.68, 0.255 * lobbyFace);
      callFace.rotation.y = lobbyFace < 0 ? Math.PI : 0;
      callFace.renderOrder = 17;
      frameGroup.add(callBody, callFace);
      callScreens.push({ room, texture: callTexture });
      const knockBadge = makeKnockBadge();
      knockBadge.position.set(x, 2.2, z);
      scene.add(knockBadge);
      const tangentX = Math.cos(baseRot),
        tangentZ = -Math.sin(baseRot),
        clinicOut = new THREE.Vector3(
          lobbyFace,
          0,
          -FAN_SLOPE,
        ).normalize(),
        p = new THREE.Group();
      p.position.set(x, 0, z);
      p.rotation.y = baseRot;
      const door = new THREE.Mesh(
        roundedPanelGeometry(1.9, 2.86, 0.1, 0.42),
        material(BLUE, 0.58),
      );
      door.position.set(0, 0, 0);
      door.castShadow = true;
      p.add(door);
      const panel = new THREE.Mesh(
        roundedPanelGeometry(1.58, 2.56, 0.055, 0.36),
        material(0x49b9c3, 0.62),
      );
      panel.position.set(0, 0.13, 0.026 * lobbyFace);
      panel.castShadow = true;
      p.add(panel);
      const qrMaterial = new THREE.MeshBasicMaterial({
        map: qrTexture(
          `ROOM ${room}`,
          `${window.location.origin}/qr/clinic-door-${room}`,
        ),
        side: THREE.DoubleSide,
        transparent: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      const qr = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.6), qrMaterial);
      qr.position.set(0, 1.22, 0.066 * lobbyFace);
      qr.rotation.y = lobbyFace < 0 ? Math.PI : 0;
      qr.renderOrder = 12;
      qr.userData = { interactive: "qr", qrId: `clinic-door-${room}` };
      p.add(qr);
      p.userData = { interactive: "door", room };
      panel.userData = { hitRoot: p };
      door.userData = { hitRoot: p };
      scene.add(p);
      interactive.push(panel, door, qr);
      const closedPosition = p.position.clone(),
        // Local +X follows the fan wall toward the hospital exit. The small
        // clinic-side offset lets the leaf visually disappear into the wall
        // pocket instead of sliding across the lobby-mounted call screen.
        openPosition = closedPosition
          .clone()
          .add(new THREE.Vector3(tangentX, 0, tangentZ).multiplyScalar(2.08))
          // Keep the thinner leaf centred in the wall pocket.  The previous
          // clinic-side offset exposed the stored leaf when viewed from inside.
          .addScaledVector(clinicOut, -0.025);
      doors.push({
        pivot: p,
        base: baseRot,
        closedPosition,
        openPosition,
        room,
        auto: false,
        knockBadge,
        knockTime: 0,
      });
    };
    const doorDefs = [
        { room: 1, side: -1, z: -1.2 },
        { room: 2, side: -1, z: -5.7 },
        { room: 3, side: 1, z: -5.8 },
        { room: 4, side: 1, z: -1.3 },
        { room: 5, side: 1, z: 3.2 },
      ],
      clinicDoorPoints: THREE.Vector3[] = [],
      clinicOuts: THREE.Vector3[] = [],
      clinicTangents: THREE.Vector3[] = [];
    doorDefs.forEach(({ room, side, z }) => {
      const x = sideX(side, z),
        baseRot = Math.atan2(-1, side * FAN_SLOPE);
      clinicDoorPoints.push(new THREE.Vector3(x, 0, z));
      clinicOuts.push(new THREE.Vector3(side, 0, -FAN_SLOPE).normalize());
      clinicTangents.push(
        new THREE.Vector3(side * FAN_SLOPE, 0, 1).normalize(),
      );
      makeDoor(room, x, z, baseRot, side);
    });
    // Both floors share one vertically aligned elevator shaft. The second-floor
    // group is hidden while the visitor is on the lobby level.
    const SECOND_FLOOR_Y = 5.35,
      THIRD_FLOOR_Y = SECOND_FLOOR_Y * 2,
      secondFloor = new THREE.Group(),
      thirdFloor = new THREE.Group(),
      elevatorDoorLeaves = new Map<
        1 | 2 | 3,
        {
          left: THREE.Mesh;
          right: THREE.Mesh;
          seam: THREE.Mesh;
          openAmount: number;
        }
      >();
    secondFloor.position.y = SECOND_FLOOR_Y;
    secondFloor.visible = false;
    thirdFloor.position.y = THIRD_FLOOR_Y;
    thirdFloor.visible = false;
    scene.add(secondFloor, thirdFloor);

    const elevatorZ = 3.8,
      elevatorInward = new THREE.Vector3(1, 0, FAN_SLOPE).normalize(),
      elevatorWallPoint = new THREE.Vector3(sideX(-1, elevatorZ), 0, elevatorZ),
      elevatorPosition = elevatorWallPoint
        .clone()
        .addScaledVector(elevatorInward, 0.2),
      elevatorRotation = Math.atan2(-1, -FAN_SLOPE);

    const buildElevatorModel = (
      floorNumber: 1 | 2 | 3,
      parent: THREE.Scene | THREE.Group,
    ) => {
      const lift = new THREE.Group(),
        recess = box(2.72, 3.05, 0.22, 0x364f5b, 0.42),
        leftDoor = box(1.2, 2.72, 0.1, 0x91aebc),
        rightDoor = box(1.2, 2.72, 0.1, 0x88a9b8),
        seam = box(0.055, 2.72, 0.045, 0x4f7181),
        frameTop = new THREE.Mesh(
          new RoundedBoxGeometry(3.18, 0.72, 0.42, 10, 0.3),
          material(0x79a8bf, 0.58),
        ),
        indicatorPanel = new THREE.Mesh(
          new RoundedBoxGeometry(1.58, 0.72, 0.24, 8, 0.25),
          material(0x638fa8, 0.48),
        ),
        liftButtonPanel = new THREE.Mesh(
          new RoundedBoxGeometry(0.5, 0.94, 0.1, 5, 0.055),
          material(0xdcebed, 0.55),
        );
      recess.position.set(0, 1.52, 0.04);
      leftDoor.position.set(-0.62, 1.38, -0.14);
      rightDoor.position.set(0.62, 1.38, -0.14);
      seam.position.set(0, 1.38, -0.205);
      leftDoor.name = `elevator-door-${floorNumber}-left`;
      rightDoor.name = `elevator-door-${floorNumber}-right`;
      frameTop.position.set(0, 3.12, -0.03);
      indicatorPanel.position.set(0, 3.62, -0.12);
      liftButtonPanel.position.set(-1.82, 1.5, -0.08);
      lift.add(
        recess,
        leftDoor,
        rightDoor,
        seam,
        frameTop,
        indicatorPanel,
        liftButtonPanel,
      );
      [-1.38, 1.38].forEach((x) => {
        const post = new THREE.Mesh(
          new RoundedBoxGeometry(0.42, 3.15, 0.4, 8, 0.18),
          material(0x79a8bf, 0.58),
        );
        post.position.set(x, 1.53, -0.03);
        lift.add(post);
      });
      ([1, 2, 3] as const).forEach((displayFloor) => {
        const active = displayFloor === floorNumber,
          floorMat = new THREE.MeshStandardMaterial({
            color: active ? 0xf2c968 : 0xf6f1e8,
            roughness: 0.34,
            metalness: 0.08,
            emissive: active ? 0xe6a93f : 0x9fc8d8,
            emissiveIntensity: active ? 0.72 : 0.2,
          }),
          floorBox = new THREE.Mesh(
            new RoundedBoxGeometry(0.5, 0.48, 0.14, 6, 0.09),
            floorMat,
          ),
          floorLabel = new THREE.Mesh(
            new THREE.PlaneGeometry(0.32, 0.34),
            new THREE.MeshBasicMaterial({
              map: elevatorFloorNumberTexture(String(displayFloor), active),
              transparent: true,
              depthWrite: false,
              side: THREE.DoubleSide,
            }),
          ),
          displayX = (2 - displayFloor) * 0.46;
        floorBox.position.set(displayX, 3.62, -0.265);
        floorLabel.position.set(displayX, 3.62, -0.342);
        floorLabel.rotation.y = Math.PI;
        lift.add(floorBox, floorLabel);
      });
      const buttons: THREE.Mesh[] = [];
      ([
        ["▲", 1.69],
        ["▼", 1.27],
      ] as const).forEach(([label, y]) => {
        const button = new THREE.Mesh(
          new THREE.PlaneGeometry(0.34, 0.34),
          new THREE.MeshBasicMaterial({
            map: elevatorButtonTexture(label),
            transparent: true,
            side: THREE.DoubleSide,
          }),
        );
        button.position.set(-1.82, y, -0.14);
        button.rotation.y = Math.PI;
        lift.add(button);
        buttons.push(button);
      });
      lift.position.copy(elevatorPosition);
      lift.rotation.y = elevatorRotation;
      lift.userData = { interactive: "elevator", floor: floorNumber };
      [leftDoor, rightDoor, liftButtonPanel, ...buttons].forEach((object) => {
        object.userData.hitRoot = lift;
        interactive.push(object);
      });
      parent.add(lift);
      elevatorDoorLeaves.set(floorNumber, {
        left: leftDoor,
        right: rightDoor,
        seam,
        openAmount: 0,
      });
      return lift;
    };
    buildElevatorModel(1, scene);
    buildElevatorModel(2, secondFloor);
    buildElevatorModel(3, thirdFloor);

    // Enlarged clinics: the consultation desk hugs one side, leaving a straight
    // central aisle from the door to a bed and examination trolley at the rear.
    const clinicPos = clinicDoorPoints.map((door, i) =>
      door
        .clone()
        .addScaledVector(clinicOuts[i], 3.05)
        .addScaledVector(clinicTangents[i], 1.35),
    );
    const clinicDoctorSeats: THREE.Vector3[] = [],
      clinicNurseSeats: THREE.Vector3[] = [],
      clinicPatientSeats: THREE.Vector3[] = [],
      clinicPatientSeatApproaches: THREE.Vector3[] = [],
      clinicPatientSeatControls: THREE.Vector3[] = [],
      clinicTabletPoints: THREE.Vector3[] = [],
      clinicDoorInsidePoints: THREE.Vector3[] = [],
      clinicDoorCenterPoints: THREE.Vector3[] = [],
      clinicDoctorExamApproaches: THREE.Vector3[] = [],
      clinicDoctorYaws: number[] = [],
      clinicNurseYaws: number[] = [],
      clinicNurseSeatExitPoints: THREE.Vector3[] = [],
      clinicPatientYaws: number[] = [],
      clinicBedPoints: THREE.Vector3[] = [],
      clinicBedWallPoints: THREE.Vector3[] = [],
      clinicBedSidePoints: THREE.Vector3[] = [],
      clinicBedExitPoints: THREE.Vector3[] = [],
      clinicBedEdgeSeatPoints: THREE.Vector3[] = [],
      clinicBedSitYaws: number[] = [],
      clinicExamApproaches: THREE.Vector3[] = [],
      clinicExamDoctorPoints: THREE.Vector3[] = [],
      clinicDoctorExamFacingPoints: THREE.Vector3[] = [],
      clinicDoctorRetreatPoints: THREE.Vector3[] = [],
      clinicNurseDoorPoints: THREE.Vector3[] = [],
      clinicNurseExamStandPoints: THREE.Vector3[] = [],
      clinicNurseBedTidyHeadPoints: THREE.Vector3[] = [],
      clinicNurseBedTidyFootPoints: THREE.Vector3[] = [],
      clinicStoolZones: { room: number; pos: THREE.Vector3 }[] = [];
    const clinicInteriorStartIndex = scene.children.length;
    clinicPos.forEach((deskPos, i) => {
      const out = clinicOuts[i],
        tan = clinicTangents[i],
        door = clinicDoorPoints[i],
        doctorPos = deskPos.clone().addScaledVector(out, 1.25),
        nursePos = deskPos.clone().addScaledVector(out, -1.25),
        patientPos = deskPos
          .clone()
          .addScaledVector(out, -0.18)
          .addScaledVector(tan, -1.5),
        bedPos = door
          .clone()
          .addScaledVector(out, 5.55)
          // Moving only the bed toward the device opens a proper inner-side
          // egress lane: global-right in rooms 1–2 and global-left in rooms 3–5.
          .addScaledVector(tan, -0.88),
        examApproach = door
          .clone()
          .addScaledVector(out, 3.75)
          .addScaledVector(tan, -0.3),
        // Keep the clinician on the instrument side of the bed.  These local
        // out/tangent offsets mirror correctly for the left and right wings;
        // using the old centre-aisle point made the left-room return route cross
        // the patient's bed-exit lane.
        examDoctor = bedPos
          .clone()
          // Stand in the inside corner formed by the mattress and device, close
          // enough to operate the controls without intersecting either model.
          .addScaledVector(out, 0.55)
          .addScaledVector(tan, 0.92),
        wallAngle = doorDefs[i].side * FAN_ANGLE,
        bedYaw = Math.atan2(-out.z, out.x),
        faceYaw = (a: THREE.Vector3, b: THREE.Vector3) =>
          Math.atan2(-(b.x - a.x), -(b.z - a.z)),
        doctorYaw = faceYaw(doctorPos, nursePos),
        nurseYaw = faceYaw(nursePos, doctorPos),
        patientYaw = faceYaw(patientPos, doctorPos),
        patientSeatControl = patientPos.clone().addScaledVector(out, -0.34),
        patientSeatApproach = patientPos.clone().addScaledVector(out, -1.02),
        tabletPoint = deskPos
          .clone()
          .addScaledVector(out, -0.08)
          .addScaledVector(tan, -0.68),
        doorCenter = door.clone(),
        doorInside = door.clone().addScaledVector(out, 1.62),
        // Wait immediately beside the doorway. From here the nurse can see the
        // approaching patient and still turn into the room without crossing them.
        nurseDoorPoint = door
          .clone()
          .addScaledVector(out, -1.05)
          .addScaledVector(tan, 0.72),
        // The clinic nurse always leaves and returns from the open side of the
        // chair.  Starting pathfinding at the chair centre could trap the nurse
        // between the chair and desk obstacle.
        nurseSeatExit = nursePos
          .clone()
          .addScaledVector(tan, 0.94)
          .addScaledVector(out, -0.08),
        doctorExamApproach = bedPos
          .clone()
          .addScaledVector(out, -0.65)
          .addScaledVector(tan, 1.05);
      const roomFloor = box(7.35, 0.08, 5.9, i % 2 ? 0xe6f3f1 : 0xe8f0f4);
      roomFloor.position.copy(door.clone().addScaledVector(out, 3.72));
      roomFloor.position.y = 0.09;
      roomFloor.rotation.y = wallAngle;
      scene.add(roomFloor);
      const backWall = box(0.28, 2.15, 5.9, CREAM);
      backWall.position.copy(door.clone().addScaledVector(out, 7.28));
      backWall.position.y = 1.08;
      backWall.rotation.y = wallAngle;
      scene.add(backWall);
      [-2.9, 2.9].forEach((sideOffset) => {
        const sideWall = box(7.15, 1.35, 0.24, CREAM);
        sideWall.position.copy(
          door
            .clone()
            .addScaledVector(out, 3.72)
            .addScaledVector(tan, sideOffset),
        );
        sideWall.position.y = 0.68;
        sideWall.rotation.y = wallAngle;
        scene.add(sideWall);
      });
      const desk = new THREE.Mesh(
        new RoundedBoxGeometry(1.16, 0.14, 2.05, 5, 0.06),
        material(0xe7c583),
      );
      desk.position.set(deskPos.x, 0.76, deskPos.z);
      desk.rotation.y = wallAngle;
      desk.castShadow = true;
      desk.receiveShadow = true;
      scene.add(desk);
      [-0.44, 0.44].forEach((a) =>
        [-0.78, 0.78].forEach((b) =>
          put(
            scene,
            cyl(0.045, 0.7, 0xbc9664, 10),
            deskPos.x + out.x * a + tan.x * b,
            0.35,
            deskPos.z + out.z * a + tan.z * b,
          ),
        ),
      );
      const monitor = box(0.08, 0.52, 0.72, 0x4f7f9b);
      monitor.position.set(
        deskPos.x - out.x * 0.18,
        1.12,
        deskPos.z - out.z * 0.18,
      );
      monitor.rotation.y = wallAngle;
      scene.add(monitor);
      const keyboard = box(0.34, 0.035, 0.55, 0xf3f5f3);
      keyboard.position.set(
        deskPos.x + out.x * 0.2,
        0.84,
        deskPos.z + out.z * 0.2,
      );
      keyboard.rotation.y = wallAngle;
      scene.add(keyboard);
      const clinicTablet = new THREE.Group(),
        tabletBody = new THREE.Mesh(
          new RoundedBoxGeometry(0.56, 0.045, 0.76, 4, 0.035),
          material(0x315f7c, 0.42),
        ),
        tabletScreen = new THREE.Mesh(
          new THREE.PlaneGeometry(0.48, 0.66),
          new THREE.MeshBasicMaterial({
            map: qrTexture(
              `ROOM ${i + 1}`,
              `${window.location.origin}/qr/clinic-tablet-${i + 1}`,
            ),
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
          }),
        );
      tabletScreen.rotation.x = -Math.PI / 2;
      tabletScreen.position.y = 0.027;
      tabletScreen.userData = {
        interactive: "qr",
        qrId: `clinic-tablet-${i + 1}`,
      };
      interactive.push(tabletScreen);
      clinicTablet.add(tabletBody, tabletScreen);
      clinicTablet.position.set(
        deskPos.x - out.x * 0.08 - tan.x * 0.68,
        0.855,
        deskPos.z - out.z * 0.08 - tan.z * 0.68,
      );
      clinicTablet.rotation.y = wallAngle;
      scene.add(clinicTablet);
      chair(scene, doctorPos.x, doctorPos.z, BLUE, doctorYaw);
      chair(scene, nursePos.x, nursePos.z, CYAN, nurseYaw);
      stool(scene, patientPos.x, patientPos.z, 0x7bcbd0, patientYaw);
      clinicStoolZones.push({ room: i + 1, pos: patientPos.clone() });
      const bed = new THREE.Group(),
        mattress = new THREE.Mesh(
          new RoundedBoxGeometry(2.35, 0.3, 1.08, 5, 0.12),
          material(0xe9f5f3, 0.62),
        ),
        base = box(2.42, 0.42, 1.14, 0x70a6c4);
      base.position.y = 0.43;
      mattress.position.y = 0.76;
      bed.add(base, mattress);
      [-0.94, 0.94].forEach((u) =>
        [-0.42, 0.42].forEach((v) =>
          put(bed, cyl(0.055, 0.4, 0x6d8793, 10), u, 0.2, v),
        ),
      );
      const head = box(0.18, 0.82, 1.12, BLUE);
      head.position.set(1.13, 0.82, 0);
      bed.add(head);
      bed.position.copy(bedPos);
      bed.rotation.y = bedYaw;
      scene.add(bed);
      const device = new THREE.Group(),
        cart = box(0.72, 0.58, 0.64, 0xf5f7f5),
        deviceScreen = box(0.12, 0.62, 0.72, 0x426f88);
      cart.position.y = 0.4;
      deviceScreen.position.set(0, 0.98, 0);
      device.add(cart, deviceScreen);
      put(device, cyl(0.055, 0.55, 0x75929d, 10), -0.28, 0.27, -0.22);
      put(device, cyl(0.055, 0.55, 0x75929d, 10), 0.28, 0.27, -0.22);
      put(device, cyl(0.055, 0.55, 0x75929d, 10), -0.28, 0.27, 0.22);
      put(device, cyl(0.055, 0.55, 0x75929d, 10), 0.28, 0.27, 0.22);
      const probe = box(0.1, 0.48, 0.1, CYAN);
      probe.position.set(-0.34, 0.96, 0);
      probe.rotation.z = 0.28;
      device.add(probe);
      const devicePos = bedPos
        .clone()
        .addScaledVector(out, 1.08)
        // Compensate for the bed shift so the instrument remains at its previous
        // room-side station while the physical gap between bed and device shrinks.
        .addScaledVector(tan, 1.35);
      device.position.copy(devicePos);
      device.rotation.y = bedYaw;
      scene.add(device);
      clinicDoctorSeats.push(doctorPos);
      clinicNurseSeats.push(nursePos);
      clinicPatientSeats.push(patientPos);
      clinicPatientSeatApproaches.push(patientSeatApproach);
      clinicPatientSeatControls.push(patientSeatControl);
      clinicTabletPoints.push(tabletPoint);
      clinicDoorCenterPoints.push(doorCenter);
      clinicDoorInsidePoints.push(doorInside);
      clinicDoctorExamApproaches.push(doctorExamApproach);
      clinicDoctorYaws.push(doctorYaw);
      clinicNurseYaws.push(nurseYaw);
      clinicNurseSeatExitPoints.push(nurseSeatExit);
      clinicPatientYaws.push(patientYaw);
      const bedWallPoint = door
          .clone()
          // Reach the clear foot-side aisle first, then continue along the
          // outside edge of the mattress.  This removes the old diagonal that
          // could meet the doctor between the stool and examination trolley.
          .addScaledVector(out, 3.92)
          .addScaledVector(tan, -1.9),
        // Negative tangent mirrors to the requested physical side: the right
        // side of beds in the left wing and the left side in the right wing.
        bedSidePoint = bedPos.clone().addScaledVector(tan, -1.22),
        bedExitPoint = bedSidePoint.clone().addScaledVector(out, -1.12),
        doctorRetreatPoint = doctorExamApproach.clone();
      clinicBedPoints.push(bedPos);
      clinicBedWallPoints.push(bedWallPoint);
      clinicBedSidePoints.push(bedSidePoint);
      clinicBedExitPoints.push(bedExitPoint);
      clinicBedSitYaws.push(faceYaw(bedSidePoint, bedPos) + Math.PI);
      clinicExamApproaches.push(examApproach);
      clinicExamDoctorPoints.push(examDoctor);
      const toDevice = devicePos.clone().sub(examDoctor).setY(0).normalize(),
        toBed = bedPos.clone().sub(examDoctor).setY(0).normalize(),
        examFacingPoint = examDoctor
          .clone()
          .add(toDevice.add(toBed).normalize());
      clinicDoctorExamFacingPoints.push(examFacingPoint);
      clinicDoctorRetreatPoints.push(doctorRetreatPoint);
      clinicNurseDoorPoints.push(nurseDoorPoint);
      // During a detailed exam the nurse clears the patient's bed-side lane and
      // waits against the same wall, in the first third of the room nearest the
      // door.  Once the patient reaches the desk QR tablet, the nurse approaches
      // the head of the bed along this wall-side corridor.
      clinicNurseExamStandPoints.push(
        door
          .clone()
          .addScaledVector(out, 2.25)
          .addScaledVector(tan, -2.38),
      );
      clinicNurseBedTidyHeadPoints.push(
        bedPos
          .clone()
          .addScaledVector(out, 0.9)
          .addScaledVector(tan, -1.22),
      );
      clinicNurseBedTidyFootPoints.push(
        bedPos
          .clone()
          .addScaledVector(out, -0.92)
          .addScaledVector(tan, -1.22),
      );
      clinicBedEdgeSeatPoints.push(
        bedPos
          .clone()
          .addScaledVector(out, -0.72)
          .addScaledVector(tan, -0.42),
      );
      obs.push({
        cx: deskPos.x,
        cz: deskPos.z,
        ux: out.x,
        uz: out.z,
        vx: tan.x,
        vz: tan.z,
        halfU: 0.66,
        halfV: 1.12,
      });
    });
    const floorOneClinicInteriorObjects = scene.children.slice(
      clinicInteriorStartIndex,
    );

    // SECOND FLOOR ---------------------------------------------------------
    // Reuse the fan footprint and vertical elevator alignment, keeping the
    // whole upper centre independently switchable with its own clinical team.
    const secondBaseGeometry = new THREE.ExtrudeGeometry(fanShape.clone(), {
        depth: 0.48,
        bevelEnabled: true,
        bevelSize: 0.14,
        bevelThickness: 0.1,
        bevelSegments: 3,
      }),
      secondFloorGeometry = new THREE.ShapeGeometry(fanShape.clone(), 24);
    secondBaseGeometry.rotateX(-Math.PI / 2);
    secondFloorGeometry.rotateX(-Math.PI / 2);
    const secondBase = new THREE.Mesh(secondBaseGeometry, material(0xdfe9e7)),
      secondFloorSurface = new THREE.Mesh(
        secondFloorGeometry,
        material(0xf7f4ed),
      );
    secondBase.position.y = -0.55;
    secondBase.castShadow = true;
    secondBase.receiveShadow = true;
    secondFloorSurface.position.y = 0.02;
    secondFloorSurface.receiveShadow = true;
    secondFloor.add(secondBase, secondFloorSurface);

    // While viewing 2F, a continuous lower envelope hides the open first-floor
    // clinic and pharmacy interiors. It follows the same fan footprint, so the
    // street remains visible through the front facade.
    const lowerEnvelopeHeight = SECOND_FLOOR_Y - 0.08;
    [-1, 1].forEach((side) => {
      const z1 = -8.35,
        z2 = 7.15,
        z = (z1 + z2) / 2,
        length = (z2 - z1) * Math.sqrt(1 + FAN_SLOPE * FAN_SLOPE),
        wall = box(0.42, lowerEnvelopeHeight, length, CREAM);
      wall.position.set(
        sideX(side, z),
        -lowerEnvelopeHeight / 2,
        z,
      );
      wall.rotation.y = side * FAN_ANGLE;
      secondFloor.add(wall);
    });
    const lowerRearEnvelope = box(11.6, lowerEnvelopeHeight, 0.42, CREAM);
    lowerRearEnvelope.position.set(
      0,
      -lowerEnvelopeHeight / 2,
      -8.48,
    );
    secondFloor.add(lowerRearEnvelope);

    // Rebuild the five downstairs clinic modules as closed architectural
    // shells for the upstairs view. Their live dollhouse interiors are hidden,
    // but these cream exterior walls and roofs remain visible beneath 2F.
    clinicDoorPoints.forEach((door, index) => {
      const out = clinicOuts[index],
        tan = clinicTangents[index],
        wallAngle = doorDefs[index].side * FAN_ANGLE,
        shellCentre = door.clone().addScaledVector(out, 3.72),
        roof = box(7.35, 0.28, 5.9, 0xe7ebe7),
        back = box(0.3, lowerEnvelopeHeight, 5.9, CREAM);
      roof.position.copy(shellCentre);
      roof.position.y = -0.18;
      roof.rotation.y = wallAngle;
      back.position.copy(door.clone().addScaledVector(out, 7.28));
      back.position.y = -lowerEnvelopeHeight / 2;
      back.rotation.y = wallAngle;
      secondFloor.add(roof, back);
      [-2.9, 2.9].forEach((sideOffset) => {
        const sideWall = box(7.15, lowerEnvelopeHeight, 0.28, CREAM);
        sideWall.position.copy(
          shellCentre.clone().addScaledVector(tan, sideOffset),
        );
        sideWall.position.y = -lowerEnvelopeHeight / 2;
        sideWall.rotation.y = wallAngle;
        secondFloor.add(sideWall);
      });
    });

    const secondRearWall = box(11.4, 3.7, 0.34, CREAM);
    secondRearWall.position.set(0, 1.85, -8.48);
    secondFloor.add(secondRearWall);

    // Full-height front glazing keeps the street, cars and first-floor facade
    // visible from the upper level without rendering the lower lobby interior.
    const upperGlassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xbfe5e8,
      transparent: true,
      opacity: 0.34,
      roughness: 0.08,
      metalness: 0,
      transmission: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const addUpperFacadeReturn = (
      parent: THREE.Group,
      side: number,
    ) => {
      const wallEnd = new THREE.Vector3(sideX(side, 7.15), 0, 7.15),
        windowEnd = new THREE.Vector3(side * 13.92, 0, 7.7),
        direction = windowEnd.clone().sub(wallEnd),
        length = direction.length(),
        tangent = direction.normalize(),
        yaw = Math.atan2(tangent.x, tangent.z),
        middle = wallEnd.clone().add(windowEnd).multiplyScalar(0.5),
        glass = new THREE.Mesh(
          new RoundedBoxGeometry(0.08, 3.4, length, 5, 0.025),
          upperGlassMaterial,
        ),
        bottomRail = box(0.12, 0.18, length, 0xf5f1e9),
        topRail = box(0.12, 0.22, length, 0xf5f1e9);
      glass.position.set(middle.x, 1.75, middle.z);
      glass.renderOrder = 3;
      bottomRail.position.set(middle.x, 0.12, middle.z);
      topRail.position.set(middle.x, 3.58, middle.z);
      [glass, bottomRail, topRail].forEach((part) => {
        part.rotation.y = yaw;
        part.castShadow = true;
        part.receiveShadow = true;
        parent.add(part);
      });
      [wallEnd, windowEnd].forEach((point) => {
        const post = box(0.16, 3.5, 0.16, 0xf5f1e9);
        post.position.set(point.x, 1.82, point.z);
        parent.add(post);
      });
    };
    [-10.5, -3.5, 3.5, 10.5].forEach((x) => {
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(6.86, 3.4),
        upperGlassMaterial,
      );
      glass.position.set(x, 1.75, 7.72);
      glass.renderOrder = 3;
      secondFloor.add(glass);
    });
    [-13.9, -7, 0, 7, 13.9].forEach((x) => {
      const mullion = box(0.16, 3.5, 0.18, 0xf5f1e9);
      mullion.position.set(x, 1.82, 7.7);
      secondFloor.add(mullion);
    });
    const upperWindowBottom = box(28, 0.18, 0.2, 0xf5f1e9);
    upperWindowBottom.position.set(0, 0.12, 7.7);
    secondFloor.add(upperWindowBottom);
    const upperWindowTop = box(28, 0.22, 0.22, 0xf5f1e9);
    upperWindowTop.position.set(0, 3.58, 7.7);
    secondFloor.add(upperWindowTop);
    [-1, 1].forEach((side) => addUpperFacadeReturn(secondFloor, side));

    const averagePoint = (a: THREE.Vector3, b: THREE.Vector3) =>
      a.clone().add(b).multiplyScalar(0.5);
    const leftOperatingDoor = averagePoint(
        clinicDoorPoints[0],
        clinicDoorPoints[1],
      ),
      rightOperatingDoor = averagePoint(
        clinicDoorPoints[2],
        clinicDoorPoints[3],
      );

    // Build the upper lobby frontage as two uninterrupted fan-shaped walls.
    // Only the room doorways are cut out; their lintels and frames bridge the
    // openings, so elevator, rooms and rear display wall read as one envelope.
    const addUpperWingWall = (side: number, z1: number, z2: number) => {
      if (z2 <= z1) return;
      const z = (z1 + z2) / 2,
        length = (z2 - z1) * Math.sqrt(1 + FAN_SLOPE * FAN_SLOPE),
        wall = box(0.4, 3.7, length, CREAM);
      wall.position.set(sideX(side, z), 1.85, z);
      wall.rotation.y = side * FAN_ANGLE;
      secondFloor.add(wall);
    };
    const buildUpperWing = (
      side: number,
      openings: { z: number; half: number }[],
    ) => {
      let start = -8.35;
      [...openings]
        .sort((a, b) => a.z - b.z)
        .forEach(({ z, half }) => {
          addUpperWingWall(side, start, z - half);
          start = z + half;
        });
      addUpperWingWall(side, start, 7.15);
    };
    buildUpperWing(-1, [{ z: leftOperatingDoor.z, half: 1.32 }]);
    buildUpperWing(1, [
      { z: rightOperatingDoor.z, half: 1.32 },
      { z: clinicDoorPoints[4].z, half: 1.03 },
    ]);

    type UpperRoomKind = "operating" | "exam";
    type UpperOperatingDoor = {
      room: 1 | 2;
      centre: THREE.Vector3;
      out: THREE.Vector3;
      tan: THREE.Vector3;
      leaves: { mesh: THREE.Mesh; closed: THREE.Vector3; side: number }[];
      openAmount: number;
      openRequested: boolean;
      opening: number;
    };
    const upperOperatingDoors: UpperOperatingDoor[] = [],
      secondFloorInteriorObjects: THREE.Object3D[] = [];
    const addUpperRoom = (
      title: string,
      subtitle: string,
      doorCentre: THREE.Vector3,
      out: THREE.Vector3,
      tan: THREE.Vector3,
      wallAngle: number,
      width: number,
      depth: number,
      kind: UpperRoomKind,
      accent: number,
      operatingRoom?: 1 | 2,
    ) => {
      const roomFloor = box(depth, 0.1, width, kind === "exam" ? 0xe7f3f1 : 0xe6eef4),
        backWall = box(0.3, 2.75, width, CREAM),
        doorOpening = kind === "operating" ? 2.8 : 2.05;
      roomFloor.position.copy(doorCentre.clone().addScaledVector(out, depth / 2));
      roomFloor.position.y = 0.06;
      roomFloor.rotation.y = wallAngle;
      backWall.position.copy(doorCentre.clone().addScaledVector(out, depth));
      backWall.position.y = 1.38;
      backWall.rotation.y = wallAngle;
      secondFloor.add(roomFloor, backWall);
      [-1, 1].forEach((side) => {
        const sideWall = box(depth, 2.35, 0.26, CREAM);
        sideWall.position.copy(
          doorCentre
            .clone()
            .addScaledVector(out, depth / 2)
            .addScaledVector(tan, side * width / 2),
        );
        sideWall.position.y = 1.18;
        sideWall.rotation.y = wallAngle;
        secondFloor.add(sideWall);
      });

      const framePostOffset = doorOpening / 2 + 0.18;
      [-1, 1].forEach((side) => {
        const post = new THREE.Mesh(
          new RoundedBoxGeometry(0.36, 3.08, 0.42, 8, 0.17),
          material(accent, 0.55),
        );
        post.position.copy(doorCentre.clone().addScaledVector(tan, side * framePostOffset));
        post.position.y = 1.54;
        post.rotation.y = wallAngle;
        post.castShadow = true;
        post.receiveShadow = true;
        secondFloor.add(post);
      });
      const lintel = new THREE.Mesh(
        new RoundedBoxGeometry(0.42, 0.5, doorOpening + 0.72, 8, 0.2),
        material(accent, 0.55),
      );
      lintel.position.copy(doorCentre);
      lintel.position.y = 2.92;
      lintel.rotation.y = wallAngle;
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      secondFloor.add(lintel);
      const roomDoorLeaves: UpperOperatingDoor["leaves"] = [];
      [-1, 1].forEach((side) => {
        const leaf = new THREE.Mesh(
          new RoundedBoxGeometry(
            0.12,
            2.68,
            doorOpening / 2 + 0.035,
            6,
            0.08,
          ),
          material(side < 0 ? 0x91aebc : 0x88a9b8, 0.54),
        );
        leaf.position.copy(
          doorCentre.clone().addScaledVector(tan, side * doorOpening / 4),
        );
        leaf.position.y = 1.36;
        leaf.rotation.y = wallAngle;
        // Upper-room doors are built as independent rounded meshes rather
        // than through the shared box() helper, so opt them into the shadow
        // pipeline explicitly.  This keeps the moving OR leaves grounded and
        // lets their shadows slide naturally across the floor and doorway.
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        secondFloor.add(leaf);
        if (kind === "operating")
          roomDoorLeaves.push({
            mesh: leaf,
            closed: leaf.position.clone(),
            side,
          });
      });
      if (kind === "operating" && operatingRoom)
        upperOperatingDoors.push({
          room: operatingRoom,
          centre: doorCentre.clone(),
          out: out.clone(),
          tan: tan.clone(),
          leaves: roomDoorLeaves,
          openAmount: 0,
          openRequested: false,
          opening: doorOpening,
        });
      const roomSign = new THREE.Mesh(
        new THREE.PlaneGeometry(kind === "operating" ? 2.5 : 2.1, 0.72),
        new THREE.MeshBasicMaterial({
          map: canvasTexture(title, subtitle),
          side: THREE.DoubleSide,
          transparent: true,
        }),
      );
      roomSign.position.copy(doorCentre.clone().addScaledVector(out, -0.12));
      roomSign.position.y = 3.48;
      roomSign.rotation.y =
        wallAngle + Math.PI / 2 + (doorCentre.x > 0 ? Math.PI : 0);
      // The sign sits slightly proud of the wall, so its cast shadow adds the
      // missing depth cue above the framed automatic doorway.
      roomSign.castShadow = true;
      roomSign.receiveShadow = true;
      secondFloor.add(roomSign);

      // Everything added after this point belongs to the live clinical
      // interior. It remains available on 2F but is hidden behind a closed
      // architectural shell when the visitor is viewing the floor from 3F.
      const roomInteriorStart = secondFloor.children.length;

      const bedCentre = doorCentre.clone().addScaledVector(out, depth * 0.58),
        bedYaw = Math.atan2(-out.z, out.x),
        treatmentBed = new THREE.Group(),
        bedBase = new THREE.Mesh(
          new RoundedBoxGeometry(
            kind === "operating" ? 2.9 : 2.55,
            0.3,
            1.18,
            6,
            0.12,
          ),
          material(0xe7e3da, 0.58),
        );
      bedBase.position.y = 0.58;
      treatmentBed.add(bedBase);
      put(
        treatmentBed,
        new THREE.Mesh(
          new RoundedBoxGeometry(1.18, 0.45, 0.82, 6, 0.12),
          material(0xd4d0c7, 0.62),
        ),
        0,
        0.26,
        0,
      );
      if (kind === "operating") {
        [-0.98, -0.34, 0.34, 0.98].forEach((x, index) => {
          const pad = new THREE.Mesh(
            new RoundedBoxGeometry(index === 0 ? 0.58 : 0.62, 0.24, 1.06, 6, 0.11),
            material(index % 2 ? 0x8bc1d9 : 0x82b8d3, 0.62),
          );
          pad.position.set(x, 0.85, 0);
          treatmentBed.add(pad);
        });
        put(treatmentBed, box(0.46, 0.2, 0.78, 0x91c6dc), -1.34, 0.92, 0);
      } else {
        const seatPad = new THREE.Mesh(
            new RoundedBoxGeometry(1.42, 0.25, 1.08, 6, 0.12),
            material(0xf5f5f0, 0.6),
          ),
          backPad = new THREE.Mesh(
            new RoundedBoxGeometry(1.45, 0.25, 1.08, 6, 0.12),
            material(0xf5f5f0, 0.6),
          ),
          leftRail = box(2.32, 0.26, 0.16, 0x83b9d3),
          rightRail = box(2.32, 0.26, 0.16, 0x83b9d3);
        seatPad.position.set(0.48, 0.84, 0);
        backPad.position.set(-0.66, 0.84, 0);
        leftRail.position.set(0, 0.84, -0.54);
        rightRail.position.set(0, 0.84, 0.54);
        treatmentBed.add(seatPad, backPad, leftRail, rightRail);
      }
      treatmentBed.position.copy(bedCentre);
      treatmentBed.rotation.y =
        bedYaw + (kind === "operating" || doorCentre.x > 0 ? Math.PI : 0);
      secondFloor.add(treatmentBed);

      const monitorCart = new THREE.Group(),
        cartBody = new THREE.Mesh(
          new RoundedBoxGeometry(0.75, 0.6, 0.62, 5, 0.1),
          material(0xf6f8f6),
        ),
        monitorFace = new THREE.Mesh(
          new RoundedBoxGeometry(0.15, 0.65, 0.78, 5, 0.08),
          material(0x315f7c, 0.42),
        );
      cartBody.position.y = 0.42;
      monitorFace.position.y = 1.08;
      monitorCart.add(cartBody, monitorFace);
      [0.16, 0, -0.16].forEach((z, index) =>
        put(
          monitorCart,
          box(0.025, 0.035, 0.47 - index * 0.05, index === 1 ? 0xf2c968 : CYAN),
          -0.09,
          1.1 + index * 0.1,
          z,
        ),
      );
      if (kind === "exam") {
        const controlPanel = box(0.5, 0.12, 0.72, 0xdbe6e4);
        controlPanel.position.set(0, 0.77, 0);
        controlPanel.rotation.z = 0.1;
        monitorCart.add(controlPanel);
        [-0.19, 0, 0.19].forEach((z) =>
          put(monitorCart, cyl(0.045, 0.06, 0x7896a2, 10), -0.27, 0.84, z),
        );
      }
      monitorCart.position.copy(
        bedCentre
          .clone()
          .addScaledVector(tan, kind === "operating" ? 2.65 : -1.75)
          .addScaledVector(out, kind === "operating" ? 0.8 : 0.85),
      );
      monitorCart.rotation.y = bedYaw;
      secondFloor.add(monitorCart);

      const cabinet = new THREE.Group();
      put(cabinet, box(0.8, 1.55, 2.15, 0xf2f5f2), 0, 0.78, 0);
      [-0.48, 0, 0.48].forEach((z) =>
        put(cabinet, box(0.05, 0.055, 0.9, 0x77a4b7), -0.43, 0.72, z),
      );
      cabinet.position.copy(
        doorCentre
          .clone()
          .addScaledVector(out, depth - 0.72)
          .addScaledVector(tan, width / 2 - 1.2),
      );
      cabinet.rotation.y = wallAngle;
      if (kind === "exam") secondFloor.add(cabinet);

      // Sink, storage and wall cabinets follow the soft clinical furniture in
      // the supplied references and make each room read as a working space.
      const clinicalCounter = new THREE.Group(),
        counterSpan = kind === "operating" ? width - 0.7 : 3.2,
        upperCabinetCount = kind === "operating" ? 9 : 3;
      put(clinicalCounter, new THREE.Mesh(
        new RoundedBoxGeometry(0.82, 0.82, counterSpan, 6, 0.12),
        material(0xf0eee8, 0.68),
      ), 0, 0.45, 0);
      put(clinicalCounter, new THREE.Mesh(
        new RoundedBoxGeometry(0.96, 0.12, counterSpan + 0.16, 6, 0.08),
        material(kind === "operating" ? 0xe2e0d8 : 0x9bc9c7, 0.58),
      ), -0.04, 0.92, 0);
      put(clinicalCounter, new THREE.Mesh(
        new RoundedBoxGeometry(0.17, 0.06, 0.72, 6, 0.04),
        material(0xb7c6c7, 0.48),
      ), -0.12, 0.99, 0.25);
      const faucet = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.035, 8, 18),
        material(0x87989c, 0.42),
      );
      faucet.rotation.y = Math.PI / 2;
      put(clinicalCounter, faucet, -0.34, 1.22, 0.25);
      Array.from({ length: upperCabinetCount }, (_, index) =>
        THREE.MathUtils.lerp(
          -counterSpan / 2 + 0.55,
          counterSpan / 2 - 0.55,
          index / (upperCabinetCount - 1),
        ),
      ).forEach((z, index) => {
        const upperCabinet = new THREE.Mesh(
          new RoundedBoxGeometry(0.48, 0.66, 0.92, 5, 0.08),
          material(index % 2 ? 0xa9c8ca : 0xf1eee8, 0.64),
        );
        upperCabinet.position.set(0.02, 2.05, z);
        clinicalCounter.add(upperCabinet);
      });
      clinicalCounter.position.copy(
        doorCentre
          .clone()
          .addScaledVector(out, depth - 0.5)
          .addScaledVector(tan, kind === "operating" ? 0 : -width * 0.12),
      );
      clinicalCounter.rotation.y =
        wallAngle + (doorCentre.x > 0 ? Math.PI : 0);
      secondFloor.add(clinicalCounter);

      const ivStand = new THREE.Group();
      put(ivStand, cyl(0.035, 2.15, 0x849398, 10), 0, 1.1, 0);
      [-0.32, 0, 0.32].forEach((angle) => {
        const leg = box(0.48, 0.055, 0.055, 0x849398);
        leg.position.set(Math.cos(angle) * 0.12, 0.06, Math.sin(angle) * 0.12);
        leg.rotation.y = angle;
        ivStand.add(leg);
      });
      put(ivStand, box(0.48, 0.04, 0.04, 0x849398), 0, 2.12, 0);
      [-0.2, 0.2].forEach((x) =>
        put(ivStand, cyl(0.035, 0.08, 0x849398, 10), x, 2.08, 0),
      );
      const fluidBag = new THREE.Mesh(
        new RoundedBoxGeometry(0.24, 0.48, 0.12, 5, 0.04),
        new THREE.MeshStandardMaterial({
          color: 0xc8edf0,
          transparent: true,
          opacity: 0.72,
          roughness: 0.28,
        }),
      );
      fluidBag.position.set(0.2, 1.82, 0);
      ivStand.add(fluidBag);
      ivStand.position.copy(
        bedCentre
          .clone()
          .addScaledVector(tan, kind === "operating" ? -1.05 : 1.8)
          .addScaledVector(out, kind === "operating" ? 1.05 : 0.85),
      );
      secondFloor.add(ivStand);

      if (kind === "operating") {
        const light = new THREE.Group(),
          stem = cyl(0.07, 1.15, 0xd9e3e1, 12),
          crossArm = box(1.6, 0.09, 0.09, 0xd9e3e1);
        stem.position.y = 2.72;
        crossArm.position.y = 3.25;
        light.add(stem, crossArm);
        [
          [0.78, -0.55],
          [0.78, 0.55],
          [1.2, 0],
        ].forEach(([x, z]) => {
          const lamp = new THREE.Mesh(
              new THREE.TorusGeometry(0.4, 0.1, 10, 24),
              material(0xa9c6d3, 0.44),
            ),
            centreLamp = cyl(0.15, 0.12, 0xfff4c8, 18);
          lamp.position.set(x, 3.03, z);
          lamp.rotation.x = Math.PI / 2;
          centreLamp.position.set(x, 3.03, z);
          light.add(lamp, centreLamp);
        });
        light.position.copy(bedCentre.clone().addScaledVector(out, -0.25));
        light.rotation.y = bedYaw;
        secondFloor.add(light);

        const anesthesia = new THREE.Group();
        put(anesthesia, new THREE.Mesh(
          new RoundedBoxGeometry(0.82, 0.9, 0.72, 6, 0.1),
          material(0xe9ece8, 0.62),
        ), 0, 0.5, 0);
        put(anesthesia, new THREE.Mesh(
          new RoundedBoxGeometry(0.18, 0.62, 0.86, 5, 0.07),
          material(0x315f7c, 0.4),
        ), -0.08, 1.28, 0);
        [-0.23, 0, 0.23].forEach((z) =>
          put(anesthesia, cyl(0.1, 0.48, 0xa9c8ca, 12), 0.42, 0.46, z),
        );
        anesthesia.position.copy(
          bedCentre
            .clone()
            .addScaledVector(tan, -2.5)
            .addScaledVector(out, -0.8),
        );
        anesthesia.rotation.y = bedYaw;
        secondFloor.add(anesthesia);

        const trolley = new THREE.Group();
        put(trolley, box(1.25, 0.1, 0.65, 0x9da5a6), 0, 0.8, 0);
        put(trolley, box(1.15, 0.08, 0.58, 0x7f898b), 0, 0.28, 0);
        [-0.48, 0.48].forEach((x) =>
          [-0.23, 0.23].forEach((z) =>
            put(trolley, cyl(0.035, 0.72, 0x6f8791, 10), x, 0.4, z),
          ),
        );
        trolley.position.copy(
          bedCentre
            .clone()
            .addScaledVector(tan, 2.45)
            .addScaledVector(out, -1.35),
        );
        trolley.rotation.y = bedYaw;
        secondFloor.add(trolley);

        // Wall services make the operating rooms feel clinically complete
        // without reducing the circulation zone around the operating table.
        const medicalRail = new THREE.Group();
        put(
          medicalRail,
          new THREE.Mesh(
            new RoundedBoxGeometry(0.14, 0.42, 3.3, 6, 0.07),
            material(0xe7ece9, 0.58),
          ),
          0,
          0,
          0,
        );
        [-1.12, -0.48, 0.18, 0.84].forEach((z, index) => {
          const port = cyl(
            0.105,
            0.075,
            [0x78b4c7, 0x72a36d, 0xf0c75e, 0xdb766c][index],
            18,
          );
          port.rotation.z = Math.PI / 2;
          put(medicalRail, port, -0.11, 0, z);
        });
        [1.25, 1.48].forEach((z) =>
          put(medicalRail, box(0.08, 0.18, 0.18, 0xffffff), -0.1, 0, z),
        );
        medicalRail.position.copy(
          doorCentre
            .clone()
            .addScaledVector(out, depth - 0.2)
            .addScaledVector(tan, -width * 0.24),
        );
        medicalRail.position.y = 1.68;
        medicalRail.rotation.y = wallAngle;
        secondFloor.add(medicalRail);

        const wallClock = new THREE.Group(),
          clockFace = cyl(0.28, 0.07, 0xf7f5ef, 24);
        clockFace.rotation.z = Math.PI / 2;
        wallClock.add(clockFace);
        [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((angle) => {
          const tick = box(0.03, 0.04, 0.07, 0x55717c);
          tick.position.set(-0.055, Math.sin(angle) * 0.2, Math.cos(angle) * 0.2);
          wallClock.add(tick);
        });
        const hourHand = box(0.04, 0.05, 0.14, 0x55717c),
          minuteHand = box(0.04, 0.05, 0.2, 0x55717c);
        hourHand.position.set(-0.06, 0.045, 0.04);
        hourHand.rotation.x = -0.55;
        minuteHand.position.set(-0.06, -0.015, -0.055);
        minuteHand.rotation.x = 0.78;
        wallClock.add(hourHand, minuteHand);
        wallClock.position.copy(
          doorCentre
            .clone()
            .addScaledVector(out, 0.22)
            .addScaledVector(tan, width * 0.36),
        );
        wallClock.position.y = 2.58;
        wallClock.rotation.y = wallAngle;
        secondFloor.add(wallClock);

        const dispenserRack = new THREE.Group();
        [0xe9f1ef, 0xb7d9dc, 0xf0eee8].forEach((color, index) =>
          put(
            dispenserRack,
            new THREE.Mesh(
              new RoundedBoxGeometry(0.18, 0.38, 0.42, 5, 0.06),
              material(color, 0.64),
            ),
            0,
            0,
            (index - 1) * 0.5,
          ),
        );
        dispenserRack.position.copy(
          doorCentre
            .clone()
            .addScaledVector(out, depth - 0.17)
            .addScaledVector(tan, width * 0.08),
        );
        dispenserRack.position.y = 1.65;
        dispenserRack.rotation.y = wallAngle;
        secondFloor.add(dispenserRack);

        const sterilePrep = new THREE.Group();
        put(
          sterilePrep,
          new THREE.Mesh(
            new RoundedBoxGeometry(1.55, 0.12, 0.82, 5, 0.06),
            material(0x929c9e, 0.42),
          ),
          0,
          0.86,
          0,
        );
        put(sterilePrep, box(1.42, 0.035, 0.7, 0xaed8e1), 0, 0.94, 0);
        [-0.55, 0.55].forEach((x) =>
          [-0.28, 0.28].forEach((z) =>
            put(sterilePrep, cyl(0.04, 0.76, 0x7d898c, 10), x, 0.44, z),
          ),
        );
        [-0.38, 0, 0.38].forEach((x, index) =>
          put(
            sterilePrep,
            cyl(0.09, 0.22 + index * 0.04, index === 1 ? 0xd7eee9 : 0xf2eee6, 14),
            x,
            1.08 + index * 0.02,
            0,
          ),
        );
        sterilePrep.position.copy(
          bedCentre
            .clone()
            .addScaledVector(tan, 3.65)
            .addScaledVector(out, 1.75),
        );
        sterilePrep.rotation.y = bedYaw;
        secondFloor.add(sterilePrep);

        const utilityCorner = new THREE.Group();
        put(
          utilityCorner,
          new THREE.Mesh(
            new RoundedBoxGeometry(0.64, 0.82, 0.58, 6, 0.11),
            material(0xd9e2df, 0.7),
          ),
          -0.44,
          0.42,
          0,
        );
        put(utilityCorner, box(0.58, 0.08, 0.52, 0x78949b), -0.44, 0.86, 0);
        const linenHamper = cyl(0.34, 0.72, 0xc7d8d5, 18);
        put(utilityCorner, linenHamper, 0.42, 0.36, 0);
        put(utilityCorner, cyl(0.36, 0.08, 0x78949b, 18), 0.42, 0.75, 0);
        put(utilityCorner, box(0.82, 0.16, 0.48, 0xaab6b7), 0, 0.1, 0.92);
        utilityCorner.position.copy(
          doorCentre
            .clone()
            .addScaledVector(out, 1.1)
            .addScaledVector(tan, width / 2 - 0.75),
        );
        utilityCorner.rotation.y = bedYaw;
        secondFloor.add(utilityCorner);

        // Operating room 2 receives a compact imaging/endoscopy tower so the
        // two operating rooms retain distinct functions and silhouettes.
        if (doorCentre.x > 0) {
          const imagingTower = new THREE.Group();
          put(
            imagingTower,
            new THREE.Mesh(
              new RoundedBoxGeometry(0.78, 1.52, 0.66, 6, 0.09),
              material(0xe9ece8, 0.6),
            ),
            0,
            0.82,
            0,
          );
          put(
            imagingTower,
            new THREE.Mesh(
              new RoundedBoxGeometry(0.16, 0.72, 0.88, 5, 0.07),
              material(0x294e64, 0.38),
            ),
            -0.32,
            1.75,
            0,
          );
          [0.16, 0, -0.16].forEach((z, index) =>
            put(
              imagingTower,
              box(0.025, 0.035, 0.48 - index * 0.04, index === 1 ? 0xf2c968 : CYAN),
              -0.42,
              1.74 + index * 0.1,
              z,
            ),
          );
          [-0.24, 0, 0.24].forEach((z) =>
            put(imagingTower, box(0.08, 0.2, 0.18, 0x6d858e), -0.42, 0.78, z),
          );
          imagingTower.position.copy(
            bedCentre
              .clone()
              .addScaledVector(tan, -4.35)
              .addScaledVector(out, 1.65),
          );
          imagingTower.rotation.y = bedYaw;
          secondFloor.add(imagingTower);
        }
      } else {
        stool(secondFloor, bedCentre.x + tan.x * 1.35, bedCentre.z + tan.z * 1.35, CYAN, bedYaw);
        const privacy = new THREE.Group();
        put(privacy, box(2.5, 0.06, 0.06, 0x879b9f), 0, 2.72, 0);
        [-0.94, -0.47, 0, 0.47, 0.94].forEach((x, index) =>
          put(
            privacy,
            new THREE.Mesh(
              new RoundedBoxGeometry(0.44, 1.55, 0.04, 4, 0.025),
              material(index % 2 ? 0xb8d9dc : 0x87bdca, 0.78),
            ),
            x,
            1.9,
            0,
          ),
        );
        privacy.position.copy(
          bedCentre.clone().addScaledVector(tan, -2.55).addScaledVector(out, 1.65),
        );
        privacy.rotation.y = bedYaw;
        secondFloor.add(privacy);

        const diagnosticRack = new THREE.Group();
        put(diagnosticRack, box(0.16, 0.48, 1.35, 0xf0eee8), 0, 0, 0);
        [-0.43, 0, 0.43].forEach((z, index) => {
          put(diagnosticRack, cyl(0.08, 0.34, index === 1 ? 0x4e6671 : 0x7796a2, 10), -0.12, -0.12, z);
          put(diagnosticRack, box(0.32, 0.035, 0.035, 0x4e6671), -0.23, -0.38, z);
        });
        diagnosticRack.position.copy(
          doorCentre
            .clone()
            .addScaledVector(out, depth - 0.2)
            .addScaledVector(tan, width * 0.27),
        );
        diagnosticRack.position.y = 1.82;
        diagnosticRack.rotation.y = wallAngle;
        secondFloor.add(diagnosticRack);
      }
      secondFloorInteriorObjects.push(
        ...secondFloor.children.slice(roomInteriorStart),
      );
    };

    addUpperRoom(
      "手術室 1",
      "OPERATING ROOM 1",
      leftOperatingDoor,
      clinicOuts[0],
      clinicTangents[0],
      -FAN_ANGLE,
      11.25,
      7.35,
      "operating",
      BLUE,
      1,
    );
    addUpperRoom(
      "手術室 2",
      "OPERATING ROOM 2",
      rightOperatingDoor,
      clinicOuts[2],
      clinicTangents[2],
      FAN_ANGLE,
      11.25,
      7.35,
      "operating",
      BLUE,
      2,
    );
    addUpperRoom(
      "檢查室",
      "EXAMINATION ROOM",
      clinicDoorPoints[4],
      clinicOuts[4],
      clinicTangents[4],
      FAN_ANGLE,
      5.9,
      7.35,
      "exam",
      CYAN,
    );

    // From the third floor, the rooms below read as closed architectural
    // volumes rather than open dollhouse sets. Their perimeter walls extend
    // upward to meet the underside of the existing 3F slab; no extra horizontal
    // ceiling plate is inserted between floors. A shallow wall-colored backstop
    // behind each door prevents a moving leaf from exposing the live room set.
    const secondFloorPrivacyShell = new THREE.Group();
    secondFloorPrivacyShell.visible = false;
    const addSecondFloorPrivacyShell = (
      doorCentre: THREE.Vector3,
      out: THREE.Vector3,
      tan: THREE.Vector3,
      wallAngle: number,
      width: number,
      depth: number,
      doorOpening: number,
    ) => {
      // Match the 1F-to-2F shell strategy: every connector starts at the true
      // top of the wall below and reaches the exact 3F wall baseline. The
      // former one-size 1.36 m band began above the shorter room walls and
      // left the large gaps visible around the operating/examination rooms.
      const connectedTopY = SECOND_FLOOR_Y + 0.08,
        frontStartY = 3.58,
        backStartY = 2.68,
        sideStartY = 2.28,
        frontHeight = connectedTopY - frontStartY,
        backHeight = connectedTopY - backStartY,
        sideHeight = connectedTopY - sideStartY,
        frontExtension = box(0.32, frontHeight, width, CREAM),
        backExtension = box(0.32, backHeight, width, CREAM),
        doorwayBackstop = box(0.34, frontStartY, doorOpening + 0.16, CREAM);
      frontExtension.position.copy(doorCentre);
      frontExtension.position.y = frontStartY + frontHeight / 2;
      frontExtension.rotation.y = wallAngle;
      backExtension.position.copy(
        doorCentre.clone().addScaledVector(out, depth),
      );
      backExtension.position.y = backStartY + backHeight / 2;
      backExtension.rotation.y = wallAngle;
      [frontExtension, backExtension].forEach((wall) => {
        wall.castShadow = true;
        wall.receiveShadow = true;
        secondFloorPrivacyShell.add(wall);
      });
      [-1, 1].forEach((side) => {
        const sideExtension = box(depth, sideHeight, 0.3, CREAM);
        sideExtension.position.copy(
          doorCentre
            .clone()
            .addScaledVector(out, depth / 2)
            .addScaledVector(tan, side * width / 2),
        );
        sideExtension.position.y = sideStartY + sideHeight / 2;
        sideExtension.rotation.y = wallAngle;
        sideExtension.castShadow = true;
        sideExtension.receiveShadow = true;
        secondFloorPrivacyShell.add(sideExtension);
      });
      doorwayBackstop.position.copy(
        doorCentre.clone().addScaledVector(out, 0.22),
      );
      doorwayBackstop.position.y = frontStartY / 2;
      doorwayBackstop.rotation.y = wallAngle;
      doorwayBackstop.castShadow = true;
      doorwayBackstop.receiveShadow = true;
      secondFloorPrivacyShell.add(doorwayBackstop);
    };
    addSecondFloorPrivacyShell(
      leftOperatingDoor,
      clinicOuts[0],
      clinicTangents[0],
      -FAN_ANGLE,
      11.25,
      7.35,
      2.8,
    );
    addSecondFloorPrivacyShell(
      rightOperatingDoor,
      clinicOuts[2],
      clinicTangents[2],
      FAN_ANGLE,
      11.25,
      7.35,
      2.8,
    );
    addSecondFloorPrivacyShell(
      clinicDoorPoints[4],
      clinicOuts[4],
      clinicTangents[4],
      FAN_ANGLE,
      5.9,
      7.35,
      2.05,
    );
    secondFloor.add(secondFloorPrivacyShell);

    // THIRD FLOOR ----------------------------------------------------------
    // The inpatient floor reuses the exact room footprints from 2F: wards 1
    // and 2 match the operating rooms, while ward 3 matches the examination
    // room.  It remains a separate group so floor switching never exposes the
    // clinical teams or waiting furniture below.
    const thirdBaseGeometry = new THREE.ExtrudeGeometry(fanShape.clone(), {
        depth: 0.48,
        bevelEnabled: true,
        bevelSize: 0.14,
        bevelThickness: 0.1,
        bevelSegments: 3,
      }),
      thirdSurfaceGeometry = new THREE.ShapeGeometry(fanShape.clone(), 24);
    thirdBaseGeometry.rotateX(-Math.PI / 2);
    thirdSurfaceGeometry.rotateX(-Math.PI / 2);
    const thirdBase = new THREE.Mesh(
        thirdBaseGeometry,
        material(0xdfe9e7),
      ),
      thirdSurface = new THREE.Mesh(
        thirdSurfaceGeometry,
        material(0xf7f4ed),
      );
    thirdBase.position.y = -0.55;
    thirdBase.castShadow = true;
    thirdBase.receiveShadow = true;
    thirdSurface.position.y = 0.02;
    thirdSurface.receiveShadow = true;
    thirdFloor.add(thirdBase, thirdSurface);

    // Only a shallow inter-storey fascia sits below 3F. The previous full-height
    // envelope hid the 2F operating/examination walls from the 3F camera; this
    // band closes the structural gap while leaving both lower floors readable.
    const thirdFloorFasciaHeight = 1.62;
    [-1, 1].forEach((side) => {
      const z1 = -8.35,
        z2 = 7.15,
        z = (z1 + z2) / 2,
        length = (z2 - z1) * Math.sqrt(1 + FAN_SLOPE * FAN_SLOPE),
        lowerWall = box(0.42, thirdFloorFasciaHeight, length, CREAM);
      lowerWall.position.set(
        sideX(side, z),
        -thirdFloorFasciaHeight / 2,
        z,
      );
      lowerWall.rotation.y = side * FAN_ANGLE;
      thirdFloor.add(lowerWall);
    });
    const thirdLowerRear = box(11.6, thirdFloorFasciaHeight, 0.42, CREAM);
    thirdLowerRear.position.set(0, -thirdFloorFasciaHeight / 2, -8.48);
    thirdFloor.add(thirdLowerRear);

    const thirdRearWall = box(11.4, 3.7, 0.34, CREAM);
    thirdRearWall.position.set(0, 1.85, -8.48);
    thirdFloor.add(thirdRearWall);
    // The courtyard now reaches the street-facing facade. Keep only the two
    // short existing glazing bays beside the elevator and Ward 3; the broad
    // centre span is completed below as an open railing, so the outer windows
    // and the trapezoidal courtyard read as one continuous white-frame system.
    const thirdFloorWindowFrameColor = 0xf5f1e9,
      // v224 extends both railing ends outward by 0.5 m from v223.
      courtyardFacadeHalf = 10.82,
      facadeOuterHalf = 13.92,
      addThirdFloorFacadeGlass = (fromX: number, toX: number) => {
        const width = toX - fromX,
          centreX = (fromX + toX) / 2,
          glass = new THREE.Mesh(
            new THREE.PlaneGeometry(width - 0.06, 3.4),
            upperGlassMaterial,
          ),
          bottomRail = box(width, 0.18, 0.2, thirdFloorWindowFrameColor),
          topRail = box(width, 0.22, 0.22, thirdFloorWindowFrameColor);
        glass.position.set(centreX, 1.75, 7.72);
        glass.renderOrder = 3;
        bottomRail.position.set(centreX, 0.12, 7.7);
        topRail.position.set(centreX, 3.58, 7.7);
        thirdFloor.add(glass, bottomRail, topRail);
        [fromX, toX].forEach((x) => {
          const mullion = box(0.16, 3.5, 0.18, thirdFloorWindowFrameColor);
          mullion.position.set(x, 1.82, 7.7);
          thirdFloor.add(mullion);
        });
      };
    addThirdFloorFacadeGlass(-facadeOuterHalf, -courtyardFacadeHalf);
    addThirdFloorFacadeGlass(courtyardFacadeHalf, facadeOuterHalf);
    [-1, 1].forEach((side) => addUpperFacadeReturn(thirdFloor, side));

    const addThirdWingWall = (side: number, z1: number, z2: number) => {
        if (z2 <= z1) return;
        const z = (z1 + z2) / 2,
          length = (z2 - z1) * Math.sqrt(1 + FAN_SLOPE * FAN_SLOPE),
          wall = box(0.4, 3.7, length, CREAM);
        wall.position.set(sideX(side, z), 1.85, z);
        wall.rotation.y = side * FAN_ANGLE;
        thirdFloor.add(wall);
      },
      buildThirdWing = (
        side: number,
        openings: { z: number; half: number }[],
      ) => {
        let start = -8.35;
        [...openings]
          .sort((a, b) => a.z - b.z)
          .forEach(({ z, half }) => {
            addThirdWingWall(side, start, z - half);
            start = z + half;
          });
        addThirdWingWall(side, start, 7.15);
      };
    // Match the wall cut-out to the frame's true outer edge. A small overlap
    // behind each rounded post prevents daylight gaps at oblique angles.
    buildThirdWing(-1, [{ z: leftOperatingDoor.z, half: 0.94 }]);
    buildThirdWing(1, [
      { z: rightOperatingDoor.z, half: 0.94 },
      { z: clinicDoorPoints[4].z, half: 0.94 },
    ]);

    type WardBedSlot = {
      room: number;
      index: number;
      bedCentre: THREE.Vector3;
      bedYaw: number;
      bedForward: THREE.Vector3;
      bedSide: THREE.Vector3;
      cabinetSide: number;
      doorCentre: THREE.Vector3;
      out: THREE.Vector3;
      tan: THREE.Vector3;
      doorIndex: number;
      ivStand: THREE.Group;
      overbed: THREE.Group;
    };
    const wardBedSlots: WardBedSlot[] = [],
      thirdFloorContentScale = 0.9,
      shrinkThirdFloorContent = (object: THREE.Object3D) => {
        object.scale.multiplyScalar(thirdFloorContentScale);
        return object;
      };

    const addWardBed = (
      bedCentre: THREE.Vector3,
      bedYaw: number,
      accent: number,
      cabinetSide: number,
    ) => {
      const bedForward = new THREE.Vector3(
          Math.cos(bedYaw),
          0,
          -Math.sin(bedYaw),
        ),
        bedSide = new THREE.Vector3(
          Math.sin(bedYaw),
          0,
          Math.cos(bedYaw),
        ),
        bed = new THREE.Group(),
        bedFrame = new THREE.Mesh(
          new RoundedBoxGeometry(2.72, 0.3, 1.16, 7, 0.12),
          material(0xd9e3e3, 0.56),
        ),
        mattress = new THREE.Mesh(
          new RoundedBoxGeometry(2.5, 0.24, 1.07, 7, 0.12),
          material(0xf8f7f1, 0.64),
        ),
        blanket = new THREE.Mesh(
          new RoundedBoxGeometry(1.35, 0.13, 1.02, 6, 0.08),
          material(accent, 0.62),
        ),
        pillow = new THREE.Mesh(
          new RoundedBoxGeometry(0.62, 0.16, 0.82, 8, 0.16),
          material(0xffffff, 0.74),
        );
      bedFrame.position.y = 0.48;
      mattress.position.y = 0.75;
      blanket.position.set(-0.34, 0.91, 0);
      pillow.position.set(0.84, 0.93, 0);
      bed.add(bedFrame, mattress, blanket, pillow);
      [
        [1.3, 0x87aabc],
        [-1.3, 0x7ea2b5],
      ].forEach(([x, color]) => {
        const board = new THREE.Mesh(
          new RoundedBoxGeometry(0.16, 0.82, 1.28, 7, 0.16),
          material(color, 0.58),
        );
        board.position.set(x as number, 0.72, 0);
        bed.add(board);
      });
      [-0.1, 0.56].forEach((x) =>
        [-0.59, 0.59].forEach((z) => {
          const rail = box(1.06, 0.25, 0.075, 0x8aa9b6);
          rail.position.set(x, 0.96, z);
          bed.add(rail);
        }),
      );
      [-1.02, 1.02].forEach((x) =>
        [-0.46, 0.46].forEach((z) => {
          const wheel = cyl(0.09, 0.08, 0x53646c, 14);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(x, 0.2, z);
          bed.add(wheel);
        }),
      );
      const overbed = new THREE.Group(),
        overbedTop = new THREE.Mesh(
          new RoundedBoxGeometry(0.72, 0.09, 1.28, 6, 0.08),
          material(0xe1b875, 0.5),
        );
      overbedTop.position.y = 1.12;
      overbed.add(overbedTop);
      [-0.48, 0.48].forEach((z) =>
        put(overbed, cyl(0.035, 0.66, 0x7c9098, 10), 0.25, 0.77, z),
      );
      // Local -X is the foot end. Keep the tabletop close enough for a patient
      // to use while leaving the head and pillow visually clear.
      overbed.position.x = -1.02;
      bed.add(overbed);
      bed.position.copy(bedCentre);
      bed.rotation.y = bedYaw;
      shrinkThirdFloorContent(bed);
      thirdFloor.add(bed);

      const cabinet = new THREE.Group(),
        cabinetBody = new THREE.Mesh(
          new RoundedBoxGeometry(0.72, 0.82, 0.64, 7, 0.12),
          material(0xe9efec, 0.66),
        ),
        cabinetTop = new THREE.Mesh(
          new RoundedBoxGeometry(0.78, 0.12, 0.7, 7, 0.11),
          material(0xe1b875, 0.5),
        );
      cabinetBody.position.y = 0.48;
      cabinetTop.position.y = 0.93;
      cabinet.add(cabinetBody, cabinetTop);
      [0.36, 0.62].forEach((y) => {
        put(cabinet, box(0.05, 0.055, 0.34, 0x6f95a8), -0.37, y, 0);
      });
      cabinet.position.copy(
        bedCentre
          .clone()
          .addScaledVector(bedForward, 0.78)
          .addScaledVector(bedSide, cabinetSide * 1.02),
      );
      cabinet.rotation.y = bedYaw;
      shrinkThirdFloorContent(cabinet);
      thirdFloor.add(cabinet);
      return { bed, overbed, bedForward, bedSide };
    };

    type WardSwingDoor = {
      pivots: Array<{ pivot: THREE.Group; side: number; closedYaw: number }>;
      openAmount: number;
      openTarget: 0 | 1;
    };
    const wardSwingDoors: WardSwingDoor[] = [];

    const addWardRoom = (
      title: string,
      subtitle: string,
      doorCentre: THREE.Vector3,
      out: THREE.Vector3,
      tan: THREE.Vector3,
      wallAngle: number,
      width: number,
      depth: number,
      bedCount: 2 | 3,
      accent: number,
      wallOptions: {
        omitSide?: -1 | 1;
        positiveSideOffsetX?: number;
      } = {},
    ) => {
      const roomFloor = box(depth, 0.1, width, 0xe8f1f2),
        backWall = box(0.3, 2.82, width, CREAM),
        // A wide single hospital door replaces the former paired leaves.
        doorOpening = 1.55;
      roomFloor.position.copy(doorCentre.clone().addScaledVector(out, depth / 2));
      roomFloor.position.y = 0.06;
      roomFloor.rotation.y = wallAngle;
      backWall.position.copy(doorCentre.clone().addScaledVector(out, depth));
      backWall.position.y = 1.41;
      backWall.rotation.y = wallAngle;
      thirdFloor.add(roomFloor, backWall);
      ([-1, 1] as const).forEach((side) => {
        // Ward 3 shares Ward 2's east-side partition. Omitting the duplicate
        // west wall releases the bedside-cabinet clearance without opening the
        // two rooms to one another.
        if (side === wallOptions.omitSide) return;
        const sideOffsetX =
            side === 1 ? wallOptions.positiveSideOffsetX ?? 0 : 0,
          // A negative world-X offset also pulls the wall's door-side end
          // beyond the front wall. Clip only that overhang and advance the
          // shortened wall by half the trimmed distance so its front edge
          // finishes flush with the door-side wall plane.
          doorSideOverhang = Math.max(0, -sideOffsetX * out.x),
          sideWallLength = Math.max(0.4, depth - doorSideOverhang),
          sideWall = box(sideWallLength, 2.4, 0.26, CREAM);
        sideWall.position.copy(
          doorCentre
            .clone()
            .addScaledVector(out, depth / 2 + doorSideOverhang / 2)
            .addScaledVector(tan, (side * width) / 2),
        );
        sideWall.position.x += sideOffsetX;
        sideWall.position.y = 1.2;
        sideWall.rotation.y = wallAngle;
        thirdFloor.add(sideWall);

        if (side === 1 && sideOffsetX < 0) {
          // Moving the Ward 2 / Ward 3 partition west also separates its deep
          // end from Ward 2's north wall. Bridge the two real endpoints with a
          // full-height cap instead of leaving a diagonal daylight gap between
          // the rooms.
          const nominalNorthCorner = doorCentre
              .clone()
              .addScaledVector(out, depth)
              .addScaledVector(tan, width / 2),
            shiftedNorthCorner = nominalNorthCorner
              .clone()
              .add(new THREE.Vector3(sideOffsetX, 0, 0)),
            sealDirection = nominalNorthCorner
              .clone()
              .sub(shiftedNorthCorner)
              .setY(0),
            northSeal = box(
              sealDirection.length() + 0.5,
              2.82,
              0.34,
              CREAM,
            );
          northSeal.position
            .copy(nominalNorthCorner)
            .add(shiftedNorthCorner)
            .multiplyScalar(0.5);
          northSeal.position.y = 1.41;
          northSeal.rotation.y = Math.atan2(
            -sealDirection.z,
            sealDirection.x,
          );
          northSeal.castShadow = true;
          northSeal.receiveShadow = true;
          thirdFloor.add(northSeal);
        }
      });

      const frameOffset = doorOpening / 2 + 0.18;
      [-1, 1].forEach((side) => {
        const post = new THREE.Mesh(
          new RoundedBoxGeometry(0.36, 3.08, 0.42, 8, 0.17),
          material(accent, 0.55),
        );
        post.position.copy(
          doorCentre.clone().addScaledVector(tan, side * frameOffset),
        );
        post.position.y = 1.54;
        post.rotation.y = wallAngle;
        post.castShadow = true;
        post.receiveShadow = true;
        thirdFloor.add(post);
      });
      const lintel = new THREE.Mesh(
        new RoundedBoxGeometry(0.42, 0.5, doorOpening + 0.72, 8, 0.2),
        material(accent, 0.55),
      );
      lintel.position.copy(doorCentre);
      lintel.position.y = 2.92;
      lintel.rotation.y = wallAngle;
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      thirdFloor.add(lintel);
      const swingDoor: WardSwingDoor = {
        pivots: [],
        openAmount: 0,
        openTarget: 0,
      };
      const wardDoorIndex = wardSwingDoors.length,
        // Ward 1 uses a left-side hinge from the corridor view so its handle
        // sits on the requested right side. Other wards keep their established
        // hinge placement; every door still derives a mirrored inward swing.
        hingeSide = title === "病房 1" ? 1 : -1,
        leafDirection = -hingeSide,
        localPositiveX = new THREE.Vector3(
          Math.cos(wallAngle),
          0,
          -Math.sin(wallAngle),
        ),
        // The decorative face is independent of the hinge and swing side: it
        // must always sit on the side facing away from the room interior.
        corridorFaceDirection =
          -(Math.sign(localPositiveX.dot(out)) || 1),
        swingDirection =
          hingeSide * (Math.sign(localPositiveX.dot(out)) || 1),
        leafWidth = doorOpening - 0.06,
        pivot = new THREE.Group(),
        leaf = new THREE.Mesh(
          new RoundedBoxGeometry(0.12, 2.68, leafWidth, 6, 0.08),
          material(0x9ab8c7, 0.54),
        ),
        visionPanel = new THREE.Mesh(
          new RoundedBoxGeometry(0.135, 0.92, 0.38, 5, 0.07),
          new THREE.MeshPhysicalMaterial({
            color: 0xbde4ea,
            transparent: true,
            opacity: 0.48,
            roughness: 0.2,
            transmission: 0.2,
            side: THREE.DoubleSide,
          }),
        );
      leaf.position.set(0, 1.36, leafDirection * leafWidth / 2);
      // Keep the vision-panel trim and handle on the corridor-facing side of
      // every mirrored door while retaining the existing inward swing.
      visionPanel.position.set(
        corridorFaceDirection * 0.075,
        1.68,
        leafDirection * leafWidth * 0.56,
      );
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      visionPanel.castShadow = true;
      pivot.add(leaf, visionPanel);
      const handle = cyl(0.045, 0.16, 0x647b84, 12);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(
        corridorFaceDirection * 0.12,
        1.25,
        leafDirection * (leafWidth - 0.2),
      );
      pivot.add(handle);
      pivot.position.copy(
        doorCentre.clone().addScaledVector(tan, hingeSide * doorOpening / 2),
      );
      pivot.rotation.y = wallAngle;
      pivot.userData = {
        interactive: "wardDoor",
        wardDoorIndex,
        floor: 3,
      };
      [leaf, visionPanel, handle].forEach((object) => {
        object.userData.hitRoot = pivot;
        object.userData.floor = 3;
        interactive.push(object);
      });
      swingDoor.pivots.push({
        pivot,
        side: swingDirection,
        closedYaw: wallAngle,
      });
      thirdFloor.add(pivot);
      wardSwingDoors.push(swingDoor);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(bedCount === 3 ? 2.3 : 2.05, 0.72),
        new THREE.MeshBasicMaterial({
          map: canvasTexture(title, subtitle),
          side: THREE.DoubleSide,
          transparent: true,
        }),
      );
      sign.position.copy(doorCentre.clone().addScaledVector(out, -0.12));
      sign.position.y = 3.48;
      sign.rotation.y =
        wallAngle + Math.PI / 2 + (doorCentre.x > 0 ? Math.PI : 0);
      sign.castShadow = true;
      sign.receiveShadow = true;
      shrinkThirdFloorContent(sign);
      thirdFloor.add(sign);

      const bedYaw = Math.atan2(-out.z, out.x),
        bedSide = new THREE.Vector3(
          Math.sin(bedYaw),
          0,
          Math.cos(bedYaw),
        ),
        isWardOne = title === "病房 1",
        isWardTwo = title === "病房 2",
        lateralOffsets =
          bedCount === 3
            ? isWardOne
              ? [-(width / 2 - 1.6), 0, width / 2 - 1.6]
              : [-width * 0.29, 0, width * 0.29]
            : [-width * 0.245, width * 0.245];
      lateralOffsets.forEach((lateral, index) => {
        const bedLateral =
            isWardTwo && index === 0 ? lateral - 0.8 : lateral,
          cabinetSide =
            bedLateral === 0
              ? 1
              : Math.sign(bedLateral) * Math.sign(bedSide.dot(tan)),
          bedCentre = doorCentre
          .clone()
          // The headboard now sits within roughly 25 cm of the north/back wall
          // instead of floating in the centre of the room. Ward 2's left bed
          // and all bed-derived equipment move together toward its side wall.
          .addScaledVector(out, depth - 1.62)
          .addScaledVector(tan, bedLateral);
        const bedAssets = addWardBed(
          bedCentre,
          bedYaw,
          index % 2 ? 0x78b8d4 : 0x69a9cc,
          cabinetSide,
        );

        const headwall = new THREE.Group(),
          // The mirrored left room needs its controls on local +X; the two
          // right rooms face local -X. This keeps every panel facing the room.
          headwallFace = doorCentre.x < 0 ? 1 : -1,
          panel = new THREE.Mesh(
            new RoundedBoxGeometry(0.14, 0.42, bedCount === 3 ? 2.35 : 2.15, 6, 0.07),
            material(0xdce9e8, 0.58),
          );
        // Keep the complete outlet assembly together: the long horizontal
        // backboard follows the sockets and gas ports 20 cm downward.
        panel.position.y = -0.2;
        headwall.add(panel);
        [-0.76, -0.38].forEach((z) => {
          const port = cyl(0.105, 0.075, z < -0.5 ? 0x74b7c7 : 0x72a36d, 18);
          port.rotation.z = Math.PI / 2;
          put(headwall, port, headwallFace * 0.11, -0.2, z);
        });
        [-0.02, 0.34, 0.7].forEach((z, portIndex) =>
          put(
            headwall,
            box(
              0.08,
              0.2,
              0.2,
              portIndex === 0 ? 0xf1c85d : 0xffffff,
            ),
            headwallFace * 0.11,
            -0.2,
            z,
          ),
        );
        const monitor = new THREE.Mesh(
          new RoundedBoxGeometry(0.15, 0.56, 0.62, 5, 0.08),
          material(0x315f7c, 0.4),
        );
        monitor.position.set(headwallFace * 0.12, 0.34, 0.92);
        headwall.add(monitor);
        [-0.12, 0, 0.12].forEach((z, lineIndex) =>
          put(
            headwall,
            box(0.025, 0.028, 0.36 - lineIndex * 0.04, lineIndex === 1 ? 0xf0c75e : CYAN),
            headwallFace * 0.2,
            0.34 + lineIndex * 0.08,
            0.92 + z,
          ),
        );
        const lamp = new THREE.Mesh(
          new RoundedBoxGeometry(0.16, 0.16, 1.28, 6, 0.08),
          new THREE.MeshStandardMaterial({
            color: 0xfff3cb,
            emissive: 0xffd98a,
            emissiveIntensity: 1.25,
            roughness: 0.36,
          }),
        );
        lamp.position.set(headwallFace * 0.1, 0.94, 0);
        headwall.add(lamp);
        // Electronic bedside identification card, vertically centred between
        // the lower outlets and the bed-head lamp. The shallow screen faces
        // into the room on both mirrored ward walls.
        const bedsideCard = new THREE.Mesh(
          new RoundedBoxGeometry(0.15, 0.54, 0.74, 6, 0.07),
          material(0x315f7c, 0.34),
        );
        bedsideCard.position.set(headwallFace * 0.13, 0.46, 0.02);
        headwall.add(bedsideCard);
        put(
          headwall,
          box(0.025, 0.435, 0.6, 0xe7f5f5),
          headwallFace * 0.22,
          0.46,
          0.02,
        );
        [-0.13, -0.04, 0.05, 0.13].forEach((z, row) =>
          put(
            headwall,
            box(
              0.018,
              row === 0 ? 0.035 : 0.024,
              row === 0 ? 0.3 : 0.38,
              row === 0
                ? 0x44bddb
                : row === 1
                  ? 0x5177ba
                  : row === 2
                    ? 0x79b8a9
                    : 0xe2b66e,
            ),
            headwallFace * 0.24,
            0.62 - row * 0.11,
            0.02 + z,
          ),
        );
        headwall.position.copy(
          doorCentre
            .clone()
            .addScaledVector(out, depth - 0.18)
            .addScaledVector(tan, bedLateral),
        );
        headwall.position.y = 1.55;
        headwall.rotation.y = wallAngle;
        shrinkThirdFloorContent(headwall);
        thirdFloor.add(headwall);

        const ivStand = new THREE.Group();
        put(ivStand, cyl(0.03, 2.05, 0x82949b, 10), 0, 1.04, 0);
        put(ivStand, box(0.44, 0.04, 0.04, 0x82949b), 0, 2.04, 0);
        const bag = new THREE.Mesh(
          new RoundedBoxGeometry(0.22, 0.42, 0.11, 5, 0.04),
          new THREE.MeshStandardMaterial({
            color: 0xc8edf0,
            transparent: true,
            opacity: 0.72,
            roughness: 0.28,
          }),
        );
        bag.position.set(0.16, 1.76, 0);
        ivStand.add(bag);
        ivStand.position.copy(
          bedCentre
            .clone()
            // Keep the IV stand opposite the bedside cabinet.
            .addScaledVector(bedSide, cabinetSide * -1.02)
            // Park it toward the north/head wall so the bedside inspection
            // lane remains clear after the patient returns to bed.
            .addScaledVector(out, 0.82),
        );
        [-0.24, 0.24].forEach((offset) =>
          put(ivStand, box(0.56, 0.035, 0.035, 0x82949b), 0, 0.08, offset),
        );
        [-0.24, 0.24].forEach((x) =>
          [-0.18, 0.18].forEach((z) => {
            const wheel = cyl(0.045, 0.035, 0x52636b, 10);
            wheel.rotation.z = Math.PI / 2;
            put(ivStand, wheel, x, 0.035, z);
          }),
        );
        shrinkThirdFloorContent(ivStand);
        thirdFloor.add(ivStand);
        wardBedSlots.push({
          room: title === "病房 1" ? 1 : title === "病房 2" ? 2 : 3,
          index,
          bedCentre: bedCentre.clone(),
          bedYaw,
          bedForward: bedAssets.bedForward.clone(),
          bedSide: bedAssets.bedSide.clone(),
          cabinetSide,
          doorCentre: doorCentre.clone(),
          out: out.clone(),
          tan: tan.clone(),
          doorIndex: wardDoorIndex,
          ivStand,
          overbed: bedAssets.overbed,
        });
      });

      for (let index = 0; index < lateralOffsets.length - 1; index++) {
        const dividerBase =
            (lateralOffsets[index] + lateralOffsets[index + 1]) / 2,
          // Apply the latest offsets from the rendered-room directions: Ward 1
          // moves both curtains 25 cm right from v286, while Ward 2 moves its
          // left curtain 50 cm right from the previous 80 cm left position.
          divider =
            isWardOne && index === 0
              ? dividerBase + 0.25
              : isWardOne && index === 1
                ? dividerBase - 0.05
                : isWardTwo && index === 0
                  ? dividerBase - 0.3
                  : dividerBase,
          track = box(depth - 1.0, 0.06, 0.06, 0x81959d);
        track.position.copy(
          doorCentre
            .clone()
            .addScaledVector(out, depth / 2 + 0.35)
            .addScaledVector(tan, divider),
        );
        track.position.y = 3.18;
        track.rotation.y = wallAngle;
        shrinkThirdFloorContent(track);
        thirdFloor.add(track);
        for (let pleat = 0; pleat < 7; pleat++) {
          const curtain = new THREE.Mesh(
            new RoundedBoxGeometry(0.5, 2.82, 0.055, 4, 0.025),
            material(pleat % 2 ? 0x78b9d5 : 0x67a8ca, 0.72),
          );
          curtain.position.copy(
            doorCentre
              .clone()
              .addScaledVector(out, depth * 0.48 + pleat * 0.47)
              .addScaledVector(tan, divider),
          );
          curtain.position.y = 1.72;
          curtain.rotation.y = wallAngle;
          curtain.castShadow = true;
          curtain.receiveShadow = true;
          shrinkThirdFloorContent(curtain);
          thirdFloor.add(curtain);
        }
      }
    };

    addWardRoom(
      "病房 1",
      "WARD 1 · 3 BEDS",
      leftOperatingDoor,
      clinicOuts[0],
      clinicTangents[0],
      -FAN_ANGLE,
      11.25,
      7.35,
      3,
      0x6ba9c8,
    );
    addWardRoom(
      "病房 2",
      "WARD 2 · 3 BEDS",
      rightOperatingDoor,
      clinicOuts[2],
      clinicTangents[2],
      FAN_ANGLE,
      11.25,
      7.35,
      3,
      0x6ba9c8,
      // v220: move the Ward 2 / Ward 3 shared partition another 0.8 m west
      // from its v215 position (1.3 m west in total).
      { positiveSideOffsetX: -1.3 },
    );
    addWardRoom(
      "病房 3",
      "WARD 3 · 2 BEDS",
      clinicDoorPoints[4],
      clinicOuts[4],
      clinicTangents[4],
      FAN_ANGLE,
      5.9,
      7.35,
      2,
      0x74bdb8,
      { omitSide: -1 },
    );

    // The 3F nursing station is vertically aligned with the large 2F waiting
    // information screen. Its right side remains open so future nurse actors
    // can walk behind the counter without crossing furniture or carts.
    const nursingStationFloor = new THREE.Mesh(
      new RoundedBoxGeometry(8.6, 0.07, 3.25, 10, 0.28),
      material(0xe6f0ee, 0.68),
    );
    nursingStationFloor.position.set(0, 0.075, -6.65);
    nursingStationFloor.receiveShadow = true;
    thirdFloor.add(nursingStationFloor);

    const nursingStation = new THREE.Group(),
      stationFrontDepth = 0.82 * 0.7,
      stationFrontTopDepth = 0.98 * 0.7,
      // Keep the courtyard-facing edge fixed while reducing the counter depth.
      // All recovered space therefore becomes usable aisle inside the station.
      stationFrontShift = (0.82 - stationFrontDepth) / 2,
      stationFrontTopShift = (0.98 - stationFrontTopDepth) / 2,
      stationFront = new THREE.Mesh(
        new RoundedBoxGeometry(7.15, 1.02, stationFrontDepth, 10, 0.2),
        material(0x91bdc8, 0.58),
      ),
      stationFrontTop = new THREE.Mesh(
        new RoundedBoxGeometry(
          7.35,
          0.14,
          stationFrontTopDepth,
          10,
          0.16,
        ),
        material(0xece3d1, 0.48),
      ),
      stationLeftReturn = new THREE.Mesh(
        new RoundedBoxGeometry(0.82, 1.02, 2.5, 9, 0.18),
        material(0x84b3c2, 0.58),
      ),
      stationLeftTop = new THREE.Mesh(
        new RoundedBoxGeometry(0.98, 0.14, 2.62, 9, 0.15),
        material(0xece3d1, 0.48),
      ),
      stationRightRear = new THREE.Mesh(
        new RoundedBoxGeometry(0.82, 1.02, 0.86, 8, 0.17),
        material(0x84b3c2, 0.58),
      ),
      stationRightRearTop = new THREE.Mesh(
        new RoundedBoxGeometry(0.98, 0.14, 0.98, 8, 0.14),
        material(0xece3d1, 0.48),
      );
    stationFront.position.set(0, 0.57, stationFrontShift);
    stationFrontTop.position.set(0, 1.12, stationFrontTopShift);
    stationLeftReturn.position.set(-3.17, 0.57, -1.34);
    stationLeftTop.position.set(-3.17, 1.12, -1.34);
    stationRightRear.position.set(3.17, 0.57, -2.14);
    stationRightRearTop.position.set(3.17, 1.12, -2.14);
    [
      stationFront,
      stationFrontTop,
      stationLeftReturn,
      stationLeftTop,
      stationRightRear,
      stationRightRearTop,
    ].forEach((part) => {
      part.castShadow = true;
      part.receiveShadow = true;
      nursingStation.add(part);
    });
    nursingStation.position.set(0, 0, -4.95);
    shrinkThirdFloorContent(nursingStation);
    thirdFloor.add(nursingStation);

    const makeNursingStationSignTexture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 256;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#fff";
      context.fillRect(16, 16, 480, 224);
      context.strokeStyle = "#dce8e6";
      context.lineWidth = 8;
      context.strokeRect(16, 16, 480, 224);
      context.textAlign = "center";
      context.fillStyle = "#4d83bc";
      context.font = "700 86px Arial, sans-serif";
      context.fillText("護理站", 256, 142);
      context.fillStyle = "#365c70";
      context.font = "600 22px Arial, sans-serif";
      context.fillText("NURSING STATION", 256, 190);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    const nursingStationSign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 1.02),
      new THREE.MeshBasicMaterial({
        map: makeNursingStationSignTexture(),
        side: THREE.DoubleSide,
        transparent: true,
      }),
    );
    nursingStationSign.position.set(0, 2.82, -8.275);
    nursingStationSign.castShadow = true;
    nursingStationSign.receiveShadow = true;
    shrinkThirdFloorContent(nursingStationSign);
    thirdFloor.add(nursingStationSign);

    const addStationWorkplace = (x: number, folderColor: number) => {
      const workplace = new THREE.Group(),
        desk = new THREE.Mesh(
          new RoundedBoxGeometry(1.86, 0.12, 0.78, 7, 0.09),
          material(0xd9e6e4, 0.62),
        ),
        monitor = new THREE.Mesh(
          new RoundedBoxGeometry(1.06, 0.68, 0.12, 7, 0.08),
          material(0x355c70, 0.38),
        ),
        screen = new THREE.Mesh(
          new THREE.PlaneGeometry(0.88, 0.5),
          new THREE.MeshBasicMaterial({ color: 0x8dd8df }),
        );
      desk.position.y = 0.78;
      monitor.position.set(0, 1.25, 0.02);
      screen.position.set(0, 1.25, 0.086);
      workplace.add(desk, monitor, screen);
      put(workplace, box(0.88, 0.045, 0.34, 0x708990), 0, 0.88, 0.2);
      [-0.24, 0, 0.24].forEach((folderX, index) => {
        const folder = box(0.17, 0.38 + index * 0.05, 0.06, folderColor);
        folder.position.set(folderX + 0.55, 1.02, -0.18);
        folder.rotation.z = (index - 1) * 0.08;
        workplace.add(folder);
      });
      [0, 0.035, 0.07].forEach((height, index) => {
        const paper = box(0.48, 0.018, 0.34, index === 1 ? 0xd5ebee : 0xffffff);
        paper.position.set(-0.58, 0.86 + height, -0.08);
        paper.rotation.y = -0.08 + index * 0.05;
        workplace.add(paper);
      });
      const chair = new THREE.Group();
      put(chair, new THREE.Mesh(
        new RoundedBoxGeometry(0.62, 0.13, 0.6, 6, 0.12),
        material(0x72a6b5, 0.58),
      ), 0, 0.54, 0);
      put(chair, new THREE.Mesh(
        new RoundedBoxGeometry(0.62, 0.72, 0.13, 6, 0.12),
        material(0x72a6b5, 0.58),
      ), 0, 0.86, -0.25);
      put(chair, cyl(0.05, 0.46, 0x667a82, 10), 0, 0.27, 0);
      put(chair, box(0.76, 0.06, 0.06, 0x667a82), 0, 0.06, 0);
      chair.position.set(0, 0, 0.92);
      // The chair back faces away from the desk so the seated orientation is
      // directed toward the keyboard and monitor.
      chair.rotation.y = Math.PI;
      workplace.add(chair);
      workplace.position.set(x, 0, -7.18);
      shrinkThirdFloorContent(workplace);
      thirdFloor.add(workplace);
    };
    addStationWorkplace(-2.15, 0x5d9fc0);
    addStationWorkplace(0, 0x72b8a8);
    addStationWorkplace(2.15, 0xe2b66e);

    const stationDocumentShelf = new THREE.Group();
    put(
      stationDocumentShelf,
      new THREE.Mesh(
        new RoundedBoxGeometry(1.4, 1.45, 0.38, 7, 0.09),
        material(0xe4ece9, 0.64),
      ),
      0,
      0.82,
      0,
    );
    [0.42, 0.82, 1.22].forEach((y) =>
      put(stationDocumentShelf, box(1.24, 0.045, 0.34, 0x89a1a6), 0, y, 0),
    );
    [-0.42, 0, 0.42].forEach((x, index) =>
      [0.61, 1.01, 1.41].forEach((y, row) =>
        put(
          stationDocumentShelf,
          box(0.25, 0.3, 0.27, (index + row) % 2 ? 0x6faac1 : 0xe0b56e),
          x,
          y,
          0.03,
        ),
      ),
    );
    stationDocumentShelf.position.set(-4.18, 0, -7.55);
    shrinkThirdFloorContent(stationDocumentShelf);
    thirdFloor.add(stationDocumentShelf);

    const thirdFloorMedicalCarts: THREE.Group[] = [];
    const addMedicalCart = (z: number, accent: number) => {
      const cart = new THREE.Group(),
        cartBody = new THREE.Mesh(
          new RoundedBoxGeometry(0.82, 0.95, 0.74, 7, 0.1),
          material(0xe9efed, 0.6),
        ),
        cartTop = new THREE.Mesh(
          new RoundedBoxGeometry(0.94, 0.12, 0.84, 7, 0.1),
          material(accent, 0.48),
        );
      cartBody.position.y = 0.58;
      cartTop.position.y = 1.1;
      cart.add(cartBody, cartTop);
      [0.46, 0.69, 0.92].forEach((y) =>
        put(cart, box(0.055, 0.055, 0.5, 0x6f8790), -0.42, y, 0),
      );
      [-0.31, 0.31].forEach((x) =>
        [-0.27, 0.27].forEach((wheelZ) => {
          const wheel = cyl(0.08, 0.06, 0x4f6068, 12);
          wheel.rotation.z = Math.PI / 2;
          put(cart, wheel, x, 0.08, wheelZ);
        }),
      );
      put(cart, box(0.06, 0.08, 0.96, 0x71868e), 0, 1.27, 0);
      put(cart, cyl(0.08, 0.28, 0xcbe9e8, 14), -0.28, 1.32, 0.2);
      put(cart, cyl(0.07, 0.22, 0xf0d9b3, 14), 0.28, 1.29, 0.2);
      const tablet = new THREE.Group(),
        tabletShell = new THREE.Mesh(
          new RoundedBoxGeometry(0.62, 0.42, 0.06, 6, 0.055),
          material(0x53666f, 0.38),
        ),
        tabletScreen = new THREE.Mesh(
          new RoundedBoxGeometry(0.54, 0.34, 0.025, 5, 0.04),
          material(0xdff4f3, 0.28),
        );
      tabletShell.position.y = 0.26;
      tabletScreen.position.set(0, 0.26, 0.043);
      tablet.add(tabletShell, tabletScreen);
      put(tablet, box(0.4, 0.035, 0.018, 0x44bddb), 0, 0.32, 0.06);
      put(tablet, box(0.26, 0.025, 0.018, 0x5177ba), -0.07, 0.24, 0.06);
      put(tablet, box(0.32, 0.025, 0.018, 0x79b8a9), -0.04, 0.17, 0.06);
      put(tablet, cyl(0.035, 0.18, 0x71868e, 10), 0, 0, 0);
      tablet.position.set(0, 1.26, -0.2);
      tablet.rotation.x = -0.12;
      cart.add(tablet);
      cart.position.set(-4.45, 0, z);
      cart.rotation.y = Math.PI / 2;
      shrinkThirdFloorContent(cart);
      thirdFloor.add(cart);
      thirdFloorMedicalCarts.push(cart);
      return cart;
    };
    addMedicalCart(-4.65, 0x6ba9c8);
    addMedicalCart(-5.95, 0x73b9af);
    addMedicalCart(-7.25, 0xe2b66e);

    // The annotated plan defines the courtyard as a broad trapezoid enclosed
    // by full-height glazing. Four large planted zones occupy the green areas,
    // leaving a clear cross-shaped promenade aligned with the north, west and
    // east entrances.
    const makeCourtyardOutline = (
      frontHalf: number,
      rearHalf: number,
      depth: number,
      radius: number,
    ) => {
      const outline = new THREE.Shape(),
        halfDepth = depth / 2;
      outline.moveTo(-frontHalf + radius, -halfDepth);
      outline.lineTo(frontHalf - radius, -halfDepth);
      outline.quadraticCurveTo(
        frontHalf,
        -halfDepth,
        frontHalf - radius * 0.32,
        -halfDepth + radius,
      );
      outline.lineTo(rearHalf + radius * 0.32, halfDepth - radius);
      outline.quadraticCurveTo(
        rearHalf,
        halfDepth,
        rearHalf - radius,
        halfDepth,
      );
      outline.lineTo(-rearHalf + radius, halfDepth);
      outline.quadraticCurveTo(
        -rearHalf,
        halfDepth,
        -rearHalf - radius * 0.32,
        halfDepth - radius,
      );
      outline.lineTo(-frontHalf + radius * 0.32, -halfDepth + radius);
      outline.quadraticCurveTo(
        -frontHalf,
        -halfDepth,
        -frontHalf + radius,
        -halfDepth,
      );
      outline.closePath();
      return outline;
    };
    const courtyardDoorOpening = 2.66,
      courtyardNorthWest = new THREE.Vector3(-5.56, 0, -1.08),
      courtyardNorthEast = new THREE.Vector3(5.56, 0, -1.08),
      courtyardSouthWest = new THREE.Vector3(-courtyardFacadeHalf, 0, 7.7),
      courtyardSouthEast = new THREE.Vector3(courtyardFacadeHalf, 0, 7.7),
      westDoorTangent = courtyardSouthWest
        .clone()
        .sub(courtyardNorthWest)
        .normalize(),
      eastDoorTangent = courtyardSouthEast
        .clone()
        .sub(courtyardNorthEast)
        .normalize(),
      westDoorCentre = courtyardNorthWest
        .clone()
        .add(courtyardSouthWest)
        .multiplyScalar(0.5),
      eastDoorCentre = courtyardNorthEast
        .clone()
        .add(courtyardSouthEast)
        .multiplyScalar(0.5),
      westDoorTop = westDoorCentre
        .clone()
        .addScaledVector(westDoorTangent, -courtyardDoorOpening / 2),
      westDoorBottom = westDoorCentre
        .clone()
        .addScaledVector(westDoorTangent, courtyardDoorOpening / 2),
      eastDoorTop = eastDoorCentre
        .clone()
        .addScaledVector(eastDoorTangent, -courtyardDoorOpening / 2),
      eastDoorBottom = eastDoorCentre
        .clone()
        .addScaledVector(eastDoorTangent, courtyardDoorOpening / 2);

    const courtyardBaseShape = makeCourtyardOutline(
        courtyardFacadeHalf,
        5.56,
        8.78,
        0.34,
      ),
      courtyardBaseGeometry = new THREE.ExtrudeGeometry(courtyardBaseShape, {
        depth: 0.008,
        bevelEnabled: true,
        bevelSize: 0.012,
        bevelThickness: 0.002,
        bevelSegments: 3,
      });
    courtyardBaseGeometry.rotateX(-Math.PI / 2);
    const courtyardBase = new THREE.Mesh(
      courtyardBaseGeometry,
      material(0xebe2d2, 0.62),
    );
    courtyardBase.position.set(0, 0.07, 3.31);
    courtyardBase.castShadow = true;
    courtyardBase.receiveShadow = true;
    thirdFloor.add(courtyardBase);

    // The marked circulation area is a cross with a circular pause point at
    // its centre. Build the full east-west arm as one continuous polygon so
    // both outer edges are exactly collinear with their diagonal door leaves.
    const courtyardVerticalPathWidth = 2.54,
      courtyardHorizontalPathNorthZ = 2.23,
      courtyardHorizontalPathSouthZ = 4.73,
      horizontalPathPoints: Array<[number, number]> = [
        [westDoorTop.x, westDoorTop.z],
        [-7.2, courtyardHorizontalPathNorthZ],
        [7.2, courtyardHorizontalPathNorthZ],
        [eastDoorTop.x, eastDoorTop.z],
        [eastDoorBottom.x, eastDoorBottom.z],
        [7.2, courtyardHorizontalPathSouthZ],
        [-7.2, courtyardHorizontalPathSouthZ],
        [westDoorBottom.x, westDoorBottom.z],
      ],
      horizontalPathShape = new THREE.Shape();
    horizontalPathShape.moveTo(
      horizontalPathPoints[0][0],
      -horizontalPathPoints[0][1],
    );
    horizontalPathPoints
      .slice(1)
      .forEach(([x, z]) => horizontalPathShape.lineTo(x, -z));
    horizontalPathShape.closePath();
    const horizontalPathGeometry = new THREE.ShapeGeometry(
        horizontalPathShape,
      ),
      // All three promenade pieces share one non-depth-writing overlay
      // material. Their colour can overlap, but their depth buffers can no
      // longer fight each other or the courtyard base while the camera moves.
      courtyardPathMaterial = material(0xd7c9aa, 0.62);
    horizontalPathGeometry.rotateX(-Math.PI / 2);
    courtyardPathMaterial.side = THREE.DoubleSide;
    courtyardPathMaterial.depthWrite = false;
    courtyardPathMaterial.polygonOffset = true;
    courtyardPathMaterial.polygonOffsetFactor = -3;
    courtyardPathMaterial.polygonOffsetUnits = -3;
    const courtyardVerticalPath = new THREE.Mesh(
        new RoundedBoxGeometry(
          courtyardVerticalPathWidth,
          0.004,
          8.58,
          8,
          0.1,
        ),
        courtyardPathMaterial,
      ),
      courtyardHorizontalPath = new THREE.Mesh(
        horizontalPathGeometry,
        courtyardPathMaterial,
      ),
      courtyardCirclePath = new THREE.Mesh(
        new THREE.CylinderGeometry(2.03, 2.03, 0.004, 48),
        courtyardPathMaterial,
      );
    courtyardVerticalPath.position.set(0, 0.081, 3.31);
    courtyardHorizontalPath.position.y = 0.083;
    courtyardCirclePath.position.set(0, 0.081, 3.48);
    courtyardVerticalPath.renderOrder = 4;
    courtyardHorizontalPath.renderOrder = 4;
    courtyardCirclePath.renderOrder = 5;
    courtyardVerticalPath.receiveShadow = true;
    courtyardHorizontalPath.receiveShadow = true;
    courtyardCirclePath.receiveShadow = true;
    thirdFloor.add(
      courtyardVerticalPath,
      courtyardHorizontalPath,
      courtyardCirclePath,
    );

    // Medify sculpture for the circular plaza. The supplied transparent PNG is
    // layered through depth so its exact artwork remains intact while reading
    // as a solid plaque from oblique courtyard views.
    const sculpturePedestalIncrease = 2,
      medifySculpture = new THREE.Group(),
      sculptureBase = cyl(0.8, 0.18, 0xf7f4ed, 40),
      sculptureAccent = cyl(0.77, 0.055, 0x83bdd5, 40),
      sculpturePlinth = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.48,
          0.62,
          0.9 + sculpturePedestalIncrease,
          36,
        ),
        material(0xf5f1e9, 0.58),
      ),
      sculptureCap = new THREE.Mesh(
        new RoundedBoxGeometry(1.05, 0.14, 0.78, 10, 0.16),
        material(0xf8f5ee, 0.54),
      ),
      sculptureLogo = new THREE.Group();
    sculptureBase.position.y = 0.42;
    sculptureAccent.position.y = 0.535;
    // The whole sculpture is displayed at 50% scale. Adding two local metres
    // therefore raises the finished pedestal by exactly one world metre while
    // keeping its original base planted on the plaza.
    sculpturePlinth.position.y = 1.0 + sculpturePedestalIncrease / 2;
    sculptureCap.position.y = 1.49 + sculpturePedestalIncrease;
    [sculptureBase, sculptureAccent, sculpturePlinth, sculptureCap].forEach(
      (part) => {
        part.castShadow = true;
        part.receiveShadow = true;
        medifySculpture.add(part);
      },
    );

    const logoSize = 1.72,
      logoDepth = 0.18,
      logoAlphaCutoffByte = 48,
      logoTextureLoader = new THREE.TextureLoader();
    logoTextureLoader.load("/logo-png.png", (sculptureLogoTexture) => {
      sculptureLogoTexture.colorSpace = THREE.SRGBColorSpace;
      // Build the front, back and side wall from the same native PNG pixel
      // mask. Sharing one geometric boundary removes the alpha-plane fringe,
      // gaps and mismatched outline that appeared at oblique viewing angles.
      const gridSize =
          (sculptureLogoTexture.image as HTMLImageElement).naturalWidth || 247,
        canvas = document.createElement("canvas");
      canvas.width = gridSize;
      canvas.height = gridSize;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.clearRect(0, 0, gridSize, gridSize);
      context.imageSmoothingEnabled = true;
      context.drawImage(
        sculptureLogoTexture.image as CanvasImageSource,
        0,
        0,
        gridSize,
        gridSize,
      );
      const pixels = context.getImageData(0, 0, gridSize, gridSize).data,
        capPositions: number[] = [],
        capColours: number[] = [],
        positions: number[] = [],
        colours: number[] = [],
        alphaAt = (x: number, y: number) =>
          x < 0 || x >= gridSize || y < 0 || y >= gridSize
            ? 0
            : pixels[(y * gridSize + x) * 4 + 3],
        addSideQuad = (
          ax: number,
          ay: number,
          bx: number,
          by: number,
          red: number,
          green: number,
          blue: number,
        ) => {
          const frontZ = logoDepth / 2,
            backZ = -logoDepth / 2,
            quad = [
              ax,
              ay,
              frontZ,
              ax,
              ay,
              backZ,
              bx,
              by,
              backZ,
              ax,
              ay,
              frontZ,
              bx,
              by,
              backZ,
              bx,
              by,
              frontZ,
            ];
          positions.push(...quad);
          for (let vertex = 0; vertex < 6; vertex++) {
            colours.push(red / 255, green / 255, blue / 255);
          }
        },
        addCapQuad = (
          x0: number,
          x1: number,
          y0: number,
          y1: number,
          red: number,
          green: number,
          blue: number,
        ) => {
          const frontZ = logoDepth / 2,
            backZ = -logoDepth / 2,
            cap = [
              x0, y0, frontZ, x0, y1, frontZ, x1, y1, frontZ,
              x0, y0, frontZ, x1, y1, frontZ, x1, y0, frontZ,
              x0, y0, backZ, x1, y1, backZ, x0, y1, backZ,
              x0, y0, backZ, x1, y0, backZ, x1, y1, backZ,
            ];
          capPositions.push(...cap);
          for (let vertex = 0; vertex < 12; vertex++) {
            capColours.push(red / 255, green / 255, blue / 255);
          }
        };
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          if (alphaAt(x, y) < logoAlphaCutoffByte) continue;
          const pixelIndex = (y * gridSize + x) * 4,
            sourceRed = pixels[pixelIndex] / 255,
            sourceGreen = pixels[pixelIndex + 1] / 255,
            sourceBlue = pixels[pixelIndex + 2] / 255,
            luminance =
              sourceRed * 0.2126 + sourceGreen * 0.7152 + sourceBlue * 0.0722,
            saturationBoost = 1.62,
            red =
              THREE.MathUtils.clamp(
                luminance + (sourceRed - luminance) * saturationBoost,
                0,
                1,
              ) * 255,
            green =
              THREE.MathUtils.clamp(
                luminance + (sourceGreen - luminance) * saturationBoost,
                0,
                1,
              ) * 255,
            blue =
              THREE.MathUtils.clamp(
                luminance + (sourceBlue - luminance) * saturationBoost,
                0,
                1,
              ) * 255,
            x0 = (x / gridSize - 0.5) * logoSize,
            x1 = ((x + 1) / gridSize - 0.5) * logoSize,
            y0 = (0.5 - y / gridSize) * logoSize,
            y1 = (0.5 - (y + 1) / gridSize) * logoSize;
          addCapQuad(x0, x1, y0, y1, red, green, blue);
          if (alphaAt(x - 1, y) < logoAlphaCutoffByte)
            addSideQuad(x0, y1, x0, y0, red, green, blue);
          if (alphaAt(x + 1, y) < logoAlphaCutoffByte)
            addSideQuad(x1, y0, x1, y1, red, green, blue);
          if (alphaAt(x, y - 1) < logoAlphaCutoffByte)
            addSideQuad(x0, y0, x1, y0, red, green, blue);
          if (alphaAt(x, y + 1) < logoAlphaCutoffByte)
            addSideQuad(x1, y1, x0, y1, red, green, blue);
        }
      }
      const capGeometry = new THREE.BufferGeometry();
      capGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(capPositions, 3),
      );
      capGeometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(capColours, 3),
      );
      capGeometry.computeVertexNormals();
      const capMesh = new THREE.Mesh(
        capGeometry,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      capMesh.castShadow = true;
      capMesh.receiveShadow = true;
      capMesh.renderOrder = 2;

      const sideGeometry = new THREE.BufferGeometry();
      sideGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      sideGeometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colours, 3),
      );
      sideGeometry.computeVertexNormals();
      const sideWall = new THREE.Mesh(
        sideGeometry,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      sideWall.castShadow = false;
      sideWall.receiveShadow = true;
      sculptureLogo.add(capMesh, sideWall);
    });

    // The PNG's lowest opaque pixel now rests on the cap instead of sinking
    // into it; the tiny clearance prevents z-fighting at the contact point.
    sculptureLogo.position.y = 2.45 + sculpturePedestalIncrease;
    sculptureLogo.rotation.y = 0;
    medifySculpture.add(sculptureLogo);
    medifySculpture.position.set(0, 0, 3.48);
    medifySculpture.scale.setScalar(0.5);
    thirdFloor.add(medifySculpture);

    const addCourtyardFlower = (
        garden: THREE.Group,
        x: number,
        z: number,
        petalColor: number,
        scale = 1,
      ) => {
        const flower = new THREE.Group();
        for (let petal = 0; petal < 5; petal++) {
          const angle = (petal / 5) * Math.PI * 2,
            petalMesh = new THREE.Mesh(
              new THREE.SphereGeometry(0.085 * scale, 10, 7),
              material(petalColor, 0.56),
            );
          petalMesh.position.set(
            Math.cos(angle) * 0.095 * scale,
            0,
            Math.sin(angle) * 0.095 * scale,
          );
          petalMesh.scale.set(1.18, 0.42, 0.78);
          petalMesh.castShadow = true;
          flower.add(petalMesh);
        }
        const centre = new THREE.Mesh(
          new THREE.SphereGeometry(0.065 * scale, 10, 7),
          material(0xf1c94f, 0.52),
        );
        centre.scale.y = 0.55;
        flower.add(centre);
        flower.position.set(x, 0.66, z);
        garden.add(flower);
      },
      pointInsideTerrain = (
        x: number,
        z: number,
        points: Array<[number, number]>,
      ) => {
        let inside = false;
        for (
          let index = 0, previous = points.length - 1;
          index < points.length;
          previous = index++
        ) {
          const [xi, zi] = points[index],
            [xj, zj] = points[previous],
            intersects =
              zi > z !== zj > z &&
              x < ((xj - xi) * (z - zi)) / (zj - zi || 0.0001) + xi;
          if (intersects) inside = !inside;
        }
        return inside;
      },
      distanceToTerrainEdge = (
        x: number,
        z: number,
        points: Array<[number, number]>,
      ) => {
        let nearest = Number.POSITIVE_INFINITY;
        points.forEach(([startX, startZ], index) => {
          const [endX, endZ] = points[(index + 1) % points.length],
            segmentX = endX - startX,
            segmentZ = endZ - startZ,
            segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ,
            projection =
              segmentLengthSquared > 0
                ? THREE.MathUtils.clamp(
                    ((x - startX) * segmentX + (z - startZ) * segmentZ) /
                      segmentLengthSquared,
                    0,
                    1,
                  )
                : 0,
            closestX = startX + segmentX * projection,
            closestZ = startZ + segmentZ * projection;
          nearest = Math.min(nearest, Math.hypot(x - closestX, z - closestZ));
        });
        return nearest;
      },
      addPlantingTerrain = (
        points: Array<[number, number]>,
        seed: number,
        treePoint: [number, number],
      ) => {
        const garden = new THREE.Group(),
          shape = new THREE.Shape();
        shape.moveTo(points[0][0], -points[0][1]);
        points.slice(1).forEach(([x, z]) => shape.lineTo(x, -z));
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 0.13,
            bevelEnabled: true,
            bevelSize: 0.07,
            bevelThickness: 0.035,
            bevelSegments: 3,
          }),
          terrain = new THREE.Mesh(geometry, material(0x6fcf8c, 0.7));
        geometry.rotateX(-Math.PI / 2);
        terrain.position.y = 0.34;
        terrain.castShadow = true;
        terrain.receiveShadow = true;
        garden.add(terrain);

        // A continuous rounded stone seat-wall protects each planting zone.
        // Its broad cap sits at chair height, replacing separate timber benches.
        points.forEach(([startX, startZ], pointIndex) => {
          const [endX, endZ] = points[(pointIndex + 1) % points.length],
            start = new THREE.Vector3(startX, 0, startZ),
            end = new THREE.Vector3(endX, 0, endZ),
            direction = end.clone().sub(start),
            length = direction.length();
          if (length < 0.08) return;
          const tangent = direction.normalize(),
            yaw = Math.atan2(tangent.x, tangent.z),
            middle = start.clone().add(end).multiplyScalar(0.5),
            wall = new THREE.Mesh(
              new RoundedBoxGeometry(0.36, 0.34, length, 6, 0.075),
              material(0xc9c6bd, 0.64),
            ),
            seatCap = new THREE.Mesh(
              new RoundedBoxGeometry(0.46, 0.09, length + 0.04, 6, 0.06),
              material(0xe2ded4, 0.68),
            );
          wall.position.set(middle.x, 0.43, middle.z);
          seatCap.position.set(middle.x, 0.62, middle.z);
          [wall, seatCap].forEach((stone) => {
            stone.rotation.y = yaw;
            stone.castShadow = true;
            stone.receiveShadow = true;
            garden.add(stone);
          });
        });

        const xs = points.map(([x]) => x),
          zs = points.map(([, z]) => z),
          minX = Math.min(...xs),
          maxX = Math.max(...xs),
          minZ = Math.min(...zs),
          maxZ = Math.max(...zs);
        let shrubIndex = 0;
        for (let attempt = 0; attempt < 80 && shrubIndex < 15; attempt++) {
          const x =
              minX +
              ((((attempt * 37 + seed * 19) % 97) / 96) * (maxX - minX)),
            z =
              minZ +
              ((((attempt * 53 + seed * 11) % 89) / 88) * (maxZ - minZ)),
            radius = 0.2 + ((attempt + seed) % 4) * 0.065;
          if (
            !pointInsideTerrain(x, z, points) ||
            distanceToTerrainEdge(x, z, points) < radius + 0.38 ||
            Math.hypot(x - treePoint[0], z - treePoint[1]) < 0.72
          )
            continue;
          const shrub = new THREE.Mesh(
              new THREE.SphereGeometry(radius, 13, 9),
              material((attempt + seed) % 3 ? 0x75a05b : 0x91b56d, 0.72),
            );
          shrub.position.set(x, 0.56 + radius * 0.72, z);
          shrub.scale.y = 0.76 + (attempt % 3) * 0.08;
          shrub.castShadow = true;
          shrub.receiveShadow = true;
          garden.add(shrub);
          shrubIndex++;
        }
        let flowerIndex = 0;
        for (let attempt = 0; attempt < 70 && flowerIndex < 10; attempt++) {
          const x =
              minX +
              ((((attempt * 29 + seed * 31) % 83) / 82) * (maxX - minX)),
            z =
              minZ +
              ((((attempt * 41 + seed * 23) % 79) / 78) * (maxZ - minZ));
          if (
            !pointInsideTerrain(x, z, points) ||
            distanceToTerrainEdge(x, z, points) < 0.48 ||
            Math.hypot(x - treePoint[0], z - treePoint[1]) < 0.58
          )
            continue;
          addCourtyardFlower(
            garden,
            x,
            z,
            flowerIndex % 3 ? 0xffffff : 0xf0d45c,
            0.78 + (flowerIndex % 2) * 0.15,
          );
          flowerIndex++;
        }

        const trunk = cyl(0.15, 1.48, 0x916441, 14);
        trunk.position.set(treePoint[0], 1.18, treePoint[1]);
        trunk.castShadow = true;
        garden.add(trunk);
        [
          [0, 0, 0.62],
          [-0.38, 0.06, 0.5],
          [0.38, -0.04, 0.52],
        ].forEach(([offsetX, offsetZ, radius], index) => {
          const crown = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 16, 11),
            material(index % 2 ? 0x7ea55f : 0x92b96d, 0.7),
          );
          crown.position.set(
            treePoint[0] + offsetX,
            2.0 + index * 0.08,
            treePoint[1] + offsetZ,
          );
          crown.scale.y = 0.84;
          crown.castShadow = true;
          crown.receiveShadow = true;
          garden.add(crown);
        });
        thirdFloor.add(garden);
      };

    // Four green terrain polygons fill every area outside the marked path. The
    // inner corners step around the circular centre instead of covering it.
    const courtyardTreePoints: Array<[number, number]> = [
      [-3.35, 0.48],
      [3.35, 0.48],
      [-3.7, 5.58],
      [3.7, 5.58],
    ];
    addPlantingTerrain(
      [
        [-5.32, -0.84],
        [-1.28, -0.84],
        [-1.28, 1.61],
        [-1.61, 1.89],
        [-1.93, courtyardHorizontalPathNorthZ],
        [westDoorTop.x, westDoorTop.z],
      ],
      1,
      courtyardTreePoints[0],
    );
    addPlantingTerrain(
      [
        [1.28, -0.84],
        [5.32, -0.84],
        [eastDoorTop.x, eastDoorTop.z],
        [1.93, courtyardHorizontalPathNorthZ],
        [1.61, 1.89],
        [1.28, 1.61],
      ],
      2,
      courtyardTreePoints[1],
    );
    addPlantingTerrain(
      [
        [westDoorBottom.x, westDoorBottom.z],
        [-1.93, courtyardHorizontalPathSouthZ],
        [-1.61, 5.07],
        [-1.28, 5.35],
        [-1.28, 7.48],
        [-10.42, 7.48],
      ],
      3,
      courtyardTreePoints[2],
    );
    addPlantingTerrain(
      [
        [1.93, courtyardHorizontalPathSouthZ],
        [eastDoorBottom.x, eastDoorBottom.z],
        [10.42, 7.48],
        [1.28, 7.48],
        [1.28, 5.35],
        [1.61, 5.07],
      ],
      4,
      courtyardTreePoints[3],
    );

    type CourtyardAutoDoor = {
      root: THREE.Group;
      tangent: THREE.Vector3;
      leaves: Array<{ mesh: THREE.Mesh; closed: THREE.Vector3; side: number }>;
      opening: number;
      openAmount: number;
      openTarget: 0 | 1;
      closeAt: number;
    };
    const courtyardAutoDoors: CourtyardAutoDoor[] = [],
      courtyardGlassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xbfe6ec,
        transparent: true,
        opacity: 0.25,
        roughness: 0.14,
        transmission: 0.5,
        thickness: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      // Transparent glass should not create an opaque slab on the floor. The
      // moving automatic-door leaves use alpha-hashed depth at 10%, while the
      // fixed windows cast no shadow and leave that job to their white frames.
      courtyardDoorShadowMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        opacity: 0.1,
        alphaHash: true,
        side: THREE.DoubleSide,
      }),
      // Match the existing 3F facade so the courtyard enclosure and exterior
      // windows merge into one continuous white-frame glazed elevation.
      courtyardFrameColor = thirdFloorWindowFrameColor,
      addCourtyardGlassSegment = (
        start: THREE.Vector3,
        end: THREE.Vector3,
      ) => {
        const direction = end.clone().sub(start),
          length = direction.length();
        if (length < 0.08) return;
        const tangent = direction.normalize(),
          yaw = Math.atan2(tangent.x, tangent.z),
          middle = start.clone().add(end).multiplyScalar(0.5),
          glass = new THREE.Mesh(
            new RoundedBoxGeometry(0.08, 2.96, length, 5, 0.025),
            courtyardGlassMaterial,
          ),
          bottomRail = box(0.11, 0.12, length, courtyardFrameColor),
          topRail = box(0.11, 0.13, length, courtyardFrameColor);
        glass.position.set(middle.x, 1.62, middle.z);
        bottomRail.position.set(middle.x, 0.19, middle.z);
        topRail.position.set(middle.x, 3.08, middle.z);
        [glass, bottomRail, topRail].forEach((part) => {
          part.rotation.y = yaw;
          part.castShadow = part !== glass;
          part.receiveShadow = true;
          thirdFloor.add(part);
        });
        const postCount = Math.max(1, Math.ceil(length / 1.65));
        for (let index = 0; index <= postCount; index++) {
          const point = start.clone().lerp(end, index / postCount),
            post = box(0.13, 3.08, 0.13, courtyardFrameColor);
          post.position.set(point.x, 1.59, point.z);
          post.castShadow = true;
          post.receiveShadow = true;
          thirdFloor.add(post);
        }
      },
      addCourtyardAutomaticDoor = (
        start: THREE.Vector3,
        end: THREE.Vector3,
      ) => {
        const tangent = end.clone().sub(start).normalize(),
          centre = start.clone().add(end).multiplyScalar(0.5),
          opening = courtyardDoorOpening,
          leftEdge = centre.clone().addScaledVector(tangent, -opening / 2),
          rightEdge = centre.clone().addScaledVector(tangent, opening / 2);
        addCourtyardGlassSegment(start, leftEdge);
        addCourtyardGlassSegment(rightEdge, end);
        const root = new THREE.Group(),
          yaw = Math.atan2(tangent.x, tangent.z),
          door: CourtyardAutoDoor = {
            root,
            tangent,
            leaves: [],
            opening,
            openAmount: 0,
            openTarget: 0,
            closeAt: 0,
          },
          doorIndex = courtyardAutoDoors.length;
        root.userData = {
          interactive: "courtyardDoor",
          courtyardDoorIndex: doorIndex,
          floor: 3,
        };
        [-1, 1].forEach((side) => {
          const closed = centre
              .clone()
              .addScaledVector(tangent, side * opening / 4),
            leaf = new THREE.Mesh(
              new RoundedBoxGeometry(0.09, 2.72, opening / 2 - 0.05, 5, 0.025),
              new THREE.MeshPhysicalMaterial({
                color: 0xaedce5,
                transparent: true,
                opacity: 0.38,
                roughness: 0.12,
                transmission: 0.42,
                side: THREE.DoubleSide,
              }),
            );
          leaf.position.set(closed.x, 1.56, closed.z);
          leaf.rotation.y = yaw;
          leaf.castShadow = true;
          leaf.customDepthMaterial = courtyardDoorShadowMaterial;
          leaf.receiveShadow = true;
          leaf.userData.hitRoot = root;
          leaf.userData.floor = 3;
          root.add(leaf);
          interactive.push(leaf);
          door.leaves.push({ mesh: leaf, closed: leaf.position.clone(), side });
        });
        const header = box(0.16, 0.24, opening + 0.38, courtyardFrameColor);
        header.position.set(centre.x, 3.12, centre.z);
        header.rotation.y = yaw;
        root.add(header);
        [-1, 1].forEach((side) => {
          const post = box(0.15, 3.1, 0.15, courtyardFrameColor),
            point = centre.clone().addScaledVector(tangent, side * opening / 2);
          post.position.set(point.x, 1.59, point.z);
          root.add(post);
        });
        thirdFloor.add(root);
        courtyardAutoDoors.push(door);
      },
      addCourtyardRailing = (
        start: THREE.Vector3,
        end: THREE.Vector3,
      ) => {
        const direction = end.clone().sub(start),
          length = direction.length(),
          tangent = direction.normalize(),
          yaw = Math.atan2(tangent.x, tangent.z),
          middle = start.clone().add(end).multiplyScalar(0.5),
          handrail = box(0.16, 0.16, length, courtyardFrameColor),
          middleRail = box(0.11, 0.11, length, courtyardFrameColor);
        handrail.position.set(middle.x, 1.18, middle.z);
        middleRail.position.set(middle.x, 0.64, middle.z);
        [handrail, middleRail].forEach((rail) => {
          rail.rotation.y = yaw;
          rail.castShadow = true;
          rail.receiveShadow = true;
          thirdFloor.add(rail);
        });
        const postCount = Math.max(2, Math.ceil(length / 1.35));
        for (let index = 0; index <= postCount; index++) {
          const point = start.clone().lerp(end, index / postCount),
            post = box(0.14, 1.18, 0.14, courtyardFrameColor);
          post.position.set(point.x, 0.59, point.z);
          post.castShadow = true;
          post.receiveShadow = true;
          thirdFloor.add(post);
        }
      };

    // All three glazed sides and their doors use the same corner coordinates
    // as the base, planting zones and threshold approaches above.
    addCourtyardAutomaticDoor(courtyardNorthWest, courtyardNorthEast);
    addCourtyardAutomaticDoor(courtyardNorthWest, courtyardSouthWest);
    addCourtyardRailing(courtyardSouthWest, courtyardSouthEast);
    addCourtyardAutomaticDoor(courtyardNorthEast, courtyardSouthEast);

    const {
      inpatientPatients,
      wardNurses,
      patientCurrentStatus,
      wardNurseStatus,
      medicationRobotStatus,
      updateThirdFloorCare,
    } = createThirdFloorCare({
      thirdFloor,
      wardBedSlots,
      thirdFloorContentScale,
      wardSwingDoors,
      courtyardAutoDoors,
      courtyardDoorOpening,
      courtyardFacadeHalf,
      courtyardNorthWest,
      courtyardNorthEast,
      westDoorCentre,
      eastDoorCentre,
      thirdFloorMedicalCarts,
      interactive,
      person,
      material,
      cyl,
    });
    type UpperClinicalJob =
      | "surgeon"
      | "scrubNurse"
      | "circulatingNurse"
      | "anesthetist"
      | "surgicalPatient"
      | "examDoctor"
      | "examNurse"
      | "examPatient";
    const upperClinicalActors: {
      walker: Walker;
      job: UpperClinicalJob;
      phase: number;
      baseY: number;
      baseYaw: number;
      room: number;
    }[] = [];
    const facingYaw = (position: THREE.Vector3, target: THREE.Vector3) => {
      const direction = target.clone().sub(position);
      return Math.atan2(-direction.x, -direction.z);
    };
    const createUpperClinicalActor = (
      role: Role,
      job: UpperClinicalJob,
      uniformColor: number,
      position: THREE.Vector3,
      target: THREE.Vector3,
      room: number,
      gender: Gender,
      styleSeed: number,
      surgical = false,
    ) => {
      const walker = person(
        secondFloor,
        role,
        uniformColor,
        position,
        [position.clone()],
        0,
        room,
        gender,
        styleSeed,
      );
      walker.group.rotation.y = facingYaw(position, target);
      walker.group.userData.upperClinicalJob = job;
      walker.group.traverse((object) => {
        if (
          object instanceof THREE.Mesh &&
          object.userData.uniformPart &&
          object.material instanceof THREE.MeshStandardMaterial
        )
          object.material.color.setHex(uniformColor);
      });
      if (walker.chart)
        walker.chart.visible =
          job === "circulatingNurse" || job === "examNurse";
      if (surgical) {
        walker.headRig.traverse((object) => {
          if (object.userData.hairPart || object.userData.nurseCapPart)
            object.visible = false;
        });
        const cap = new THREE.Mesh(
            new THREE.SphereGeometry(
              0.275,
              16,
              10,
              0,
              Math.PI * 2,
              0,
              Math.PI * 0.64,
            ),
            material(role === "patient" ? 0x75bdb2 : uniformColor, 0.62),
          ),
          mask = curvedFaceMask();
        cap.position.y = 0.04;
        cap.scale.set(1.04, 0.94, 1.04);
        walker.headRig.add(cap, mask);
      }
      if (role === "patient") {
        const gown = new THREE.Mesh(
          new RoundedBoxGeometry(0.62, 0.72, 0.3, 6, 0.12),
          material(uniformColor, 0.72),
        );
        gown.position.set(0, 0.82, -0.015);
        gown.userData.uniformPart = true;
        walker.group.add(gown);
        walker.legs.forEach((leg) => {
          if (leg.material instanceof THREE.MeshStandardMaterial)
            leg.material.color.setHex(0xdbe9e7);
        });
        if (walker.phone) walker.phone.visible = false;
        if (walker.medicineBag) walker.medicineBag.visible = false;
        const eyeMaterial = material(0x354d58, 0.62);
        [-0.082, 0.082].forEach((x) => {
          const eye = new THREE.Mesh(
            new THREE.SphereGeometry(0.018, 8, 6),
            eyeMaterial,
          );
          eye.position.set(x, 0.045, -0.236);
          walker.headRig.add(eye);
        });
      }
      if (job === "surgeon" || job === "scrubNurse") {
        walker.arms.forEach((arm) =>
          arm.traverse((object) => {
            if (
              object instanceof THREE.Mesh &&
              object.userData.handPart &&
              object.material instanceof THREE.MeshStandardMaterial
            )
              object.material.color.setHex(0xffffff);
          }),
        );
      }
      if (job === "surgeon") {
        walker.arms.forEach((arm, index) => {
          const instrument = box(
            0.035,
            0.035,
            index === 0 ? 0.5 : 0.42,
            0x899497,
            0.34,
          );
          instrument.position.set(0, -0.47, -0.25);
          instrument.rotation.y = index === 0 ? -0.08 : 0.08;
          arm.add(instrument);
        });
      }
      if (job === "scrubNurse") {
        const instrument = box(0.035, 0.035, 0.58, 0x929b9d, 0.38);
        instrument.position.set(0, -0.43, -0.18);
        walker.arms[1].add(instrument);
      }
      if (role !== "patient")
        upperClinicalActors.push({
          walker,
          job,
          phase: styleSeed * 0.61,
          baseY: position.y,
          baseYaw: walker.group.rotation.y,
          room,
        });
      return walker;
    };
    const placeSupinePatient = (
      patient: Walker,
      bedCentre: THREE.Vector3,
      headDirection: THREE.Vector3,
    ) => {
      const patientHolder = new THREE.Group();
      secondFloor.remove(patient.group);
      patientHolder.add(patient.group);
      patient.group.position.set(0, 0, 0);
      // Rotate the standing model onto its back: its face (local -Z) now points
      // upward, while the head follows local +Z toward the room's north wall.
      patient.group.rotation.set(Math.PI / 2, 0, 0);
      patientHolder.position.copy(
        bedCentre.clone().addScaledVector(headDirection, -0.78),
      );
      patientHolder.position.y = 1.25;
      patientHolder.rotation.y = Math.atan2(headDirection.x, headDirection.z);
      secondFloor.add(patientHolder);
    };
    const populateOperatingRoom = (
      room: number,
      doorCentre: THREE.Vector3,
      out: THREE.Vector3,
      tan: THREE.Vector3,
      seed: number,
    ) => {
      const bedCentre = doorCentre.clone().addScaledVector(out, 7.35 * 0.58),
        surgeonPosition = bedCentre
          .clone()
          .addScaledVector(tan, 0.92)
          .addScaledVector(out, 0.08),
        scrubPosition = bedCentre
          .clone()
          .addScaledVector(tan, 1.55)
          .addScaledVector(out, -1.15),
        circulatingPosition = bedCentre
          .clone()
          .addScaledVector(tan, 3.8)
          .addScaledVector(out, 0.3),
        anesthetistPosition = bedCentre
          .clone()
          .addScaledVector(tan, -1.45)
          .addScaledVector(out, 0.15)
          .add(
            new THREE.Vector3(
              room === 1 ? 0.45 : -0.45,
              0,
              -0.45,
            ),
          );
      const surgeon = createUpperClinicalActor(
        "doctor",
        "surgeon",
        0x2f7779,
        surgeonPosition,
        bedCentre,
        room,
        room === 1 ? "female" : "male",
        seed,
        true,
      ),
        scrubNurse = createUpperClinicalActor(
          "nurse",
          "scrubNurse",
          0x6db9b4,
          scrubPosition,
          surgeonPosition,
          room,
          "female",
          seed + 1,
          true,
        );
      surgeon.group.userData.handoffYaw = facingYaw(
        surgeonPosition,
        scrubPosition,
      );
      scrubNurse.group.userData.handoffYaw = facingYaw(
        scrubPosition,
        surgeonPosition,
      );
      createUpperClinicalActor(
        "nurse",
        "circulatingNurse",
        0x82c5c0,
        circulatingPosition,
        bedCentre,
        room,
        room === 1 ? "male" : "female",
        seed + 2,
        true,
      );
      const anesthesiaMachinePoint = bedCentre
          .clone()
          .addScaledVector(tan, -2.5)
          .addScaledVector(out, -0.8),
        patientHeadPoint = bedCentre.clone().addScaledVector(out, 0.84),
        anesthesiaFocus = anesthesiaMachinePoint
          .clone()
          .lerp(patientHeadPoint, 0.5),
        anesthesiaYaw = facingYaw(anesthetistPosition, anesthesiaFocus);
      stool(
        secondFloor,
        anesthetistPosition.x,
        anesthetistPosition.z,
        0x75aeb9,
        anesthesiaYaw,
      );
      const anesthetist = createUpperClinicalActor(
        "doctor",
        "anesthetist",
        0x79aaca,
        anesthetistPosition,
        anesthesiaFocus,
        room,
        room === 1 ? "male" : "female",
        seed + 3,
        true,
      );
      anesthetist.group.position.y = 0.14;
      anesthetist.group.scale.set(1, 0.88, 1);
      anesthetist.legs.forEach((leg, index) => {
        leg.position.set(index ? 0.14 : -0.14, 0.69, -0.3);
        leg.rotation.x = -Math.PI / 2;
      });
      const anesthetistActor = upperClinicalActors.find(
        (actor) => actor.walker === anesthetist,
      );
      if (anesthetistActor) {
        anesthetistActor.baseY = 0.14;
        anesthetistActor.baseYaw = anesthesiaYaw;
      }
      const patient = createUpperClinicalActor(
          "patient",
          "surgicalPatient",
          room === 1 ? 0xd9b49d : 0xc7b6d9,
          bedCentre,
          bedCentre.clone().add(out),
          room,
          room === 1 ? "male" : "female",
          seed + 4,
          true,
        );
      placeSupinePatient(patient, bedCentre, out);
    };
    populateOperatingRoom(
      1,
      leftOperatingDoor,
      clinicOuts[0],
      clinicTangents[0],
      210,
    );
    populateOperatingRoom(
      2,
      rightOperatingDoor,
      clinicOuts[2],
      clinicTangents[2],
      220,
    );

    const examBedCentre = clinicDoorPoints[4]
        .clone()
        .addScaledVector(clinicOuts[4], 7.35 * 0.58),
      examDoctorPosition = examBedCentre
        .clone()
        .addScaledVector(clinicTangents[4], -1.2)
        .addScaledVector(clinicOuts[4], 0.28),
      examNursePosition = examBedCentre
        .clone()
        .addScaledVector(clinicTangents[4], 1.3)
        .addScaledVector(clinicOuts[4], -0.75),
      examWorkTarget = examBedCentre
        .clone()
        .addScaledVector(clinicTangents[4], -0.72)
        .addScaledVector(clinicOuts[4], 0.52);
    createUpperClinicalActor(
      "doctor",
      "examDoctor",
      0xf8fbfa,
      examDoctorPosition,
      examWorkTarget,
      5,
      "female",
      230,
    );
    createUpperClinicalActor(
      "nurse",
      "examNurse",
      0x74c3c8,
      examNursePosition,
      examBedCentre,
      5,
      "male",
      231,
    );
    const examPatient = createUpperClinicalActor(
      "patient",
      "examPatient",
      0x9fcbd1,
      examBedCentre,
      examBedCentre.clone().add(clinicOuts[4]),
      5,
      "female",
      232,
      true,
    );
    placeSupinePatient(examPatient, examBedCentre, clinicOuts[4]);

    const makeUpperInfoTexture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 512;
      const context = canvas.getContext("2d")!,
        gradient = context.createLinearGradient(0, 0, 1024, 512),
        qr = qrTexture(
          "術前衛教",
          `${window.location.origin}/qr/upper-info-screen`,
        ).image as HTMLCanvasElement;
      gradient.addColorStop(0, "#244a62");
      gradient.addColorStop(1, "#3d7f99");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 1024, 512);
      context.fillStyle = "rgba(255,255,255,.08)";
      context.fillRect(22, 22, 980, 468);
      context.drawImage(qr, 52, 80, 252, 315);
      context.fillStyle = "#ffffff";
      context.textAlign = "center";
      context.font = "700 25px Arial, sans-serif";
      context.fillText("術前衛教資訊", 178, 446);
      context.textAlign = "left";
      context.font = "800 38px Arial, sans-serif";
      context.fillText("二樓候診資訊", 350, 72);
      const rows = [
        ["手術室 1", "A021"],
        ["手術室 2", "A018"],
        ["檢查室", "B006"],
      ];
      rows.forEach(([label, number], index) => {
        const y = 146 + index * 103;
        context.fillStyle = index === 0 ? "#f2c968" : "rgba(255,255,255,.12)";
        context.beginPath();
        context.roundRect(350, y - 42, 610, 78, 18);
        context.fill();
        context.fillStyle = index === 0 ? "#244a62" : "#ffffff";
        context.font = "700 28px Arial, sans-serif";
        context.fillText(label, 380, y + 8);
        context.textAlign = "right";
        context.font = "800 43px Arial, sans-serif";
        context.fillText(number, 925, y + 11);
        context.textAlign = "left";
      });
      context.fillStyle = "rgba(255,255,255,.78)";
      context.font = "600 20px Arial, sans-serif";
      context.fillText("請依螢幕號碼前往指定空間", 350, 468);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    const upperInfoScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(7.9, 3.02),
        new THREE.MeshBasicMaterial({
          map: makeUpperInfoTexture(),
          side: THREE.DoubleSide,
        }),
      );
    upperInfoScreen.position.set(0, 1.84, -8.295);
    secondFloor.add(upperInfoScreen);

    // Four compact waiting islands echo the first-floor furniture language,
    // while sitting closer to the centre aisle. Unlike the two front islands
    // downstairs, both upper corner seats are present here.
    const upperWaitingSeats: { position: THREE.Vector3; yaw: number }[] = [],
      upperFamilyFurnitureObstacles: {
        centre: THREE.Vector3;
        radius: number;
        kind: "seat" | "table" | "fixture";
      }[] = [];
    const upperWaitingIslands = [
      [-3.35, -1.0],
      [3.35, -1.0],
      [-3.35, 3.8],
      [3.35, 3.8],
    ] as const;
    upperWaitingIslands.forEach(([cx, cz], islandIndex) => {
      const rugShape = new THREE.Shape(),
        rugWidth = 5.5,
        rugDepth = 3.65,
        rugRadius = 0.72;
      rugShape.moveTo(-rugWidth / 2 + rugRadius, -rugDepth / 2);
      rugShape.lineTo(rugWidth / 2 - rugRadius, -rugDepth / 2);
      rugShape.quadraticCurveTo(
        rugWidth / 2,
        -rugDepth / 2,
        rugWidth / 2,
        -rugDepth / 2 + rugRadius,
      );
      rugShape.lineTo(rugWidth / 2, rugDepth / 2 - rugRadius);
      rugShape.quadraticCurveTo(
        rugWidth / 2,
        rugDepth / 2,
        rugWidth / 2 - rugRadius,
        rugDepth / 2,
      );
      rugShape.lineTo(-rugWidth / 2 + rugRadius, rugDepth / 2);
      rugShape.quadraticCurveTo(
        -rugWidth / 2,
        rugDepth / 2,
        -rugWidth / 2,
        rugDepth / 2 - rugRadius,
      );
      rugShape.lineTo(-rugWidth / 2, -rugDepth / 2 + rugRadius);
      rugShape.quadraticCurveTo(
        -rugWidth / 2,
        -rugDepth / 2,
        -rugWidth / 2 + rugRadius,
        -rugDepth / 2,
      );
      const rugGeometry = new THREE.ExtrudeGeometry(rugShape, {
          depth: 0.008,
          bevelEnabled: true,
          bevelSize: 0.012,
          bevelThickness: 0.002,
          bevelSegments: 3,
        }),
        rug = new THREE.Mesh(
          rugGeometry,
          material(islandIndex % 2 ? 0xc7e7e4 : 0xbde2df, 0.94),
        );
      rugGeometry.rotateX(-Math.PI / 2);
      rug.position.set(cx, 0.077, cz);
      rug.castShadow = true;
      rug.receiveShadow = true;
      secondFloor.add(rug);
      [
        [-1.02, -0.72, 0],
        [0, -0.72, 0],
        [1.02, -0.72, 0],
        [-1.58, 0.4, -Math.PI / 2],
        [1.58, 0.4, Math.PI / 2],
      ].forEach(([dx, dz, yaw], seatIndex) => {
        upperWaitingSeats.push({
          position: new THREE.Vector3(cx + dx, 0, cz + dz),
          yaw,
        });
        const chairPosition = new THREE.Vector3(cx + dx, 0, cz + dz);
        chair(
          secondFloor,
          cx + dx,
          cz + dz,
          (islandIndex + seatIndex) % 2 ? 0x6eb4c0 : 0x5e91bd,
          yaw,
        );
        upperFamilyFurnitureObstacles.push({
          centre: chairPosition,
          radius: 0.7,
          kind: "seat",
        });
      });
      const table = new THREE.Group();
      put(table, cyl(0.52, 0.12, 0xf2d79a, 22), 0, 0.58, 0);
      put(table, cyl(0.08, 0.54, 0x75929d, 12), 0, 0.28, 0);
      put(table, cyl(0.38, 0.07, 0x75929d, 18), 0, 0.04, 0);
      table.position.set(cx, 0, cz + 0.42);
      secondFloor.add(table);
      upperFamilyFurnitureObstacles.push({
        centre: table.position.clone().setY(0),
        radius: 0.82,
        kind: "table",
      });

      const waitingQrStand = new THREE.Group();
      put(waitingQrStand, box(0.46, 0.56, 0.045, 0xffffff), 0, 0.28, 0);
      const waitingQrFace = new THREE.Mesh(
        new THREE.PlaneGeometry(0.38, 0.48),
        new THREE.MeshBasicMaterial({
          map: qrTexture(
            `2F WAIT ${islandIndex + 1}`,
            `${window.location.origin}/qr/lobby-waiting-${islandIndex + 1}`,
          ),
          side: THREE.DoubleSide,
        }),
      );
      waitingQrFace.position.set(0, 0.29, 0.026);
      waitingQrFace.userData = {
        interactive: "qr",
        qrId: `lobby-waiting-${islandIndex + 1}`,
      };
      interactive.push(waitingQrFace);
      waitingQrStand.add(waitingQrFace);
      waitingQrStand.position.set(cx, 0.64, cz + 0.42);
      waitingQrStand.rotation.y = 0;
      secondFloor.add(waitingQrStand);
    });

    const makeUpperPlanter = (x: number) => {
      const planter = new THREE.Group(),
        body = new THREE.Mesh(
          new RoundedBoxGeometry(2.15, 0.48, 0.68, 7, 0.13),
          material(0xd7e7e3, 0.62),
        ),
        soil = new THREE.Mesh(
          new RoundedBoxGeometry(1.82, 0.05, 0.43, 5, 0.04),
          material(0x55483c, 0.82),
        );
      body.position.y = 0.28;
      soil.position.y = 0.55;
      planter.add(body, soil);
      [-0.68, 0, 0.68].forEach((leafX, cluster) =>
        [-0.38, 0, 0.38].forEach((offset, index) => {
          const leaf = new THREE.Mesh(
            leafGeometry(0.34, 0.72, 0.045),
            material((cluster + index) % 2 ? 0x6fa064 : 0x7eaf70, 0.7),
          );
          leaf.position.set(leafX + offset * 0.25, 0.56, offset * 0.35);
          leaf.rotation.y = cluster * 0.72 + index * 0.34;
          leaf.rotation.z = -offset * 0.72;
          planter.add(leaf);
        }),
      );
      planter.position.set(x, 0, 6.9);
      secondFloor.add(planter);
      upperFamilyFurnitureObstacles.push({
        centre: planter.position.clone().setY(0),
        radius: 1.18,
        kind: "fixture",
      });
    };
    makeUpperPlanter(-11.65);
    makeUpperPlanter(11.65);

    const hydrationStation = new THREE.Group();
    put(
      hydrationStation,
      new THREE.Mesh(
        new RoundedBoxGeometry(0.72, 1.2, 0.68, 6, 0.1),
        material(0xf0f2ee, 0.65),
      ),
      0,
      0.62,
      0,
    );
    const waterBottle = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.25, 0.48, 6, 16),
      new THREE.MeshStandardMaterial({
        color: 0xc4edf0,
        transparent: true,
        opacity: 0.72,
        roughness: 0.25,
      }),
    );
    waterBottle.position.y = 1.5;
    hydrationStation.add(waterBottle);
    // Clearly distinguish the hot/cold outlets on the face used by visitors.
    // The short metallic nozzles make the filling action readable from the
    // elevated camera instead of looking like two decorative squares.
    [
      [-0.16, 0xe45d55],
      [0.16, 0x4a9ed4],
    ].forEach(([z, color]) => {
      const outlet = cyl(0.085, 0.09, color, 16);
      outlet.rotation.z = Math.PI / 2;
      put(hydrationStation, outlet, 0.385, 0.92, z);
      put(hydrationStation, box(0.16, 0.055, 0.055, 0x71858b), 0.45, 0.8, z);
      put(hydrationStation, cyl(0.028, 0.1, 0x71858b, 10), 0.51, 0.74, z);
    });
    const upperWaterStream = cyl(0.018, 0.24, 0x79d5e8, 10);
    upperWaterStream.position.set(0.51, 0.57, 0.16);
    upperWaterStream.visible = false;
    hydrationStation.add(upperWaterStream);
    const upperServiceWallCentre = averagePoint(
      elevatorWallPoint,
      leftOperatingDoor,
    ).addScaledVector(elevatorInward, 0.5);
    hydrationStation.position.copy(
      upperServiceWallCentre.clone().addScaledVector(clinicTangents[0], 0.62),
    );
    hydrationStation.rotation.y = -FAN_ANGLE;
    secondFloor.add(hydrationStation);
    upperFamilyFurnitureObstacles.push({
      centre: hydrationStation.position.clone().setY(0),
      radius: 0.68,
      kind: "fixture",
    });
    const recyclingBin = new THREE.Group();
    put(
      recyclingBin,
      new THREE.Mesh(
        new RoundedBoxGeometry(0.72, 0.82, 0.66, 6, 0.09),
        material(0x9fc9bf, 0.72),
      ),
      0,
      0.43,
      0,
    );
    put(recyclingBin, box(0.48, 0.04, 0.2, 0x466f70), 0, 0.86, 0);
    recyclingBin.position.copy(
      upperServiceWallCentre.clone().addScaledVector(clinicTangents[0], -0.4),
    );
    recyclingBin.rotation.y = -FAN_ANGLE;
    secondFloor.add(recyclingBin);
    upperFamilyFurnitureObstacles.push({
      centre: recyclingBin.position.clone().setY(0),
      radius: 0.68,
      kind: "fixture",
    });

    const brochureStand = new THREE.Group();
    put(brochureStand, box(0.08, 1.45, 0.08, 0x7c9197), 0, 0.74, 0);
    put(brochureStand, box(0.88, 0.08, 0.58, 0x7c9197), 0, 0.05, 0);
    [0.62, 1.02, 1.42].forEach((y, index) => {
      const pocket = new THREE.Mesh(
        new RoundedBoxGeometry(0.16, 0.42, 0.78, 5, 0.05),
        material(index % 2 ? 0xb8dedb : 0x8ec3d3, 0.58),
      );
      pocket.position.set(-0.09, y, 0);
      brochureStand.add(pocket);
      put(brochureStand, box(0.035, 0.3, 0.58, 0xf7f5ef), -0.19, y + 0.08, 0);
    });
    brochureStand.position.set(10.25, 0, 5.65);
    brochureStand.rotation.y = 0.18;
    secondFloor.add(brochureStand);
    upperFamilyFurnitureObstacles.push({
      centre: brochureStand.position.clone().setY(0),
      radius: 0.76,
      kind: "fixture",
    });

    const waitingClock = new THREE.Group(),
      waitingClockFace = cyl(0.46, 0.08, 0xf7f5ef, 28);
    waitingClockFace.rotation.x = Math.PI / 2;
    waitingClock.add(waitingClockFace);
    [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((angle) => {
      const tick = box(0.045, 0.13, 0.035, 0x55717c);
      tick.position.set(Math.sin(angle) * 0.33, Math.cos(angle) * 0.33, 0.06);
      tick.rotation.z = -angle;
      waitingClock.add(tick);
    });
    const waitingHour = box(0.045, 0.22, 0.04, 0x55717c),
      waitingMinute = box(0.045, 0.3, 0.04, 0x55717c);
    waitingHour.position.set(-0.06, 0.07, 0.06);
    waitingHour.rotation.z = -0.55;
    waitingMinute.position.set(0.08, -0.04, 0.06);
    waitingMinute.rotation.z = 0.92;
    waitingClock.add(waitingHour, waitingMinute);
    waitingClock.position.copy(
      upperServiceWallCentre.clone().addScaledVector(elevatorInward, -0.08),
    );
    waitingClock.position.y = 2.68;
    waitingClock.lookAt(
      waitingClock.position.clone().add(elevatorInward),
    );
    secondFloor.add(waitingClock);

    type UpperFamilyRestActivity = "conversation" | "quiet";
    type UpperFamilyTaskKind = "screen" | "water";
    const upperFamilyActors: {
      walker: Walker;
      familyGroup: 1 | 2 | 3;
      restActivity: UpperFamilyRestActivity;
      phase: number;
      basePosition: THREE.Vector3;
      baseYaw: number;
      seatExit: THREE.Vector3;
      activeTask?: UpperFamilyTaskKind;
      phoneRaised: boolean;
      phoneChangeAt: number;
      cup: THREE.Group;
      cupWater: THREE.Mesh;
      avoidanceOffset: THREE.Vector3;
    }[] = [];
    const familyColors = [
      0xb77f70, 0x7896ad, 0x9a9870, 0x8b7d9c, 0x699789, 0xa77f68,
      0x7688a5,
    ];
    const addUpperFamily = (
      familyGroup: 1 | 2 | 3,
      restActivity: UpperFamilyRestActivity,
      position: THREE.Vector3,
      yaw: number,
      gender: Gender,
      styleSeed: number,
    ) => {
      const walker = person(
        secondFloor,
        "patient",
        familyColors[styleSeed % familyColors.length],
        position.clone(),
        [position.clone()],
        0,
        undefined,
        gender,
        310 + styleSeed,
      );
      walker.group.userData.familyGroup = familyGroup;
      walker.group.userData.waitingRole = "companion";
      walker.group.userData.floor = 2;
      walker.group.rotation.y = yaw;
      walker.group.position.y = 0.14;
      walker.group.scale.set(1, 0.88, 1);
      walker.legs.forEach((leg, index) => {
        leg.position.set(index ? 0.14 : -0.14, 0.69, -0.3);
        leg.rotation.set(-Math.PI / 2, 0, 0);
      });
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const cup = new THREE.Group(),
        cupBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075, 0.06, 0.17, 14, 1, true),
          new THREE.MeshStandardMaterial({
            color: 0xf7fbfa,
            transparent: true,
            opacity: 0.9,
            roughness: 0.42,
          }),
        ),
        cupWater = cyl(0.058, 0.012, 0x78c7de, 14);
      cupBody.position.y = -0.08;
      cupWater.position.y = -0.012;
      cup.add(cupBody, cupWater);
      cup.position.set(0, -0.52, -0.08);
      cup.visible = false;
      walker.arms[1].add(cup);
      upperFamilyActors.push({
        walker,
        familyGroup,
        restActivity,
        phase: styleSeed * 0.73,
        basePosition: position.clone(),
        baseYaw: yaw,
        seatExit: position.clone().addScaledVector(forward, 1.35),
        phoneRaised: styleSeed % 2 === 0,
        phoneChangeAt: 6 + Math.random() * 9,
        cup,
        cupWater,
        avoidanceOffset: new THREE.Vector3(),
      });
    };

    // Family allocation: operating room 1 has three companions, operating
    // room 2 has two and the examination patient has two. Every companion owns
    // a seat; screen and water duties rotate across all seven people.
    [
      [1, "quiet", 0, "female", 0],
      [1, "conversation", 1, "male", 1],
      [1, "quiet", 2, "female", 2],
      [2, "quiet", 5, "male", 3],
      [2, "conversation", 6, "female", 4],
      [3, "quiet", 15, "female", 5],
      [3, "conversation", 16, "male", 6],
    ].forEach(([familyGroup, restActivity, seatIndex, gender, styleSeed]) => {
      const seat = upperWaitingSeats[seatIndex as number];
      addUpperFamily(
        familyGroup as 1 | 2 | 3,
        restActivity as UpperFamilyRestActivity,
        seat.position,
        seat.yaw,
        gender as Gender,
        styleSeed as number,
      );
    });
    const screenStart = new THREE.Vector3(0.28, 0, 1.7),
      screenEnd = new THREE.Vector3(0, 0, -5.5),
      screenScanEnd = new THREE.Vector3(-2.15, 0, -5.5),
      waterDirection = new THREE.Vector3()
        .subVectors(new THREE.Vector3(0, 0, 0), hydrationStation.position)
        .setY(0)
        .normalize(),
      waterEnd = hydrationStation.position
        .clone()
        .addScaledVector(waterDirection, 0.92)
        .setY(0),
      waterStart = waterEnd
        .clone()
        .addScaledVector(waterDirection, 1.55)
        .setY(0),
      // A clear cross-aisle between the front and rear waiting islands keeps
      // the upper waiting group away from chair rows and seated companions on
      // the way to the water station.
      upperWaterSideAisle = new THREE.Vector3(-7.15, 0, 1.05);
    const shuffledFamilyOrder = (lastFamily?: 1 | 2 | 3) => {
      const actorIndexes = upperFamilyActors.map((_, index) => index),
        isValid = (order: number[]) =>
          (!lastFamily ||
            upperFamilyActors[order[0]].familyGroup !== lastFamily) &&
          order.every(
            (actorIndex, index) =>
              index === 0 ||
              upperFamilyActors[order[index - 1]].familyGroup !==
                upperFamilyActors[actorIndex].familyGroup,
          );
      for (let attempt = 0; attempt < 80; attempt++) {
        const order = actorIndexes.slice();
        for (let index = order.length - 1; index > 0; index--) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
        }
        if (isValid(order)) return order;
      }
      const fallback = [0, 3, 1, 5, 2, 4, 6];
      if (lastFamily === 1) fallback.push(fallback.shift()!);
      return fallback;
    };
    type UpperFamilyTask = {
      kind: UpperFamilyTaskKind;
      routeStart: THREE.Vector3;
      routeEnd: THREE.Vector3;
      order: number[];
      orderIndex: number;
      activeActor: number | null;
      phase:
        | "idle"
        | "outbound"
        | "viewing"
        | "scanMove"
        | "activity"
        | "returning";
      phaseStart: number;
      nextStartAt: number;
      lastFamily?: 1 | 2 | 3;
    };
    const upperFamilyTasks: UpperFamilyTask[] = [
      {
        kind: "screen",
        routeStart: screenStart,
        routeEnd: screenEnd,
        order: shuffledFamilyOrder(),
        orderIndex: 0,
        activeActor: null,
        phase: "idle",
        phaseStart: 0,
        nextStartAt: 4,
      },
      {
        kind: "water",
        routeStart: waterStart,
        routeEnd: waterEnd,
        order: shuffledFamilyOrder(),
        orderIndex: 0,
        activeActor: null,
        phase: "idle",
        phaseStart: 0,
        nextStartAt: 11,
      },
    ];
    let lastUpperFamilyTaskActor: number | null = null;
    const upperFamilyTaskRestUntil = upperFamilyActors.map(() => 0);
    const UPPER_FAMILY_WALK_SPEED = 0.76,
      smoothUpperFamilyPath = (corners: THREE.Vector3[]) => {
        if (corners.length < 3) return corners.map((point) => point.clone());
        const smoothPoints = [corners[0].clone()];
        for (let index = 1; index < corners.length - 1; index++) {
          const previous = corners[index - 1],
            corner = corners[index],
            next = corners[index + 1],
            incomingLength = previous.distanceTo(corner),
            outgoingLength = corner.distanceTo(next),
            roundingDistance = Math.min(
              index === 1 ? 0.34 : 0.62,
              incomingLength * 0.28,
              outgoingLength * 0.28,
            ),
            entry = corner
              .clone()
              .addScaledVector(
                previous.clone().sub(corner).normalize(),
                roundingDistance,
              ),
            exit = corner
              .clone()
              .addScaledVector(
                next.clone().sub(corner).normalize(),
                roundingDistance,
              );
          if (smoothPoints[smoothPoints.length - 1].distanceTo(entry) > 0.02)
            smoothPoints.push(entry);
          const cornerCurve = new THREE.QuadraticBezierCurve3(
            entry,
            corner,
            exit,
          );
          smoothPoints.push(...cornerCurve.getSpacedPoints(7).slice(1));
        }
        smoothPoints.push(corners[corners.length - 1].clone());
        return smoothPoints;
      },
      upperFamilyPath = (
        actor: (typeof upperFamilyActors)[number],
        task: UpperFamilyTask,
      ) => {
        const centreAisle = new THREE.Vector3(
            screenStart.x,
            0,
            actor.seatExit.z,
          ),
          points = [actor.basePosition, actor.seatExit];
        // Visitors seated in the two front islands already face the display.
        // Let them cross the open floor diagonally instead of walking back to
        // the centre aisle and making an artificial ninety-degree turn.
        if (task.kind === "screen" && actor.basePosition.z < 1.5) {
          points.push(screenEnd);
          return smoothUpperFamilyPath(points);
        }
        // The upper waiting group must not take the old long diagonal through
        // the seating islands. After stepping out in front of the owned chair,
        // cross through the open gap between the front and rear islands, then
        // follow the wall-side approach to the water station.
        if (task.kind === "water" && actor.basePosition.z > 2.2) {
          const seatDepartureDirection = actor.seatExit
              .clone()
              .sub(actor.basePosition)
              .normalize(),
            seatClearPoint = actor.seatExit
              .clone()
              .addScaledVector(seatDepartureDirection, 0.68),
            rearCrossAisle = new THREE.Vector3(
              screenStart.x,
              0,
              seatClearPoint.z,
            );
          // Continue straight beyond the normal chair-front point before any
          // lateral turn. This is especially important for the rightmost seat:
          // rounding now begins only after the character has fully cleared the
          // complete chair row, eliminating the old chair-hugging slide.
          points.push(
            seatClearPoint,
            rearCrossAisle,
            upperWaterSideAisle,
            waterStart,
            waterEnd,
          );
          return smoothUpperFamilyPath(points);
        }
        // The left-front group may still use its shorter exterior approach
        // once it has fully cleared the chair row.
        if (
          task.kind === "water" &&
          actor.basePosition.x < 0 &&
          actor.basePosition.z < 1.5
        ) {
          const seatDepartureDirection = actor.seatExit
              .clone()
              .sub(actor.basePosition)
              .normalize(),
            seatClearPoint = actor.seatExit
              .clone()
              .addScaledVector(seatDepartureDirection, 0.74),
            frontLeftOuterAisle = new THREE.Vector3(
              -6.1,
              0,
              seatClearPoint.z,
            ),
            frontLeftWallTurn = new THREE.Vector3(-6.9, 0, 0.2);
          // The camera's upper-left island is this world-space front-left
          // group.  Its rightmost companion must walk straight beyond the
          // whole chair row before turning into the exterior aisle. Keep that
          // aisle pulled toward the waiting island so the route remains clear
          // of operating room 1's doorway and report circulation zone.
          points.push(
            seatClearPoint,
            frontLeftOuterAisle,
            frontLeftWallTurn,
            waterStart,
            waterEnd,
          );
          return smoothUpperFamilyPath(points);
        }
        points.push(centreAisle);
        // The central aisle runs between the waiting islands. Water visitors
        // use its upper junction before turning toward the wall station; screen
        // visitors can continue straight toward the display.
        if (
          task.kind === "water" &&
          centreAisle.distanceTo(screenStart) > 0.05
        )
          points.push(screenStart);
        if (task.kind === "water") points.push(task.routeStart);
        points.push(task.routeEnd);
        return smoothUpperFamilyPath(points);
      },
      upperFamilyPathLength = (points: THREE.Vector3[]) =>
        points.slice(1).reduce(
          (distance, point, index) =>
            distance + point.distanceTo(points[index]),
          0,
        ),
      upperFamilyPathPoint = (
        points: THREE.Vector3[],
        distance: number,
      ) => {
        let remaining = Math.max(0, distance);
        for (let index = 1; index < points.length; index++) {
          const segmentLength = points[index - 1].distanceTo(points[index]);
          if (remaining <= segmentLength) {
            const progress = segmentLength > 0 ? remaining / segmentLength : 1;
            const position = new THREE.Vector3().lerpVectors(
              points[index - 1],
              points[index],
              progress,
            );
            return { position, lookAt: points[index].clone() };
          }
          remaining -= segmentLength;
        }
        return {
          position: points[points.length - 1].clone(),
          lookAt: points[points.length - 1].clone(),
        };
      },
      placeAlongUpperFamilyPath = (
        actor: (typeof upperFamilyActors)[number],
        points: THREE.Vector3[],
        distance: number,
        frameDelta: number,
        extraClearance = 0,
      ) => {
        const { position: nominalPosition, lookAt } = upperFamilyPathPoint(
            points,
            distance,
          ),
          travelDirection = lookAt.clone().sub(nominalPosition).setY(0),
          desiredOffset = new THREE.Vector3();
        if (travelDirection.lengthSq() > 0.0001) travelDirection.normalize();
        else
          travelDirection.set(
            -Math.sin(actor.walker.group.rotation.y),
            0,
            -Math.cos(actor.walker.group.rotation.y),
          );
        const lateral = new THREE.Vector3(
          -travelDirection.z,
          0,
          travelDirection.x,
        );
        upperFamilyActors.forEach((other, otherIndex) => {
          if (other === actor) return;
          const gap = nominalPosition
              .clone()
              .sub(other.walker.group.position)
              .setY(0),
            distanceToPerson = gap.length(),
            awarenessRadius = 1.08 + extraClearance;
          if (distanceToPerson >= awarenessRadius) return;
          const urgency = 1 - distanceToPerson / awarenessRadius,
            cross = travelDirection.x * gap.z - travelDirection.z * gap.x,
            actorIndex = upperFamilyActors.indexOf(actor),
            side = Math.abs(cross) > 0.06
              ? Math.sign(cross)
              : (actorIndex + otherIndex) % 2
                ? 1
                : -1;
          desiredOffset.addScaledVector(lateral, side * urgency * 0.52);
          const minimumDistance = 0.62 + extraClearance;
          if (distanceToPerson < minimumDistance) {
            if (gap.lengthSq() < 0.0001)
              gap.copy(lateral).multiplyScalar(side);
            else gap.normalize();
            desiredOffset.addScaledVector(
              gap,
              (minimumDistance + 0.02 - distanceToPerson) * 0.72,
            );
          }
        });
        const maximumOffset = 0.55 + extraClearance * 0.5;
        if (desiredOffset.length() > maximumOffset)
          desiredOffset.setLength(maximumOffset);
        actor.avoidanceOffset.lerp(
          desiredOffset,
          Math.min(1, frameDelta * (desiredOffset.lengthSq() ? 4.6 : 3.1)),
        );
        const resolvedPosition = nominalPosition
          .clone()
          .add(actor.avoidanceOffset);
        // Furniture remains solid even while a companion side-steps another
        // person.  Resolve against every waiting-room prop after applying the
        // people-avoidance offset so that a detour can never push the actor
        // through a chair, table, planter or wall-side fixture.  The person's
        // own chair is the sole exception, allowing a natural return to their
        // assigned seat.
        for (let pass = 0; pass < 3; pass++)
          upperFamilyFurnitureObstacles.forEach((obstacle) => {
            if (
              obstacle.kind === "seat" &&
              obstacle.centre.distanceToSquared(actor.basePosition) < 0.02
            )
              return;
            const separation = resolvedPosition
                .clone()
                .sub(obstacle.centre)
                .setY(0),
              distanceToProp = separation.length();
            if (distanceToProp >= obstacle.radius + extraClearance) return;
            if (distanceToProp < 0.001) {
              separation.set(-travelDirection.z, 0, travelDirection.x);
              if (separation.lengthSq() < 0.001) separation.set(1, 0, 0);
            } else separation.divideScalar(distanceToProp);
            resolvedPosition
              .copy(obstacle.centre)
              .addScaledVector(
                separation,
                obstacle.radius + extraClearance + 0.015,
              );
          });
        actor.avoidanceOffset.copy(resolvedPosition).sub(nominalPosition);
        actor.walker.group.position.copy(resolvedPosition);
        if (lookAt.distanceToSquared(nominalPosition) > 0.0001)
          actor.walker.group.rotation.y = facingYaw(
            actor.walker.group.position,
            lookAt.clone().add(actor.avoidanceOffset),
          );
      };

    type UpperReportPhase =
      | "idle"
      | "approaching"
      | "doorPause"
      | "opening"
      | "outbound"
      | "gathering"
      | "briefing"
      | "returnPause"
      | "returnOpening"
      | "returning"
      | "returnInterior"
      | "closing";
    type UpperReportParticipant = {
      actorIndex: number;
      resumePosition: THREE.Vector3;
      resumeYaw: number;
      resumeAvoidanceOffset: THREE.Vector3;
      resumeTaskKind?: UpperFamilyTaskKind;
      resumeTaskPhase?: UpperFamilyTask["phase"];
      resumeTaskElapsed?: number;
      returnComplete: boolean;
      gatherPosition: THREE.Vector3;
      gatherPath: THREE.Vector3[];
      gatherLength: number;
      returnPath: THREE.Vector3[];
      returnLength: number;
    };
    type UpperORReportState = {
      room: 1 | 2;
      familyGroup: 1 | 2;
      nurse: (typeof upperClinicalActors)[number];
      door: UpperOperatingDoor;
      nurseBasePosition: THREE.Vector3;
      doorWaitPoint: THREE.Vector3;
      reportPoint: THREE.Vector3;
      nurseApproachPath: THREE.Vector3[];
      nurseApproachLength: number;
      nurseExitPath: THREE.Vector3[];
      nurseExitLength: number;
      nurseReturnPath: THREE.Vector3[];
      nurseReturnLength: number;
      nurseInteriorPath: THREE.Vector3[];
      nurseInteriorLength: number;
      phase: UpperReportPhase;
      phaseStart: number;
      nextStartAt: number;
      briefingDuration: number;
      familyGatherStart: number;
      familyTravelDuration: number;
      familyReturnStart: number;
      nurseTravelDuration: number;
      participants: UpperReportParticipant[];
    };
    const upperReportingFamilyGroups = new Set<1 | 2>(),
      upperORReportStates: UpperORReportState[] = upperOperatingDoors.map(
        (door) => {
          const nurse = upperClinicalActors.find(
            (actor) =>
              actor.room === door.room && actor.job === "circulatingNurse",
          )!;
          const nurseBasePosition = nurse.walker.group.position.clone(),
            doorWaitPoint = door.centre
              .clone()
              .addScaledVector(door.out, 0.78),
            sideAisleFar = door.centre
              .clone()
              .addScaledVector(door.out, 3.55)
              .addScaledVector(door.tan, 4.28),
            sideAisleNear = door.centre
              .clone()
              .addScaledVector(door.out, 1.55)
              .addScaledVector(door.tan, 3.55),
            doorwayTurn = door.centre
              .clone()
              .addScaledVector(door.out, 0.92)
              .addScaledVector(door.tan, 2.15),
            reportPoint = door.centre
              .clone()
              .addScaledVector(door.out, -1.55),
            nurseApproachPath = smoothUpperFamilyPath([
              nurseBasePosition,
              sideAisleFar,
              sideAisleNear,
              doorwayTurn,
              doorWaitPoint,
            ]),
            nurseExitPath = smoothUpperFamilyPath([
              doorWaitPoint,
              door.centre.clone(),
              reportPoint,
            ]),
            nurseReturnPath = smoothUpperFamilyPath([
              reportPoint,
              door.centre.clone(),
              doorWaitPoint,
            ]),
            nurseInteriorPath = smoothUpperFamilyPath([
              doorWaitPoint,
              doorwayTurn,
              sideAisleNear,
              sideAisleFar,
              nurseBasePosition,
            ]);
          return {
            room: door.room,
            familyGroup: door.room,
            nurse,
            door,
            nurseBasePosition,
            doorWaitPoint,
            reportPoint,
            nurseApproachPath,
            nurseApproachLength: upperFamilyPathLength(nurseApproachPath),
            nurseExitPath,
            nurseExitLength: upperFamilyPathLength(nurseExitPath),
            nurseReturnPath,
            nurseReturnLength: upperFamilyPathLength(nurseReturnPath),
            nurseInteriorPath,
            nurseInteriorLength: upperFamilyPathLength(nurseInteriorPath),
            phase: "idle",
            phaseStart: 0,
            nextStartAt: door.room === 1 ? 18 : 42,
            briefingDuration: 8,
            familyGatherStart: 0,
            familyTravelDuration: 0,
            familyReturnStart: 0,
            nurseTravelDuration: 0,
            participants: [],
          };
        },
      );

    const beginUpperReportFamilyGather = (
      report: UpperORReportState,
      startTime: number,
    ) => {
      const { door } = report,
        familyIndexes = upperFamilyActors
          .map((actor, index) => ({ actor, index }))
          .filter(({ actor }) => actor.familyGroup === report.familyGroup),
        offsets =
          familyIndexes.length === 3 ? [-1.12, 0, 1.12] : [-0.58, 0.58],
        // Rebuild the lineup from everyone's live location for every
        // briefing. Matching the same lateral order to the available slots
        // prevents crossing paths without permanently assigning one relative
        // to the left, centre or right position.
        orderedFamilyIndexes = familyIndexes.slice().sort((a, b) => {
          const lateralDifference =
            a.actor.walker.group.position.dot(door.tan) -
            b.actor.walker.group.position.dot(door.tan);
          if (Math.abs(lateralDifference) > 0.04) return lateralDifference;
          return (
            a.actor.walker.group.position.distanceTo(report.reportPoint) -
            b.actor.walker.group.position.distanceTo(report.reportPoint)
          );
        });
      report.participants = orderedFamilyIndexes.map(
        ({ actor, index }, participantIndex) => {
          const resumePosition = actor.walker.group.position.clone().setY(0),
            resumeAvoidanceOffset = actor.avoidanceOffset.clone(),
            interruptedTask = actor.activeTask
              ? upperFamilyTasks.find(
                  (task) =>
                    task.kind === actor.activeTask && task.activeActor === index,
                )
              : undefined;
          // The current world position already includes any prior
          // people-avoidance offset. Clear the old offset before the report
          // path starts so it cannot create a sideways jump.
          actor.avoidanceOffset.set(0, 0, 0);
          const gatherPosition = report.reportPoint
              .clone()
              .addScaledVector(door.out, -1.28)
              .addScaledVector(door.tan, offsets[participantIndex] || 0),
            // A seated companion must first step into the clear space
            // directly in front of their own chair. Only then may they turn
            // toward the nurse. Returning reverses the same safe route.
            isAtAssignedSeat =
              resumePosition.distanceToSquared(actor.basePosition) < 0.2,
            departurePoints = isAtAssignedSeat
              ? [resumePosition, actor.seatExit]
              : [resumePosition],
            gatherPath = smoothUpperFamilyPath([
              ...departurePoints,
              gatherPosition,
            ]);
          return {
            actorIndex: index,
            resumePosition,
            resumeYaw: actor.walker.group.rotation.y,
            resumeAvoidanceOffset,
            resumeTaskKind: interruptedTask?.kind,
            resumeTaskPhase: interruptedTask?.phase,
            resumeTaskElapsed: interruptedTask
              ? Math.max(0, startTime - interruptedTask.phaseStart)
              : undefined,
            returnComplete: false,
            gatherPosition,
            gatherPath,
            gatherLength: upperFamilyPathLength(gatherPath),
            returnPath: [],
            returnLength: 0,
          };
        },
      );
      report.familyGatherStart = startTime;
      report.familyTravelDuration =
        Math.max(
          ...report.participants.map((participant) => participant.gatherLength),
        ) / UPPER_FAMILY_WALK_SPEED;
      upperReportingFamilyGroups.add(report.familyGroup);
    };

    // Move the full reception ensemble toward the entrance. The narrower arch
    // leaves a walkable passage on each side into the pharmacy behind it.
    const RECEPTION_SHIFT = 2.25;
    const nicheBorder = new THREE.Mesh(
      roundedTopGeometry(7.8, 4.72, 0.5, 1.22),
      material(0xf7f3ed, 0.62),
    );
    nicheBorder.position.set(0, 0.06, -8.42 + RECEPTION_SHIFT);
    nicheBorder.castShadow = true;
    scene.add(nicheBorder);
    const pharmacyWallSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.96),
      new THREE.MeshBasicMaterial({
        map: canvasTexture("藥局", "PHARMACY"),
        transparent: true,
        alphaTest: 0.02,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -8,
        polygonOffsetUnits: -8,
      }),
    );
    pharmacyWallSign.position.set(0, 3.15, -8.79 + RECEPTION_SHIFT);
    pharmacyWallSign.rotation.y = Math.PI;
    pharmacyWallSign.renderOrder = 24;
    scene.add(pharmacyWallSign);
    for (let x = -3.45; x <= 3.45; x += 0.34)
      if (Math.abs(x) > 2.62)
        put(
          scene,
          box(0.22, 3.8, 0.24, 0xd8aa69),
          x,
          2.08,
          -8.03 + RECEPTION_SHIFT,
        );
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xfff7e7,
      roughness: 0.5,
      emissive: 0xffd991,
      emissiveIntensity: 0.28,
    });
    const frame = new THREE.Mesh(
      roundedTopGeometry(5.35, 4.12, 0.34, 1.18),
      frameMat,
    );
    frame.position.set(0, 0.18, -7.96 + RECEPTION_SHIFT);
    frame.castShadow = true;
    scene.add(frame);
    const panel = new THREE.Mesh(
      roundedTopGeometry(4.85, 3.72, 0.38, 1.02),
      material(0xf6f1e8),
    );
    panel.position.set(0, 0.34, -7.72 + RECEPTION_SHIFT);
    panel.castShadow = true;
    scene.add(panel);
    const deskShape = new THREE.Shape();
    deskShape.moveTo(-3.35, 0.65);
    deskShape.lineTo(-3.35, -0.18);
    deskShape.quadraticCurveTo(-3.3, -0.94, -2.55, -1.05);
    deskShape.quadraticCurveTo(0, -1.45, 2.55, -1.05);
    deskShape.quadraticCurveTo(3.3, -0.94, 3.35, -0.18);
    deskShape.lineTo(3.35, 0.65);
    deskShape.lineTo(2.35, 0.65);
    deskShape.lineTo(2.35, -0.14);
    deskShape.quadraticCurveTo(0, -0.55, -2.35, -0.14);
    deskShape.lineTo(-2.35, 0.65);
    deskShape.closePath();
    const deskLayer = (height: number, color: number, y: number, scale = 1) => {
      const geo = new THREE.ExtrudeGeometry(deskShape, {
        depth: height,
        bevelEnabled: true,
        bevelThickness: 0.06,
        bevelSize: 0.06,
        bevelSegments: 3,
      });
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, material(color));
      mesh.position.set(0, y, -6.15 + RECEPTION_SHIFT);
      mesh.scale.set(scale, 1, scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };
    deskLayer(0.2, BLUE, 0.04, 1.015);
    deskLayer(1.12, 0xf7f3ed, 0.2);
    deskLayer(0.15, 0xffffff, 1.34, 1.025);
    obs.push(
      {
        minX: -3.6,
        maxX: 3.6,
        minZ: -5.18 + RECEPTION_SHIFT,
        maxZ: -4.42 + RECEPTION_SHIFT,
      },
      {
        minX: -3.6,
        maxX: -2.28,
        minZ: -6.9 + RECEPTION_SHIFT,
        maxZ: -4.42 + RECEPTION_SHIFT,
      },
      {
        minX: 2.28,
        maxX: 3.6,
        minZ: -6.9 + RECEPTION_SHIFT,
        maxZ: -4.42 + RECEPTION_SHIFT,
      },
    );
    const qrStand = new THREE.Group();
    put(qrStand, box(0.62, 0.72, 0.05, 0xffffff), 0, 0.36, 0);
    const qrFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.6),
      new THREE.MeshBasicMaterial({
        map: qrTexture(
          "CHECK-IN",
          `${window.location.origin}/qr/reception-checkin`,
        ),
        side: THREE.DoubleSide,
      }),
    );
    qrFace.position.set(0, 0.37, 0.031);
    qrFace.userData = { interactive: "qr", qrId: "reception-checkin" };
    interactive.push(qrFace);
    qrStand.add(qrFace);
    put(qrStand, box(0.78, 0.06, 0.38, 0x6f8791), 0, 0.03, 0.08);
    qrStand.position.set(1.9, 1.5, -4.92 + RECEPTION_SHIFT);
    qrStand.rotation.x = -0.08;
    scene.add(qrStand);
    const logoLoader = new THREE.TextureLoader();
    logoLoader.load("/logo-h.png", (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const printed = new THREE.MeshBasicMaterial({
          map: t,
          transparent: true,
          alphaTest: 0.02,
          depthTest: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -8,
          polygonOffsetUnits: -8,
        }),
        segments = 24,
        width = 2.42,
        height = 0.62,
        positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
      for (let row = 0; row < 2; row++)
        for (let i = 0; i <= segments; i++) {
          const u = i / segments,
            x = (u - 0.5) * width,
            curveT = (x + 2.55) / 5.1,
            curveY = -1.05 - 0.8 * curveT * (1 - curveT),
            z = -6.15 + RECEPTION_SHIFT - curveY + 0.055;
          positions.push(x, 0.55 + row * height, z);
          uvs.push(u, row);
        }
      for (let i = 0; i < segments; i++) {
        const a = i,
          b = i + 1,
          c = i + segments + 1,
          d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const counterLogo = new THREE.Mesh(geo, printed);
      counterLogo.renderOrder = 20;
      scene.add(counterLogo);
    });
    logoLoader.load("/logo-icon.png", (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      const printed = new THREE.MeshBasicMaterial({
        map: t,
        transparent: true,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const wallLogo = new THREE.Mesh(
        new THREE.PlaneGeometry(1.55, 1.55),
        printed,
      );
      wallLogo.position.set(0, 2.65, -7.47 + RECEPTION_SHIFT);
      scene.add(wallLogo);
    });
    [-3.05, 3.05].forEach((x) => {
      put(
        scene,
        cyl(0.025, 0.92, 0x8a6947, 10),
        x,
        3.78,
        -7.42 + RECEPTION_SHIFT,
      );
      put(
        scene,
        cyl(0.12, 0.16, 0xd2a15f, 16),
        x,
        3.28,
        -7.42 + RECEPTION_SHIFT,
      );
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.23, 24, 18),
        new THREE.MeshStandardMaterial({
          color: 0xfff8df,
          emissive: 0xffd98b,
          emissiveIntensity: 1.2,
          roughness: 0.28,
        }),
      );
      bulb.position.set(x, 3.08, -7.42 + RECEPTION_SHIFT);
      scene.add(bulb);
      const glow = new THREE.PointLight(0xffe4a8, 1.4, 4.5, 2);
      glow.position.copy(bulb.position);
      scene.add(glow);
    });
    largePlant(scene, -4.18, -6 + RECEPTION_SHIFT, 1.05);
    largePlant(scene, 4.18, -6 + RECEPTION_SHIFT, 1.05);
    obs.push(
      {
        minX: -4.78,
        maxX: -3.58,
        minZ: -6.6 + RECEPTION_SHIFT,
        maxZ: -5.4 + RECEPTION_SHIFT,
      },
      {
        minX: 3.58,
        maxX: 4.78,
        minZ: -6.6 + RECEPTION_SHIFT,
        maxZ: -5.4 + RECEPTION_SHIFT,
      },
    );
    smallPlant(scene, -1.75, -5.25 + RECEPTION_SHIFT, 0.72, 1.48);

    // A deeper pharmacy with shelves mounted directly to the rear face of the
    // reception wall; the rear remains open and both side passages stay wide.
    const pharmacyFloor = box(11.7, 0.08, 2.85, 0xe9f3ef);
    pharmacyFloor.position.set(0, 0.09, -7.45);
    scene.add(pharmacyFloor);
    const pharmacyShelfZ = -8.84 + RECEPTION_SHIFT;
    [-2.75, 0, 2.75].forEach((sx, row) => {
      const shelf = box(2.35, 2.35, 0.35, 0xf4efe6);
      shelf.position.set(sx, 1.2, pharmacyShelfZ);
      scene.add(shelf);
      for (let level = 0; level < 4; level++) {
        put(
          scene,
          box(2.25, 0.07, 0.46, 0xcda66f),
          sx,
          0.4 + level * 0.55,
          pharmacyShelfZ - 0.18,
        );
        for (let k = -4; k <= 4; k++) {
          const colors = [0x68b7bd, 0xe3a468, 0x8ebc78, 0x7896c4, 0xd9878d],
            pack = box(
              0.17,
              0.28,
              0.14,
              colors[(k + level + row + 9) % colors.length],
            );
          pack.position.set(
            sx + k * 0.23,
            0.57 + level * 0.55,
            pharmacyShelfZ - 0.42,
          );
          scene.add(pack);
        }
      }
    });
    // Packing bench opposite the medicine shelves. The centre aisle and both side
    // passages stay open so pharmacists can visibly move between picking and
    // packing stations.
    const pharmacyBench = new THREE.Group(),
      benchBody = new THREE.Mesh(
        new RoundedBoxGeometry(7.55, 0.78, 0.72, 6, 0.12),
        material(0xf7f3ed, 0.62),
      ),
      benchTop = new THREE.Mesh(
        new RoundedBoxGeometry(7.72, 0.14, 0.84, 6, 0.08),
        material(0xffffff, 0.55),
      );
    benchBody.position.y = 0.5;
    benchTop.position.y = 0.96;
    pharmacyBench.add(benchBody, benchTop);
    pharmacyBench.position.set(0, 0, -8.4);
    scene.add(pharmacyBench);
    obs.push({ minX: -4.02, maxX: 4.02, minZ: -8.82, maxZ: -7.97 });
    [-2.15, 2.15].forEach((x, i) => {
      put(pharmacyBench, box(0.72, 0.035, 0.42, 0x8eb7b7), x, 1.06, 0.02);
      for (let k = 0; k < 3; k++)
        put(
          pharmacyBench,
          box(0.15, 0.2, 0.11, [0x68b7bd, 0xe3a468, 0x8ebc78][(i + k) % 3]),
          x - 0.22 + k * 0.22,
          1.19,
          0.02,
        );
    });
    const makeMedicineBag = (x: number, z: number) => {
      const g = new THREE.Group(),
        bag = new THREE.Mesh(
          new RoundedBoxGeometry(0.46, 0.56, 0.09, 4, 0.045),
          material(0xf7f4ea, 0.7),
        ),
        handle = new THREE.Mesh(
          new THREE.TorusGeometry(0.13, 0.023, 8, 18, Math.PI),
          material(0x7895a0, 0.65),
        );
      bag.position.y = 0.28;
      handle.position.set(0, 0.57, 0);
      handle.rotation.z = Math.PI;
      g.add(bag, handle);
      put(g, box(0.13, 0.035, 0.014, CYAN), 0, 0.3, -0.052);
      put(g, box(0.035, 0.13, 0.014, CYAN), 0, 0.3, -0.054);
      g.position.set(x, 1.08, z);
      scene.add(g);
      return g;
    };
    [-3.15, 3.15].forEach((x) => makeMedicineBag(x, -8.35));
    const pharmacyShelfWorkPoints = [
        new THREE.Vector3(-2.15, 0, -7.48),
        new THREE.Vector3(2.15, 0, -7.48),
      ],
      pharmacyBenchWorkPoints = [
        new THREE.Vector3(-2.15, 0, -7.72),
        new THREE.Vector3(2.15, 0, -7.72),
      ];
    // Pharmacists use the open side passage, round the rear corner of the U-shaped
    // counter, and enter through its back opening. No segment cuts through the counter.
    const pharmacyTransferPaths = pharmacyBenchWorkPoints.map((bench, i) => {
      const side = i ? 1 : -1;
      return [
        bench.clone(),
        new THREE.Vector3(side * 4.82, 0, -7.05),
        new THREE.Vector3(side * 4.62, 0, -5.42),
        new THREE.Vector3(side * 3.92, 0, -5.16),
        new THREE.Vector3(side * 2.02, 0, -5.16),
        new THREE.Vector3(side * 0.95, 0, -4.12),
      ];
    });
    const pointOnRoute = (points: THREE.Vector3[], progress: number) => {
      const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i])),
        total = lengths.reduce((sum, v) => sum + v, 0);
      let distance = THREE.MathUtils.clamp(progress, 0, 1) * total;
      for (let i = 0; i < lengths.length; i++) {
        if (distance <= lengths[i] || i === lengths.length - 1)
          return new THREE.Vector3().lerpVectors(
            points[i],
            points[i + 1],
            lengths[i] ? distance / lengths[i] : 1,
          );
        distance -= lengths[i];
      }
      return points[points.length - 1].clone();
    };
    // Reception and pharmacy are staff-only zones. The working nurse and
    // pharmacists use dedicated animation tracks, while all public navigation is
    // kept outside these bounds.
    obs.push(
      { minX: -4.05, maxX: 4.05, minZ: -5.35, maxZ: -2.94 },
      { minX: -6.2, maxX: 6.2, minZ: -9.05, maxZ: -5.28 },
    );

    // Four softly rounded waiting islands arranged like the supplied reference.
    const seatSpots: {
      pos: THREE.Vector3;
      yaw: number;
      release: THREE.Vector3;
      available: boolean;
    }[] = [];
    const addSeat = (
      x: number,
      z: number,
      color: number,
      yaw: number,
      releaseX: number,
      releaseZ: number,
      available = true,
    ) => {
      const id = seatSpots.length;
      if (available) chair(scene, x, z, color, yaw);
      const releaseDirection = new THREE.Vector3(releaseX, 0, releaseZ).normalize();
      seatSpots.push({
        pos: new THREE.Vector3(x, 0, z),
        yaw,
        available,
        // Every chair owns one outward-only release lane. Side chairs deliberately
        // back away from the table; front-facing chairs step toward the open aisle.
        release: new THREE.Vector3(x, 0, z).addScaledVector(
          releaseDirection,
          1.46,
        ),
      });
      if (available)
        obs.push({
          minX: x - 0.53,
          maxX: x + 0.53,
          minZ: z - 0.52,
          maxZ: z + 0.52,
          seatId: id,
        });
    };
    const makeRug = (
      cx: number,
      cz: number,
      w: number,
      d: number,
      color: number,
    ) => {
      const r = 0.72,
        s = new THREE.Shape();
      s.moveTo(-w / 2 + r, -d / 2);
      s.lineTo(w / 2 - r, -d / 2);
      s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
      s.lineTo(w / 2, d / 2 - r);
      s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
      s.lineTo(-w / 2 + r, d / 2);
      s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
      s.lineTo(-w / 2, -d / 2 + r);
      s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: 0.008,
        bevelEnabled: true,
        bevelSize: 0.012,
        bevelThickness: 0.002,
        bevelSegments: 3,
      });
      geo.rotateX(-Math.PI / 2);
      const rug = new THREE.Mesh(geo, material(color, 0.94));
      rug.position.set(cx, 0.077, cz);
      rug.receiveShadow = true;
      scene.add(rug);
    };
    const lobbyQrStations: { stand: THREE.Vector3; approach: THREE.Vector3 }[] =
      [];
    const waitingSeatRowZones: {
      island: number;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    }[] = [];
    const islands = [
      [-4.6, 0],
      [4.6, 0],
      [-6.25, 4.75],
      [6.25, 4.75],
    ];
    islands.forEach(([cx, cz], k) => {
      makeRug(cx, cz, 5.5, 3.65, k % 2 ? 0xc7e7e4 : 0xbde2df);
      // The three counter-side chairs form a narrow pocket between their backs,
      // the table and the planter. General navigation must treat the whole row as
      // one protected zone rather than trying to thread through the tiny gaps
      // between individual chair obstacles. An owned seat entry/exit temporarily
      // opens only the matching island later in navBlocked.
      waitingSeatRowZones.push({
        island: k,
        minX: cx - 1.82,
        maxX: cx + 1.82,
        minZ: cz - 1.55,
        maxZ: cz + 0.05,
      });
      // The two inner, counter-side chairs of the front islands used to release
      // straight into the busiest strip in front of reception. Bias their owned
      // access lanes toward the outside of each island, while preserving the
      // supplied chair positions and facing direction.
      const leftTopReleaseX = k === 1 ? 0.2 : 0,
        rightTopReleaseX = k === 0 ? -0.2 : 0;
      addSeat(
        cx - 1.05,
        cz - 0.75,
        k % 2 ? BLUE : CYAN,
        0,
        leftTopReleaseX,
        -1,
        k !== 1,
      );
      addSeat(cx, cz - 0.75, k % 2 ? CYAN : BLUE, 0, 0, -1);
      addSeat(
        cx + 1.05,
        cz - 0.75,
        k % 2 ? BLUE : CYAN,
        0,
        rightTopReleaseX,
        -1,
        k !== 0,
      );
      addSeat(cx - 1.65, cz + 0.38, CYAN, -Math.PI / 2, -1, 0);
      addSeat(cx + 1.65, cz + 0.38, BLUE, Math.PI / 2, 1, 0);
      const tableZ = cz + 0.42;
      table(
        scene,
        cx,
        tableZ,
        `waiting-table-${k + 1}` as QrId,
        interactive,
      );
      lobbyQrStations.push({
        stand: new THREE.Vector3(cx - 0.35, 0, tableZ + 0.3),
        approach: new THREE.Vector3(cx - 0.35, 0, tableZ + 1.58),
      });
      // Mirror the decorative planter on both left-hand waiting islands so it
      // occupies the rug's upper-left corner; right-hand islands retain their
      // upper-right placement.
      const waitingPlantX = cx + (cx < 0 ? -2.15 : 2.15);
      smallPlant(scene, waitingPlantX, cz - 1.05, 0.82);
      obs.push(
        // Match the round tabletop's real footprint. The previous oversized box
        // overlapped every front-row seated patient's standing position, so the
        // collision system declared them blocked before their first step.
        {
          minX: cx - 0.8,
          maxX: cx + 0.8,
          minZ: tableZ - 0.8,
          maxZ: tableZ + 0.8,
        },
        {
          minX: waitingPlantX - 0.5,
          maxX: waitingPlantX + 0.5,
          minZ: cz - 1.55,
          maxZ: cz - 0.55,
        },
      );
    });
    // Floor-to-ceiling glazed entrance walls preserve the fan outline while
    // opening the lobby visually toward the street.
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xbfe5e8,
      transparent: true,
      opacity: 0.34,
      roughness: 0.08,
      metalness: 0,
      transmission: 0.28,
      side: THREE.DoubleSide,
    });
    [-1, 1].forEach((side) => {
      for (let i = 0; i < 5; i++) {
        const sx = side * (4.25 + i * 2.18),
          sz = 7.95 - i * 0.28,
          rot = side * (0.07 + i * 0.045),
          seg = new THREE.Mesh(
            new RoundedBoxGeometry(2.55, 3.35, 0.14, 4, 0.05),
            glassMat,
          );
        seg.position.set(sx, 1.72, sz);
        seg.rotation.y = rot;
        scene.add(seg);
        const sill = box(2.62, 0.18, 0.28, CREAM);
        sill.position.set(sx, 0.12, sz);
        sill.rotation.y = rot;
        scene.add(sill);
        [-1.28, 1.28].forEach((edge) => {
          const post = box(0.12, 3.55, 0.2, CREAM);
          post.position.set(
            sx + Math.cos(rot) * edge,
            1.78,
            sz - Math.sin(rot) * edge,
          );
          post.rotation.y = rot;
          scene.add(post);
        });
        obs.push({
          minX: sx - 1.42,
          maxX: sx + 1.42,
          minZ: sz - 0.58,
          maxZ: sz + 0.58,
        });
      }
    });
    // Clay-style automatic glass entrance based on the supplied reference. The
    // portal is flush with the curtain-wall line. The leaves retract slightly
    // toward the lobby before sliding completely clear along the glazing's
    // interior face, never passing through the glass.
    const revolvingDoorCenter = new THREE.Vector3(0, 0, 7.82),
      automaticDoor = new THREE.Group(),
      revolvingDoorTransitSpeed = 1.02,
      revolvingBlue = material(0x5b9dcb, 0.42),
      drumGlassMat = new THREE.MeshPhysicalMaterial({
        color: 0xc8eef0,
        transparent: true,
        opacity: 0.4,
        roughness: 0.06,
        metalness: 0,
        transmission: 0.34,
        side: THREE.DoubleSide,
      });
    automaticDoor.position.copy(revolvingDoorCenter);
    scene.add(automaticDoor);
    const outerHeader = new THREE.Mesh(
        new RoundedBoxGeometry(4.35, 0.48, 0.46, 8, 0.16),
        revolvingBlue,
      ),
      leftPortalPost = new THREE.Mesh(
        new RoundedBoxGeometry(0.38, 3.12, 0.46, 8, 0.14),
        revolvingBlue,
      ),
      rightPortalPost = leftPortalPost.clone(),
      sensor = new THREE.Mesh(
        new RoundedBoxGeometry(0.72, 0.2, 0.22, 6, 0.07),
        material(0x334b59, 0.55),
      ),
      lowerTrack = new THREE.Mesh(
        new RoundedBoxGeometry(3.82, 0.08, 0.24, 4, 0.025),
        material(0xb7c8cd, 0.4),
      );
    outerHeader.position.set(0, 2.92, 0);
    leftPortalPost.position.set(-2.0, 1.46, 0);
    rightPortalPost.position.set(2.0, 1.46, 0);
    sensor.position.set(0, 3.13, 0.25);
    lowerTrack.position.set(0, 0.07, -0.02);
    automaticDoor.add(
      outerHeader,
      leftPortalPost,
      rightPortalPost,
      sensor,
      lowerTrack,
    );
    // Bridge the fixed gap between the automatic-door frame and the first
    // curtain-wall panels. The sliding leaves travel behind these white pocket
    // columns, so the opening remains full-width while no daylight seam is left
    // beside either portal post.
    [-1, 1].forEach((side) => {
      const pocketColumn = new THREE.Mesh(
        new RoundedBoxGeometry(0.82, 3.48, 0.34, 6, 0.08),
        material(0xffffff, 0.5),
      );
      pocketColumn.position.set(side * 2.6, 1.74, 7.86);
      pocketColumn.castShadow = true;
      scene.add(pocketColumn);
      obs.push({
        minX: side < 0 ? -3.02 : 2.18,
        maxX: side < 0 ? -2.18 : 3.02,
        minZ: 7.56,
        maxZ: 8.16,
      });
    });
    const slidingDoorLeafWidth = 1.82,
      makeSlidingLeaf = (side: -1 | 1) => {
        const leaf = new THREE.Group(),
          panel = new THREE.Mesh(
            new RoundedBoxGeometry(
              slidingDoorLeafWidth,
              2.58,
              0.085,
              6,
              0.035,
            ),
            drumGlassMat,
          );
        panel.position.y = 1.39;
        panel.castShadow = true;
        leaf.add(panel);
        const outerRail = box(0.085, 2.62, 0.1, 0x5b9dcb, 0.45),
          innerRail = box(0.085, 2.62, 0.1, 0x5b9dcb, 0.45),
          topRail = box(slidingDoorLeafWidth, 0.085, 0.1, 0x5b9dcb, 0.45),
          bottomRail = box(
            slidingDoorLeafWidth,
            0.085,
            0.1,
            0x5b9dcb,
            0.45,
          ),
          safetyDot = cyl(0.13, 0.04, CYAN, 18);
        outerRail.position.set(side * 0.875, 1.39, 0);
        innerRail.position.set(side * -0.875, 1.39, 0);
        topRail.position.set(0, 2.64, 0);
        bottomRail.position.set(0, 0.14, 0);
        safetyDot.rotation.x = Math.PI / 2;
        safetyDot.position.set(side * -0.18, 1.38, 0.08);
        leaf.add(outerRail, innerRail, topRail, bottomRail, safetyDot);
        leaf.position.x = side * 0.91;
        automaticDoor.add(leaf);
        return leaf;
      },
      slidingDoorLeaves = [makeSlidingLeaf(-1), makeSlidingLeaf(1)],
      // Closed leaves meet at the centre and reach the portal-post inner faces.
      // Fully open leaves finish completely behind the posts, along the inside
      // of the curtain-wall glazing.
      slidingDoorClosedX = 0.91,
      slidingDoorOpenX = 2.73;
    let slidingDoorOpenAmount = 0,
      slidingDoorIdleTime = 1.8;

    // Right side enters, left side exits. The separated straight lanes allow
    // people to enter and leave at the same time and to follow continuously.
    const revolvingDoorEntryQueue = new THREE.Vector3(0.72, 0, 9.55),
      // Incoming patients queue to the right of the entrance at one-metre
      // intervals. Only the head may enter the right-hand lane; followers keep
      // moving forward as space opens instead of converging on one point.
      revolvingDoorEntryHoldingPoints = Array.from(
        { length: 12 },
        (_, queueIndex) =>
          new THREE.Vector3(0.72 + queueIndex * 1.02, 0, 9.55),
      ),
      revolvingDoorExitQueue = new THREE.Vector3(-0.72, 0, 4.2),
      revolvingDoorEntryPath = [
        revolvingDoorEntryQueue.clone(),
        new THREE.Vector3(0.72, 0, 8.55),
        new THREE.Vector3(0.72, 0, 7.82),
        new THREE.Vector3(0.72, 0, 6.7),
        new THREE.Vector3(0.72, 0, 4.2),
        new THREE.Vector3(0.72, 0, 3.72),
      ],
      revolvingDoorExitPath = [
        revolvingDoorExitQueue.clone(),
        new THREE.Vector3(-0.72, 0, 6.7),
        new THREE.Vector3(-0.72, 0, 7.82),
        new THREE.Vector3(-0.72, 0, 8.55),
        new THREE.Vector3(-0.72, 0, 9.68),
      ],
      // Departing patients wait in a short, curved single-file lane inside the
      // lobby. Only the first position touches the revolving-door mouth; later
      // patients remain clear of both the exit and the ordinary circulation
      // aisle instead of repeatedly pathfinding toward the same point.
      revolvingDoorExitHoldingPoints = [
        revolvingDoorExitQueue.clone(),
        new THREE.Vector3(-0.92, 0, 3.48),
        new THREE.Vector3(-1.42, 0, 2.88),
        new THREE.Vector3(-2.02, 0, 2.42),
        new THREE.Vector3(-2.68, 0, 2.12),
        new THREE.Vector3(-3.38, 0, 2.0),
        new THREE.Vector3(-4.08, 0, 2.0),
        new THREE.Vector3(-4.78, 0, 2.0),
        new THREE.Vector3(-5.48, 0, 2.0),
        new THREE.Vector3(-6.18, 0, 2.0),
        new THREE.Vector3(-6.88, 0, 2.0),
        new THREE.Vector3(-7.58, 0, 2.0),
      ],
      revolvingDoorAdmissionReady = () => slidingDoorOpenAmount >= 0.995;
    const revolvingDoorEntryWaiters: string[] = [],
      revolvingDoorExitWaiters: string[] = [];
    const inAutomaticDoorTransitLane = (w: Walker, p: THREE.Vector3) => {
      const mode = w.group.userData.revolvingDoorMode as
        | "entry"
        | "exit"
        | undefined;
      if (!mode || !w.group.userData.revolvingDoorTransit) return false;
      const laneX = mode === "entry" ? 0.72 : -0.72;
      return Math.abs(p.x - laneX) < 0.58 && p.z > 3.42 && p.z < 9.98;
    };
    // Keep collision only on the two fixed portal posts.  The earlier obstacle
    // covered the whole doorway from z=4.82 to z=8.54; even after the glass
    // leaves opened, both one-way patient lanes hit that invisible rectangle
    // before their dedicated transit rule reached the lobby/street endpoint.
    // Door admission now controls the opening while the clear centre remains a
    // real, continuous right-in / left-out passage.
    obs.push(
      { minX: -2.24, maxX: -1.76, minZ: 7.48, maxZ: 8.18 },
      { minX: 1.76, maxX: 2.24, minZ: 7.48, maxZ: 8.18 },
    );
    // Move the two entrance planters out of the doorway and into the outer
    // lobby corners: elevator/window on the left and room-5/window on the right.
    const entrancePlanterZ = 5.82,
      entrancePlanterX = 13.12;
    largePlant(scene, -entrancePlanterX, entrancePlanterZ, 0.85);
    largePlant(scene, entrancePlanterX, entrancePlanterZ, 0.85);
    obs.push(
      {
        minX: -entrancePlanterX - 0.5,
        maxX: -entrancePlanterX + 0.5,
        minZ: entrancePlanterZ - 0.55,
        maxZ: entrancePlanterZ + 0.55,
      },
      {
        minX: entrancePlanterX - 0.5,
        maxX: entrancePlanterX + 0.5,
        minZ: entrancePlanterZ - 0.55,
        maxZ: entrancePlanterZ + 0.55,
      },
    );
    // A floor-standing self-payment kiosk sits against the wall to the left of
    // the exit. Its screen faces reception while the right-in/left-out doorway
    // and the waiting-island circulation lane remain fully open.
    const paymentIdleTexture = paymentScreenTexture(),
      paymentPaidTexture = paymentSuccessTexture(),
      kioskScreenMaterial = new THREE.MeshBasicMaterial({
        map: paymentIdleTexture,
        side: THREE.DoubleSide,
      }),
      paymentKiosk = new THREE.Group(),
      kioskBody = new THREE.Mesh(
        new RoundedBoxGeometry(0.82, 1.7, 0.56, 8, 0.13),
        material(0xf5f2eb, 0.6),
      ),
      kioskScreenFrame = new THREE.Mesh(
        new RoundedBoxGeometry(0.7, 0.92, 0.08, 8, 0.1),
        material(BLUE, 0.45),
      ),
      kioskScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.58, 0.78),
        kioskScreenMaterial,
      );
    kioskBody.position.y = 0.92;
    kioskBody.castShadow = true;
    kioskScreenFrame.position.set(0, 1.24, -0.3);
    kioskScreen.position.set(0, 1.24, -0.345);
    paymentKiosk.add(kioskBody, kioskScreenFrame, kioskScreen);
    put(paymentKiosk, box(1.02, 0.12, 0.76, 0x6d9eba), 0, 0.06, 0.02);
    put(paymentKiosk, box(0.34, 0.055, 0.055, 0x365c70), 0, 0.59, -0.315);
    put(paymentKiosk, box(0.5, 0.055, 0.055, 0x91aebc), 0, 0.43, -0.315);
    put(paymentKiosk, box(0.1, 0.1, 0.035, CYAN), -0.2, 0.73, -0.324);
    // Move the kiosk toward the entrance while keeping it outside the left exit
    // lane, the sensor apron and the fully-open sliding-leaf pocket.
    // Shift exactly 0.80 m along the direct line toward the automatic door.
    const kioskPreviousPosition = new THREE.Vector3(-3.42, 0, 6.02),
      kioskPosition = kioskPreviousPosition
        .clone()
        .add(
          revolvingDoorCenter
            .clone()
            .sub(kioskPreviousPosition)
            .setY(0)
            .normalize()
            .multiplyScalar(0.8),
        ),
      kioskTarget = new THREE.Vector3(0, 0, -4.8),
      kioskYaw = Math.atan2(
        -(kioskTarget.x - kioskPosition.x),
        -(kioskTarget.z - kioskPosition.z),
      );
    paymentKiosk.position.copy(kioskPosition);
    paymentKiosk.rotation.y = kioskYaw;
    scene.add(paymentKiosk);
    obs.push({
      cx: kioskPosition.x,
      cz: kioskPosition.z,
      ux: Math.cos(kioskYaw),
      uz: -Math.sin(kioskYaw),
      vx: Math.sin(kioskYaw),
      vz: Math.cos(kioskYaw),
      halfU: 0.58,
      halfV: 0.5,
    });
    const kioskFrontDirection = new THREE.Vector3(
        -Math.sin(kioskYaw),
        0,
        -Math.cos(kioskYaw),
      ).normalize(),
      kioskApproachPoint = kioskPosition
        .clone()
        .addScaledVector(kioskFrontDirection, 1.05),
      kioskBackDirection = new THREE.Vector3(
        Math.sin(kioskYaw),
        0,
        Math.cos(kioskYaw),
      ),
      kioskBackZoneCenter = kioskPosition
        .clone()
        .addScaledVector(kioskBackDirection, 0.93);
    let paymentKioskOwner: string | null = null,
      paymentSuccessUntil = 0,
      paymentScreenShowingSuccess = false;
    obs.push({
      cx: kioskBackZoneCenter.x,
      cz: kioskBackZoneCenter.z,
      ux: Math.cos(kioskYaw),
      uz: -Math.sin(kioskYaw),
      vx: Math.sin(kioskYaw),
      vz: Math.cos(kioskYaw),
      halfU: 0.7,
      halfV: 0.98,
    });
    const streetPlanterXs = [-10.2, 10.2];
    streetPlanterXs.forEach((x, planterIndex) => {
      const planter = new THREE.Group(),
        planterBody = new THREE.Mesh(
          new RoundedBoxGeometry(3.05, 0.58, 0.86, 8, 0.16),
          material(0xaedbea, 0.58),
        ),
        soil = new THREE.Mesh(
          new RoundedBoxGeometry(2.62, 0.06, 0.5, 6, 0.06),
          material(0x56483a, 0.86),
        );
      planterBody.position.y = 0.32;
      // The soil is a distinct inset surface above the planter top rather than
      // an intersecting box, preventing long-range z-fighting.
      soil.position.y = 0.65;
      soil.renderOrder = 2;
      planterBody.castShadow = true;
      soil.receiveShadow = true;
      planter.add(planterBody, soil);
      [-0.9, 0, 0.9].forEach((clusterX, clusterIndex) => {
        const leafColors = [0x789f5d, 0x8eae68, 0x6f9658];
        [-1.1, -0.55, 0, 0.55, 1.1].forEach((angle, leafIndex) => {
          const leaf = new THREE.Mesh(
            new THREE.SphereGeometry(0.28, 14, 9),
            material(leafColors[(leafIndex + clusterIndex) % leafColors.length], 0.7),
          );
          leaf.scale.set(1.05, 0.34, 0.58);
          leaf.position.set(
            clusterX + Math.sin(angle) * 0.27,
            0.7 + Math.cos(angle) * 0.11,
            -0.02 + Math.abs(Math.sin(angle)) * 0.04,
          );
          leaf.rotation.z = angle * 0.62;
          leaf.castShadow = true;
          planter.add(leaf);
        });
        const stem = cyl(0.025, 0.68, 0x6f9658, 10),
          bloom = new THREE.Group(),
          bloomColor = (clusterIndex + planterIndex) % 2 ? 0xf5cf61 : 0xfffbef;
        // Positive Z faces the road. Both stems and flower faces are therefore
        // placed on the street side instead of looking back into the hospital.
        stem.position.set(clusterX, 0.96, 0.17);
        bloom.position.set(clusterX, 1.28, 0.2);
        bloom.rotation.y = Math.PI;
        for (let petalIndex = 0; petalIndex < 5; petalIndex++) {
          const angle = (petalIndex / 5) * Math.PI * 2,
            petal = new THREE.Mesh(
              new THREE.SphereGeometry(0.13, 14, 9),
              material(bloomColor, 0.6),
            );
          petal.scale.set(0.72, 1.05, 0.42);
          petal.position.set(
            Math.cos(angle) * 0.145,
            Math.sin(angle) * 0.145,
            0,
          );
          petal.rotation.z = angle - Math.PI / 2;
          petal.castShadow = true;
          bloom.add(petal);
        }
        const flowerCentre = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 14, 9),
          material(0xe8a64f, 0.55),
        );
        flowerCentre.position.z = -0.035;
        bloom.add(flowerCentre);
        planter.add(stem, bloom);
      });
      planter.position.set(x, 0, 7.72);
      scene.add(planter);
    });
    // A compact streetscape beyond the glazing: pavement, road markings, trees
    // and a sidewalk shared by arriving patients and passing pedestrians.
    const sidewalk = box(31, 0.16, 4.3, 0xe9e5dc);
    sidewalk.position.set(0, -0.01, 9.55);
    scene.add(sidewalk);
    const road = box(34, 0.12, 4.1, 0x70818a);
    road.position.set(0, -0.08, 14);
    scene.add(road);
    for (let x = -15; x <= 15; x += 3.2)
      put(scene, box(1.55, 0.025, 0.12, 0xf4df91), x, 0.005, 14);
    const streetTreeXs = [-13, -8, 8, 13],
      streetTreeZ = 11.2;
    const ficusTrunkMaterial = material(0x8b6a49, 0.68),
      ficusBranchMaterial = material(0x927250, 0.7),
      ficusLeafMaterials = [
        material(0x4f8f55, 0.58),
        material(0x68a85e, 0.56),
        material(0x78b66a, 0.54),
      ],
      ficusLeafGeometry = new THREE.SphereGeometry(0.25, 10, 7);
    streetTreeXs.forEach((x, treeIndex) => {
      const tree = new THREE.Group(),
        trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.36, 2.9, 14),
          ficusTrunkMaterial,
        );
      trunk.position.y = 1.45;
      trunk.castShadow = true;
      tree.add(trunk);
      // The low flared roots and several outward branches give the familiar
      // sturdy, spreading silhouette of a street-side small-leaved banyan.
      [-0.42, 0, 0.42].forEach((rootX, rootIndex) => {
        const root = new THREE.Mesh(
          new THREE.ConeGeometry(0.22, 0.72, 10),
          ficusTrunkMaterial,
        );
        root.position.set(rootX * 0.56, 0.3, (rootIndex - 1) * 0.08);
        root.rotation.z = rootX * -0.78;
        root.scale.z = 0.72;
        root.castShadow = true;
        tree.add(root);
      });
      const branchUp = new THREE.Vector3(0, 1, 0),
        addFicusBranch = (
          start: THREE.Vector3,
          end: THREE.Vector3,
          baseRadius: number,
          tipRadius: number,
        ) => {
          const direction = end.clone().sub(start),
            branch = new THREE.Mesh(
              new THREE.CylinderGeometry(
                tipRadius,
                baseRadius,
                direction.length(),
                10,
              ),
              ficusBranchMaterial,
            );
          branch.position.copy(start).add(end).multiplyScalar(0.5);
          branch.quaternion.setFromUnitVectors(
            branchUp,
            direction.clone().normalize(),
          );
          branch.castShadow = true;
          tree.add(branch);
        },
        leftFork = new THREE.Vector3(-0.98, 3.12, 0.14),
        rightFork = new THREE.Vector3(1.02, 3.16, -0.12),
        rearFork = new THREE.Vector3(-0.2, 3.52, 0.76),
        frontFork = new THREE.Vector3(0.24, 3.55, -0.75),
        leafTips = [
          new THREE.Vector3(-1.56, 3.54, 0.34),
          new THREE.Vector3(-1.3, 3.48, -0.5),
          new THREE.Vector3(1.56, 3.54, -0.3),
          new THREE.Vector3(1.34, 3.5, 0.5),
          new THREE.Vector3(-0.62, 3.94, 1.1),
          new THREE.Vector3(0.34, 4, 1.14),
          new THREE.Vector3(-0.38, 3.98, -1.06),
          new THREE.Vector3(0.72, 3.92, -0.94),
          new THREE.Vector3(-0.18, 4.06, 0.16),
          new THREE.Vector3(0.5, 3.91, 0.12),
        ];
      // Four tapered primary limbs begin inside the upper trunk, so their bases
      // always read as one continuous tree from every camera angle.
      addFicusBranch(
        new THREE.Vector3(-0.07, 2.18, 0.03),
        leftFork,
        0.17,
        0.095,
      );
      addFicusBranch(
        new THREE.Vector3(0.07, 2.28, -0.03),
        rightFork,
        0.165,
        0.092,
      );
      addFicusBranch(
        new THREE.Vector3(-0.02, 2.44, 0.07),
        rearFork,
        0.145,
        0.082,
      );
      addFicusBranch(
        new THREE.Vector3(0.02, 2.5, -0.07),
        frontFork,
        0.14,
        0.08,
      );
      // Secondary branches continue from those exact fork endpoints to the leaf
      // clusters; none of the visible twigs floats independently beside the trunk.
      [
        [leftFork, leafTips[0]],
        [leftFork, leafTips[1]],
        [rightFork, leafTips[2]],
        [rightFork, leafTips[3]],
        [rearFork, leafTips[4]],
        [rearFork, leafTips[5]],
        [frontFork, leafTips[6]],
        [frontFork, leafTips[7]],
        [rearFork, leafTips[8]],
        [rightFork, leafTips[9]],
      ].forEach(([start, end]) =>
        addFicusBranch(start, end, 0.085, 0.045),
      );
      // Many individually modelled oval leaves replace the old single sphere.
      // A flattened, horizontally spreading crown is characteristic of ficus
      // microcarpa while still matching the scene's soft clay-like language.
      for (let leafIndex = 0; leafIndex < 60; leafIndex++) {
        const tip = leafTips[leafIndex % leafTips.length],
          clusterIndex = Math.floor(leafIndex / leafTips.length),
          angle =
            clusterIndex * 2.399963229728653 +
            (leafIndex % leafTips.length) * 0.31 +
            treeIndex * 0.47,
          spread = 0.18 + (clusterIndex % 3) * 0.075,
          leaf = new THREE.Mesh(
            ficusLeafGeometry,
            ficusLeafMaterials[(leafIndex + treeIndex) % 3],
          );
        leaf.position.set(
          tip.x + Math.cos(angle) * spread,
          tip.y + Math.sin(angle * 1.7) * 0.16,
          tip.z + Math.sin(angle) * spread * 0.8,
        );
        leaf.scale.set(1.16, 0.5, 0.72);
        leaf.rotation.set(
          Math.sin(angle * 1.7) * 0.22,
          angle,
          Math.cos(angle * 1.3) * 0.28,
        );
        leaf.castShadow = true;
        tree.add(leaf);
      }
      tree.position.set(x, 0, streetTreeZ);
      scene.add(tree);
    });
    const makeBird = (): BirdActor => {
      const g = new THREE.Group(),
        body = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 14, 10),
          material(0x638da5, 0.55),
        ),
        head = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 12, 9),
          material(0x78a9bd, 0.5),
        ),
        beak = new THREE.Mesh(
          new THREE.ConeGeometry(0.055, 0.16, 8),
          material(0xe9ad55, 0.5),
        ),
        hitTarget = new THREE.Mesh(
          new THREE.SphereGeometry(0.78, 12, 8),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
            colorWrite: false,
          }),
        ),
        wings = [-1, 1].map((side) => {
          const wing = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 12, 8),
            material(0x4f7890, 0.55),
          );
          wing.scale.set(1.25, 0.18, 0.72);
          wing.position.set(-0.03, 0.06, side * 0.2);
          g.add(wing);
          return wing;
        }),
        note = makeBirdNote();
      body.scale.set(1.28, 0.82, 0.88);
      head.position.set(0.27, 0.09, 0);
      beak.position.set(0.43, 0.08, 0);
      beak.rotation.z = -Math.PI / 2;
      hitTarget.position.set(0.08, 0.1, 0);
      hitTarget.name = "bird-hit-target";
      g.add(body, head, beak, note, hitTarget);
      g.userData = { interactive: "bird" };
      g.traverse((object) => {
        object.userData.hitRoot = g;
        interactive.push(object);
      });
      g.visible = false;
      scene.add(g);
      return { group: g, wings, note, cycle: -1, tree: 0 };
    };
    const streetBirds = [makeBird()];
    const butterflyPalette = [
      0xf29a4a, // orange
      0xf3c95f, // yellow
      0xf2a6b8, // pink
      0x86cce3, // light blue
      0xb59bd9, // pale purple
    ],
      butterflyTimings = [
        {
          cycleLength: 26.7,
          offset: 0,
          approach: 5.7,
          hover: 5.4,
          leave: 10.4,
        },
        {
          cycleLength: 32.05,
          offset: 7.1,
          approach: 7.2,
          hover: 6.1,
          leave: 12.5,
        },
        {
          cycleLength: 37.325,
          offset: 13.8,
          approach: 6.35,
          hover: 7.2,
          leave: 15.85,
        },
        {
          cycleLength: 42.825,
          offset: 21.6,
          approach: 8.1,
          hover: 5.85,
          leave: 19.25,
        },
      ],
      butterflyUnitRandom = (seed: number) => {
        const value = Math.abs(Math.sin(seed) * 43758.5453);
        return value - Math.floor(value);
      };
    const makeButterfly = (index: number): ButterflyActor => {
      const g = new THREE.Group(),
        body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.025, 0.14, 4, 8),
          material(0x4d6672, 0.55),
        ),
        wingPivots: THREE.Group[] = [],
        wingMaterials: THREE.MeshStandardMaterial[] = [];
      [-1, 1].forEach((side) => {
        const wingPivot = new THREE.Group(),
          wingMaterial = material(
            butterflyPalette[index % butterflyPalette.length],
            0.5,
          ),
          wing = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 14, 9),
            wingMaterial,
          );
        wing.scale.set(1.08, 0.16, 0.82);
        wing.position.set(0, 0.025, side * 0.095);
        wing.castShadow = true;
        wingPivot.position.z = side * 0.015;
        wingPivot.add(wing);
        g.add(wingPivot);
        wingPivots.push(wingPivot);
        wingMaterials.push(wingMaterial);
      });
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;
      g.add(body);
      // One-third smaller than the previous butterflies.
      g.scale.setScalar(2 / 3);
      g.visible = false;
      scene.add(g);
      return {
        group: g,
        wingPivots,
        wingMaterials,
        cycle: -1,
        planter: index % 2,
      };
    };
    const streetButterflies = Array.from({ length: 4 }, (_, index) =>
        makeButterfly(index),
      ),
      { courtyardBirds, updateThirdFloorCourtyardLife } =
        createThirdFloorCourtyardLife({
          thirdFloor,
          courtyardTreePoints,
          makeBird,
          makeButterfly,
        });
    const makeCar = (
      x: number,
      z: number,
      color: number,
      direction: number,
      laneSpeed: number,
    ) => {
      const car = new THREE.Group(),
        body = new THREE.Mesh(
          new RoundedBoxGeometry(2.15, 0.55, 1.02, 5, 0.16),
          material(color, 0.45),
        ),
        cab = new THREE.Mesh(
          new RoundedBoxGeometry(1.05, 0.5, 0.82, 5, 0.14),
          material(0xd8eef0, 0.25),
        );
      body.position.y = 0.38;
      cab.position.set(-0.12, 0.78, 0);
      car.add(body, cab);
      [-0.72, 0.72].forEach((px) =>
        [-0.48, 0.48].forEach((pz) => {
          const wheel = cyl(0.17, 0.14, 0x27343b, 14);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(px, 0.15, pz);
          wheel.userData.carWheel = true;
          car.add(wheel);
        }),
      );
      car.position.set(x, 0, z);
      car.userData.direction = direction;
      car.userData.laneSpeed = laneSpeed;
      scene.add(car);
      return car;
    };
    // Cars in the same lane share a lane speed, preserving their loop spacing and
    // preventing the faster rear car from merging into the one ahead.
    const streetCars = [
      makeCar(-12, 13, 0x5b91c5, 1, 2.35),
      makeCar(1.5, 13, 0xe5a45f, 1, 2.35),
      makeCar(12.5, 15, 0x6aa477, -1, 2.55),
      makeCar(-2.5, 15, 0xc97986, -1, 2.55),
    ];

    // Every ordinary route point and spawn must be physically walkable. Earlier
    // versions only clamped points to the fan outline, so two entrance waypoints
    // still landed inside the short walls at x=±2.4. Once a walker reached one of
    // those impossible targets it could never complete the waypoint, eventually
    // causing the whole crowd to queue behind it.
    const nearestLobbySafe = (source: THREE.Vector3, r = 0.4) => {
      const origin = clampLobbyPoint(source);
      if (insideLobby(origin, 0.72) && !blocked(origin, obs, r)) return origin;
      for (let ring = 0.55; ring <= 5.5; ring += 0.55)
        for (let step = 0; step < 24; step++) {
          const a = (step / 24) * Math.PI * 2,
            p = clampLobbyPoint(
              origin
                .clone()
                .add(
                  new THREE.Vector3(Math.cos(a) * ring, 0, Math.sin(a) * ring),
                ),
            );
          if (insideLobby(p, 0.72) && !blocked(p, obs, r)) return p;
        }
      return new THREE.Vector3(0, 0, 4.15);
    };
    const isSeatPoint = (p: THREE.Vector3) =>
      seatSpots.some((s) => s.pos.distanceTo(p) < 0.06);

    // Every clinician has a unique surname across reception, pharmacy,
    // clinics and the roaming lobby team.
    const doctorSurnames = ["林", "張", "王", "李", "陳"],
      clinicNurseSurnames = ["蔡", "楊", "許", "鄭", "謝"],
      pharmacyNurseSurnames = ["吳", "劉"],
      roamingNurseSurnames = ["郭", "周", "曾"];

    // Reception nurse (subtle station movement).
    const receptionNurseZ = -6.3 + RECEPTION_SHIFT,
      receptionNurse = person(
        scene,
        "nurse",
        CYAN,
        new THREE.Vector3(0, 0, receptionNurseZ),
        [
          new THREE.Vector3(-0.5, 0, receptionNurseZ),
          new THREE.Vector3(0, 0, receptionNurseZ),
          new THREE.Vector3(0.5, 0, receptionNurseZ),
          new THREE.Vector3(0, 0, receptionNurseZ),
        ],
        0.42,
        undefined,
        "female",
        10,
      );
    receptionNurse.group.scale.setScalar(1);
    receptionNurse.group.userData.working = true;
    receptionNurse.group.userData.displayName = "黃護理師";
    // A scene-level bag makes the handover legible above the counter instead of
    // popping directly into the patient's hand on the lobby side.
    const counterHandoffBag = new THREE.Group(),
      counterHandoffBody = new THREE.Mesh(
        new RoundedBoxGeometry(0.34, 0.42, 0.07, 4, 0.035),
        material(0xf7f4ea, 0.7),
      ),
      counterHandoffHandle = new THREE.Mesh(
        new THREE.TorusGeometry(0.09, 0.017, 7, 16, Math.PI),
        material(0x7895a0, 0.65),
      );
    counterHandoffBody.position.y = -0.2;
    counterHandoffHandle.position.set(0, 0.045, 0);
    counterHandoffHandle.rotation.z = Math.PI;
    counterHandoffBag.add(counterHandoffBody, counterHandoffHandle);
    put(counterHandoffBag, box(0.09, 0.024, 0.012, CYAN), 0, -0.19, -0.04);
    put(counterHandoffBag, box(0.024, 0.09, 0.012, CYAN), 0, -0.19, -0.042);
    counterHandoffBag.visible = false;
    scene.add(counterHandoffBag);
    const pharmacyStaff = pharmacyShelfWorkPoints.map((point, i) => {
      const p = person(
          scene,
          "nurse",
          i ? 0x8bc7b4 : 0x72b7c5,
          point.clone(),
          [point.clone(), pharmacyBenchWorkPoints[i].clone()],
          0.25,
          undefined,
          "female",
          20 + i,
        ),
        medicine = box(0.16, 0.24, 0.12, i ? 0xe3a468 : 0x68b7bd),
        bag = new THREE.Group(),
        bagBody = new THREE.Mesh(
          new RoundedBoxGeometry(0.38, 0.46, 0.07, 4, 0.035),
          material(0xf7f4ea, 0.7),
        ),
        bagHandle = new THREE.Mesh(
          new THREE.TorusGeometry(0.1, 0.018, 7, 16, Math.PI),
          material(0x7895a0, 0.65),
        );
      medicine.position.set(0.24, 1.05, -0.43);
      medicine.visible = false;
      bagBody.position.y = 0.23;
      bagHandle.position.set(0, 0.47, 0);
      bagHandle.rotation.z = Math.PI;
      bag.add(bagBody, bagHandle);
      put(bag, box(0.1, 0.028, 0.012, CYAN), 0, 0.25, -0.041);
      put(bag, box(0.028, 0.1, 0.012, CYAN), 0, 0.25, -0.043);
      bag.position.set(-0.22, 0.85, -0.44);
      bag.visible = false;
      p.group.add(medicine, bag);
      p.group.userData.pharmacyWorking = true;
      p.group.userData.displayName = `${pharmacyNurseSurnames[i]}藥師`;
      p.group.userData.workIndex = i;
      p.group.userData.pharmacyPhaseOffset = i * 20.6;
      p.group.userData.medicinePack = medicine;
      p.group.userData.medicineBag = bag;
      p.group.rotation.y = Math.PI;
      return p;
    });
    // Five doctors, each tied to one room and routing in/out through its own doorway.
    const doorOutside = clinicDoorPoints.map((door, i) =>
      door.clone().addScaledVector(clinicOuts[i], -1.62),
    );
    const doctorStops = clinicDoorPoints.map((door, i) =>
      door.clone().addScaledVector(clinicOuts[i], -4.7),
    );
    const doctorRoam = [
      new THREE.Vector3(-1.9, 0, -4.1),
      new THREE.Vector3(-2.2, 0, 2.2),
      new THREE.Vector3(2.0, 0, -4.0),
      new THREE.Vector3(2.3, 0, 2.35),
      new THREE.Vector3(1.1, 0, 5.8),
    ];
    const doctors = clinicPos.map((_, i) => {
      const seat = clinicDoctorSeats[i],
        door = clinicDoorPoints[i],
        out = clinicOuts[i],
        tan = clinicTangents[i],
        deskBypass = seat.clone().addScaledVector(tan, -1.55),
        roomAisle = door
          .clone()
          .addScaledVector(out, 2.05)
          .addScaledVector(tan, -0.2),
        doorApproach = door.clone().addScaledVector(out, 0.92),
        doorCenter = door.clone(),
        route = [
          seat.clone(),
          deskBypass,
          roomAisle,
          doorApproach,
          doorCenter,
          doorOutside[i].clone(),
          doctorStops[i].clone(),
          doctorRoam[i].clone(),
          doctorStops[i].clone(),
          doorOutside[i].clone(),
          doorCenter.clone(),
          doorApproach.clone(),
          roomAisle.clone(),
          deskBypass.clone(),
          seat.clone(),
        ];
      const d = person(
        scene,
        "doctor",
        0xffffff,
        seat.clone(),
        route,
        0.76 + i * 0.02,
        i + 1,
        i % 2 ? "female" : "male",
        30 + i,
      );
      d.group.userData.clinicSeat = seat.clone();
      d.group.userData.displayName = `${doctorSurnames[i]}醫師`;
      d.group.userData.clinicYaw = clinicDoctorYaws[i];
      d.group.userData.cycleOffset = i * 7;
      d.group.userData.clinicTask = i % 2 ? "chart" : "computer";
      d.action = "clinicSit";
      d.actionTime = -Math.random() * 2;
      d.waypoint = 1;
      d.pause = 0;
      return d;
    });
    // One seated nurse assists in every clinic. The former patient chair now belongs
    // to this nurse; patients use the new backless stool beside the QR tablet.
    const clinicNurses = clinicNurseSeats.map((seat, i) => {
      const n = person(
        scene,
        "nurse",
        CYAN,
        seat.clone(),
        [seat.clone()],
        0.74 + i * 0.015,
        i + 1,
        "female",
        40 + i,
      );
      n.action = "clinicNurseSit";
      n.actionTime = Math.random() * 2;
      n.pause = 0;
      n.group.userData.clinicSeat = seat.clone();
      n.group.userData.displayName = `${clinicNurseSurnames[i]}護理師`;
      n.group.userData.clinicYaw = clinicNurseYaws[i];
      n.group.userData.baseClinicSpeed = n.speed;
      n.group.userData.roomReady = true;
      n.group.position.y = 0.14;
      n.group.scale.set(1, 0.88, 1);
      n.group.rotation.y = clinicNurseYaws[i];
      n.legs.forEach((l, k) => {
        l.position.set(k ? 0.14 : -0.14, 0.69, -0.3);
        l.rotation.x = -Math.PI / 2;
      });
      return n;
    });
    // Three roaming nurses circulate around the reception queue rather than
    // cutting through the three-metre public service apron in front of it.
    const nurseRoutes = [
      [
        new THREE.Vector3(-4.7, 0, -3.65),
        new THREE.Vector3(-4.7, 0, 0.8),
        new THREE.Vector3(-5.8, 0, 2.7),
        new THREE.Vector3(-2.9, 0, 6.55),
        new THREE.Vector3(2.9, 0, 6.55),
        new THREE.Vector3(5.8, 0, 2.7),
        new THREE.Vector3(4.7, 0, 0.8),
        new THREE.Vector3(4.7, 0, -3.65),
      ],
      [
        new THREE.Vector3(-6.55, 0, -3.15),
        new THREE.Vector3(-7.55, 0, -1.6),
        new THREE.Vector3(-7.75, 0, 2.5),
        new THREE.Vector3(-8.05, 0, 5.55),
        new THREE.Vector3(-2.9, 0, 6.55),
        new THREE.Vector3(2.7, 0, 6.55),
        new THREE.Vector3(7.8, 0, 5.55),
      ],
      [
        new THREE.Vector3(6.55, 0, -3.25),
        new THREE.Vector3(7.55, 0, -1.6),
        new THREE.Vector3(7.75, 0, 2.55),
        new THREE.Vector3(8.0, 0, 5.55),
        new THREE.Vector3(2.8, 0, 6.55),
        new THREE.Vector3(4.8, 0, 1.05),
        new THREE.Vector3(4.8, 0, -3.65),
      ],
    ];
    const roamingNurses = nurseRoutes.map((r, i) => {
      const safeRoute = r.map((p) => nearestLobbySafe(p));
      const nurse = person(
        scene,
        "nurse",
        CYAN,
        safeRoute[0].clone(),
        safeRoute,
        0.78 + i * 0.05,
        undefined,
        "female",
        50 + i,
      );
      nurse.group.userData.lobbyRoamingNurse = true;
      nurse.group.userData.displayName = `${roamingNurseSurnames[i]}護理師`;
      return nurse;
    });
    const eyeRoute = [
        // The helper now roams the same full-lobby footprint as the roaming
        // nurses: both waiting wings, the clinic frontage and the entrance
        // cross-aisle. Conversation scheduling still prevents either character
        // from stopping in the revolving-door apron or the payment-to-counter
        // circulation lane.
        new THREE.Vector3(-6.55, 0, -3.15),
        new THREE.Vector3(-7.55, 0, -1.6),
        new THREE.Vector3(-7.75, 0, 2.5),
        new THREE.Vector3(-8.05, 0, 5.55),
        new THREE.Vector3(-2.9, 0, 6.55),
        new THREE.Vector3(2.7, 0, 6.55),
        new THREE.Vector3(8.0, 0, 5.55),
        new THREE.Vector3(7.75, 0, 2.55),
        new THREE.Vector3(7.55, 0, -1.6),
        new THREE.Vector3(6.55, 0, -3.25),
        new THREE.Vector3(2.35, 0, -3.65),
        new THREE.Vector3(2.35, 0, -0.2),
        new THREE.Vector3(1.1, 0, 1.05),
        new THREE.Vector3(-0.9, 0, 0.9),
        new THREE.Vector3(-2.35, 0, -0.2),
        new THREE.Vector3(-2.35, 0, -3.65),
      ].map((p) => nearestLobbySafe(p, 0.44)),
      eyeHelper = eyeAssistant(scene, eyeRoute[0].clone(), eyeRoute, 0.7),
      // The eye helper shares the roaming-nurse conversation scheduler and the
      // same collision-safe navigation, but remains a distinct visual role.
      nurses = [...roamingNurses, eyeHelper];
    // Twelve reusable patients circulate among entrance, reception, waiting
    // zones and clinics. A character is recycled only after completing the
    // visible street departure; no hidden standby models are kept.
    const patientColors = [
      0xe4a566, 0x7b92c8, 0x79bca8, 0xd58b75, 0x8b79b8, 0xd2a85f, 0x6597a8,
      0xc27d94, 0x78a9c4, 0xe19c85, 0x76ad87, 0xb78ab4,
    ];
    const assignedSeatIds = [10, 12, 15, 17, 0, 1, 6, 7, 8, 11, 16, 18];
    const lobbyClinicLoops = [
      new THREE.Vector3(-6.15, 0, -0.25),
      new THREE.Vector3(-3.65, 0, -4.05),
      new THREE.Vector3(3.65, 0, -4.05),
      new THREE.Vector3(6.15, 0, -0.3),
      new THREE.Vector3(8.35, 0, 3.75),
    ];
    let patientNumberSequence = 1;
    const nextPatientNumber = () =>
      String(((patientNumberSequence++ - 1) % 99) + 1).padStart(2, "0");
    const corePatientRoutes = [
      [
        new THREE.Vector3(-1.45, 0, 6.8),
        new THREE.Vector3(-2.2, 0, 6.1),
        new THREE.Vector3(-3.05, 0, 5.45),
        new THREE.Vector3(-3.15, 0, 3.35),
        new THREE.Vector3(-7.15, 0, 2.9),
        seatSpots[10].pos.clone(),
        new THREE.Vector3(-7.55, 0, 2.3),
        lobbyClinicLoops[0].clone(),
      ],
      [
        new THREE.Vector3(-0.45, 0, 6.8),
        new THREE.Vector3(-1.8, 0, 6.15),
        new THREE.Vector3(-2.85, 0, 5.35),
        new THREE.Vector3(-3.15, 0, 3.25),
        seatSpots[12].pos.clone(),
        new THREE.Vector3(-7.45, 0, 1.75),
        lobbyClinicLoops[1].clone(),
      ],
      [
        new THREE.Vector3(0.45, 0, 6.8),
        new THREE.Vector3(1.8, 0, 6.15),
        new THREE.Vector3(2.85, 0, 5.35),
        new THREE.Vector3(3.15, 0, 3.25),
        seatSpots[15].pos.clone(),
        new THREE.Vector3(7.45, 0, 1.75),
        lobbyClinicLoops[2].clone(),
      ],
      [
        new THREE.Vector3(1.45, 0, 6.8),
        new THREE.Vector3(2.2, 0, 6.1),
        new THREE.Vector3(3.05, 0, 5.45),
        new THREE.Vector3(3.15, 0, 3.35),
        new THREE.Vector3(7.15, 0, 2.9),
        seatSpots[17].pos.clone(),
        new THREE.Vector3(7.55, 0, 2.3),
        lobbyClinicLoops[3].clone(),
      ],
      [
        new THREE.Vector3(-6.55, 0, -3.55),
        new THREE.Vector3(-6.25, 0, -2.5),
        new THREE.Vector3(-5.85, 0, -1.55),
        seatSpots[0].pos.clone(),
        new THREE.Vector3(-2.7, 0, -3.35),
        new THREE.Vector3(1.9, 0, -3.95),
        new THREE.Vector3(-1.7, 0, 6.55),
      ],
      [
        new THREE.Vector3(-7.35, 0, 4.65),
        new THREE.Vector3(-7.45, 0, 2.35),
        new THREE.Vector3(-7.3, 0, -1.45),
        new THREE.Vector3(-5.75, 0, -1.55),
        new THREE.Vector3(-3.2, 0, -1.55),
        seatSpots[2].pos.clone(),
        new THREE.Vector3(-6.95, 0, -2.25),
        lobbyClinicLoops[1].clone(),
      ],
      [
        new THREE.Vector3(6.55, 0, -3.55),
        new THREE.Vector3(6.25, 0, -2.5),
        new THREE.Vector3(5.85, 0, -1.55),
        new THREE.Vector3(3.2, 0, -1.55),
        seatSpots[5].pos.clone(),
        new THREE.Vector3(2.7, 0, -3.35),
        new THREE.Vector3(1.9, 0, -3.95),
        new THREE.Vector3(1.55, 0, 6.55),
      ],
      [
        new THREE.Vector3(7.35, 0, 4.65),
        new THREE.Vector3(7.45, 0, 2.35),
        new THREE.Vector3(7.3, 0, -1.45),
        new THREE.Vector3(5.75, 0, -1.55),
        seatSpots[7].pos.clone(),
        new THREE.Vector3(6.95, 0, -2.25),
        lobbyClinicLoops[4].clone(),
      ],
      [
        new THREE.Vector3(-1.15, 0, 6.65),
        new THREE.Vector3(-2.4, 0, 5.85),
        new THREE.Vector3(-5.3, 0, 4.95),
        seatSpots[1].pos.clone(),
        new THREE.Vector3(-5.4, 0, 1.45),
        new THREE.Vector3(-2.4, 0, -2.45),
        lobbyClinicLoops[2].clone(),
      ],
      [
        new THREE.Vector3(1.15, 0, 6.65),
        new THREE.Vector3(2.4, 0, 5.85),
        new THREE.Vector3(5.3, 0, 4.95),
        seatSpots[6].pos.clone(),
        new THREE.Vector3(5.4, 0, 1.45),
        new THREE.Vector3(2.4, 0, -2.45),
        lobbyClinicLoops[3].clone(),
      ],
      [
        new THREE.Vector3(-2.05, 0, 6.55),
        new THREE.Vector3(-3.6, 0, 5.65),
        new THREE.Vector3(-6.35, 0, 4.45),
        seatSpots[11].pos.clone(),
        new THREE.Vector3(-6.1, 0, 0.2),
        new THREE.Vector3(-3.2, 0, -3.1),
        lobbyClinicLoops[0].clone(),
      ],
      [
        new THREE.Vector3(2.05, 0, 6.55),
        new THREE.Vector3(3.6, 0, 5.65),
        new THREE.Vector3(6.35, 0, 4.45),
        seatSpots[16].pos.clone(),
        new THREE.Vector3(6.1, 0, 0.2),
        new THREE.Vector3(3.2, 0, -3.1),
        lobbyClinicLoops[4].clone(),
      ],
    ];
    const inProtectedWaitingSeatRow = (point: THREE.Vector3, margin = 0) =>
      waitingSeatRowZones.some(
        (zone) =>
          point.x > zone.minX - margin &&
          point.x < zone.maxX + margin &&
          point.z > zone.minZ - margin &&
          point.z < zone.maxZ + margin,
      );
    const patients = corePatientRoutes.map((r, i) => {
      // Chair-derived waypoints are removed completely from ordinary circulation.
      // Replacing them with a nearby release point still drew unrelated patients
      // along the outside edge of every upper chair row, where crowd avoidance
      // could push them back into the same narrow pocket.
      const safeRoute = r
          .filter(
            (point) =>
              !isSeatPoint(point) &&
              !inProtectedWaitingSeatRow(point, 0.5),
          )
          .map((point) => nearestLobbySafe(point, 0.42)),
        fullRoute = [
          ...safeRoute,
          ...safeRoute
            .slice(0, -1)
            .reverse()
            .map((v) => v.clone()),
        ];
      let startIndex = (i * 3) % fullRoute.length;
      for (
        let tries = 0;
        tries < fullRoute.length &&
        (isSeatPoint(fullRoute[startIndex]) ||
          blocked(fullRoute[startIndex], obs, 0.42) ||
          !insideLobby(fullRoute[startIndex], 0.72));
        tries++
      )
        startIndex = (startIndex + 1) % fullRoute.length;
      const p = person(
        scene,
        "patient",
        patientColors[i % patientColors.length],
        fullRoute[startIndex].clone(),
        fullRoute,
        0.62 + i * 0.025,
        undefined,
        i % 2 ? "male" : "female",
        60 + i,
      );
      p.waypoint = (startIndex + 1) % fullRoute.length;
      p.group.userData.activePatient = true;
      p.group.userData.visitPhase = "checkin";
      p.group.userData.queueNumber = nextPatientNumber();
      p.group.userData.counterDone = false;
      p.group.userData.hasScanned = false;
      p.group.userData.consultRoom = (i % 5) + 1;
      p.group.userData.consultCooldown = 5 + i * 1.4;
      p.group.userData.scanCooldown = 1 + i * 0.35;
      p.group.userData.counterRescanCooldown = 14 + i * 1.8;
      p.group.userData.patientBaseSpeed = p.speed;
      p.seatId = assignedSeatIds[i % assignedSeatIds.length];
      p.seatPoint = seatSpots[p.seatId].pos.clone();
      p.seatYaw = seatSpots[p.seatId].yaw;
      return p;
    });
    const streetWalkers = [-12.5, -7.5, -2.5, 3.5, 8.5, 13].map((x, i) => {
      const lane = i % 2,
        z = lane ? 10.05 : 8.95,
        direction = lane ? 1 : -1,
        p = person(
          scene,
          "patient",
          patientColors[(i * 2 + 3) % patientColors.length],
          new THREE.Vector3(x, 0, z),
          [new THREE.Vector3(x, 0, z)],
          0.55,
          undefined,
          i % 3 ? "female" : "male",
          80 + i,
        );
      p.group.userData.streetWalker = true;
      p.group.userData.streetDirection = direction;
      p.group.userData.streetBaseZ = z;
      p.group.userData.streetLane = lane;
      p.group.userData.streetSpeed = lane ? 0.82 : 0.76;
      p.group.rotation.y = direction > 0 ? -Math.PI / 2 : Math.PI / 2;
      return p;
    });
    const walkers = [
      receptionNurse,
      ...pharmacyStaff,
      ...doctors,
      ...clinicNurses,
      ...nurses,
      ...patients,
    ];
    // Street pedestrians participate in navigation clearance even though their
    // simple looping animation is updated separately from hospital walkers.
    const navigationCrowd = [...walkers, ...streetWalkers];
    const streetDepartureSpeed = 0.76;
    const isStreetDepartingPatient = (w: Walker) =>
      w.role === "patient" &&
      w.group.userData.visitPhase === "leaving" &&
      !w.group.userData.revolvingDoorTransit &&
      w.group.position.z > 8.45;
    const isSameDirectionStreetTraffic = (self: Walker, other: Walker) =>
      isStreetDepartingPatient(self) &&
      (isStreetDepartingPatient(other) ||
        (other.group.userData.streetWalker &&
          Number(other.group.userData.streetDirection) < 0));
    const isOpposingStreetTraffic = (self: Walker, other: Walker) =>
      isStreetDepartingPatient(self) &&
      !!other.group.userData.streetWalker &&
      Number(other.group.userData.streetDirection) > 0;
    // Departing patients use a simple leftward follow lane on the pavement.
    // Same-direction traffic is handled by a longitudinal gap check, while
    // opposing pedestrians pass through instead of triggering mutual sidesteps.
    const bypassGenericStreetAvoidance = (self: Walker, other: Walker) =>
      isSameDirectionStreetTraffic(self, other) ||
      isOpposingStreetTraffic(self, other);
    walkers.forEach((w) => w.group.traverse((o) => interactive.push(o)));
    // Every hospital visit owns one monitor record. The same reusable character
    // model receives a fresh record and visit id when a new patient enters.
    let patientVisitSequence = 0,
      calledTransitSequence = 0;
    const isCalledInboundPatient = (w: Walker) =>
      w.role === "patient" &&
      !!w.group.userData.calledTaskActive &&
      w.group.userData.consultState === "inbound";
    const patientMonitors = new Map<string, PatientMonitor>();
    const patientFlowStep = (w: Walker) => {
      const phase = w.group.userData.visitPhase;
      if (phase === "entering") return 0;
      if (phase === "preScan") return 1;
      if (phase === "checkin") return w.action === "counterScan" ? 2 : 1;
      if (phase === "queue") return w.group.userData.queueReady ? 4 : 3;
      if (phase === "consult" || phase === "exam" || phase === "clinicScan")
        return 5;
      if (phase === "postClinicWait") return 9;
      if (phase === "postLobbyScan" || phase === "postWait") return 9;
      if (phase === "paymentQueue" || phase === "payment") return 9;
      if (phase === "pickupQueue" || phase === "pickup") return 10;
      if (phase === "leaving") return 11;
      return -1;
    };
    const patientGoalKind = (w: Walker) =>
      w.group.userData.leavingSeat
        ? "seat-exit"
        : w.group.userData.counterScanPending
          ? "counter-qr"
        : w.group.userData.consultPath
          ? `clinic-${w.group.userData.consultState || "route"}`
          : w.group.userData.lifecyclePath
            ? `lifecycle-${w.group.userData.visitPhase}`
            : w.group.userData.pickupFlowLocked
              ? "medicine-pickup"
              : w.group.userData.seatGoal
                ? "lobby-seat"
                : w.group.userData.qrGoal
                  ? "lobby-qr"
                  : w.group.userData.qrQueueGoal
                    ? "qr-queue"
                    : "roam";
    const patientStateKey = (w: Walker) =>
      `${w.group.userData.visitPhase || "unknown"}|${w.action}|${w.group.userData.consultState || "-"}|${patientGoalKind(w)}`;
    const patientStatusLabel = (w: Walker) => {
      const phase = w.group.userData.visitPhase,
        consultState = w.group.userData.consultState,
        labels = contentRef.current.patientStatuses;
      if (phase === "entering") return labels.entering;
      if (phase === "preScan") return labels.preScan;
      if (phase === "checkin") {
        if (w.action === "counterTalk") return labels.counterTalk;
        if (w.action === "counterScan") return labels.counterScan;
        return labels.checkinQueue;
      }
      if (phase === "queue") {
        if (w.action === "sit" && w.group.userData.hasScanned)
          return labels.waitingReading;
        if (w.group.userData.qrGoal || w.group.userData.qrQueueGoal)
          return labels.walkingLobbyQr;
        return labels.waiting;
      }
      if (phase === "consult" || phase === "exam" || phase === "clinicScan") {
        if (consultState === "inbound")
          return labels.calledInbound.replace(
            "{room}",
            String(w.group.userData.consultRoom || "指定"),
          );
        if (w.action === "examBed" || consultState === "toExam")
          return labels.exam;
        if (w.action === "clinicScan" || consultState === "clinicScan")
          return labels.clinicScan;
        if (consultState === "leaving") return labels.leavingClinic;
        return labels.consulting;
      }
      if (phase === "postClinicWait")
        return w.action === "sit" && w.group.userData.hasScanned
          ? labels.postClinicReading
          : labels.postClinicTransit;
      if (phase === "postLobbyScan") return labels.postLobbyScan;
      if (phase === "postWait")
        return w.action === "sit" && w.group.userData.hasScanned
          ? labels.postWaitReading
          : labels.postWaitTransit;
      if (phase === "paymentQueue" || phase === "payment")
        return labels.payment;
      if (phase === "pickupQueue" || phase === "pickup")
        return labels.pickup;
      if (phase === "leaving") return labels.leaving;
      return labels.fallback;
    };
    const patientStatusDetail = (w: Walker) => {
      const phase = w.group.userData.visitPhase,
        readingPhone = w.action === "sit" && w.group.userData.hasScanned,
        details = contentRef.current.patientDetails;
      if (phase === "queue" && readingPhone)
        return details.waitingReading;
      if (phase === "postClinicWait" && readingPhone)
        return details.clinicReading;
      if (phase === "postWait" && readingPhone)
        return details.postWaitReading;
      if (phase === "leaving") return details.leaving;
      return undefined;
    };
    const patientFocusInteraction = (w: Walker): CharacterInteraction => ({
      eyebrow: "PATIENT STATUS",
      title: `病患 ${String(w.group.userData.queueNumber || "--")} 號`,
      line: `目前狀態：${patientStatusLabel(w)}`,
      detail: patientStatusDetail(w),
    });
    const staffInteraction = (w: Walker): CharacterInteraction | undefined => {
      const displayName = w.group.userData.displayName as string | undefined;
      const dialogues = contentRef.current.dialogues;
      if (!displayName) return undefined;
      if (w.group.userData.eyeAssistant)
        return {
          eyebrow: "MEDIFY ASSISTANT",
          title: displayName,
          line: dialogues.eyeAssistant,
        };
      if (w.role === "doctor")
        return {
          eyebrow: "MEDIFY CLINICIAN",
          title: displayName,
          line: dialogues.doctor,
        };
      if (w.group.userData.pharmacyWorking)
        return {
          eyebrow: "MEDIFY CLINICIAN",
          title: displayName,
          line: dialogues.pharmacist,
        };
      if (w.group.userData.working)
        return {
          eyebrow: "MEDIFY CLINICIAN",
          title: displayName,
          line: dialogues.counterNurse,
        };
      if (w.room)
        return {
          eyebrow: "MEDIFY CLINICIAN",
          title: displayName,
          line: dialogues.clinicNurse,
        };
      return {
        eyebrow: "MEDIFY CLINICIAN",
        title: displayName,
        line: dialogues.lobbyNurse,
      };
    };
    const attachPatientMonitor = (w: Walker) => {
      const visitId = ++patientVisitSequence,
        now = performance.now() / 1000;
      w.group.userData.patientVisitId = visitId;
      patientMonitors.set(w.group.uuid, {
        visitId,
        patientNo: String(w.group.userData.queueNumber || "--"),
        flowStep: patientFlowStep(w),
        stateKey: patientStateKey(w),
        stateAge: 0,
        lastPosition: w.group.position.clone(),
        noProgressTime: 0,
        invalidPositionTime: 0,
        seatExitTime: 0,
        clinicTransitTime: 0,
        calledTaskTime: 0,
        calledTaskNoProgressTime: 0,
        calledTaskLastPosition: w.group.position.clone(),
        lastCalledTaskRecoveryAt: -10,
        recoveries: 0,
        lastRecoveryAt: -10,
        lastHealthyAt: now,
      });
    };
    const detachPatientMonitor = (w: Walker) => {
      patientMonitors.delete(w.group.uuid);
      seatExitReservations.delete(w.group.uuid);
      delete w.group.userData.patientVisitId;
      delete w.group.userData.monitorRecoveryCount;
      delete w.group.userData.monitorFlowStep;
      delete w.group.userData.monitorHealth;
      delete w.group.userData.monitorLastSeatExit;
      delete w.group.userData.recoveryGoal;
      delete w.group.userData.manualRecoveryGoal;
      delete w.group.userData.crowdStallReplanIssued;
      delete w.group.userData.crowdStallEscapeIssued;
    };
    // Resolve spawn-to-spawn overlap before the first rendered frame. This is
    // intentionally deterministic so refreshing the page never briefly reveals a
    // character embedded in furniture, a wall, or another character.
    const placed: THREE.Vector3[] = doctors
      .filter((d) => d.action === "walk")
      .map((d) => d.group.position.clone());
    [...nurses, ...patients].forEach((w, index) => {
      let p = w.group.position.clone(),
        valid =
          insideLobby(p, 0.72) &&
          !blocked(p, obs, 0.42) &&
          placed.every((q) => q.distanceTo(p) > 0.82);
      if (!valid) {
        const seed = (index * 2.399963229728653) % (Math.PI * 2);
        outer: for (let ring = 0.6; ring <= 6; ring += 0.55)
          for (let k = 0; k < 28; k++) {
            const a = seed + (k / 28) * Math.PI * 2,
              candidate = nearestLobbySafe(
                p
                  .clone()
                  .add(
                    new THREE.Vector3(
                      Math.cos(a) * ring,
                      0,
                      Math.sin(a) * ring,
                    ),
                  ),
                0.42,
              );
            if (placed.every((q) => q.distanceTo(candidate) > 0.82)) {
              p = candidate;
              valid = true;
              break outer;
            }
          }
      }
      w.group.position.copy(
        valid
          ? p
          : nearestLobbySafe(new THREE.Vector3(0, 0, 3.8 + index * 0.18), 0.42),
      );
      placed.push(w.group.position.clone());
    });
    doctors
      .filter((d) => d.action === "walk" && blocked(d.group.position, obs, 0.4))
      .forEach((d) =>
        d.group.position.copy(nearestLobbySafe(d.group.position, 0.4)),
      );
    [...doctors, ...nurses, ...patients].forEach(
      (w) => (w.group.userData.lastSafePosition = w.group.position.clone()),
    );

    // Keep the selected-patient marker at scene level so sitting or character
    // scaling never changes its requested 25 cm height. The square pyramid is
    // inverted, leaving its tip pointed toward the patient's head.
    const patientFocusMarker = new THREE.Mesh(
        new THREE.ConeGeometry(0.23, 0.45, 4),
        new THREE.MeshStandardMaterial({
          color: 0xe53935,
          emissive: 0x7f0808,
          emissiveIntensity: 0.38,
          roughness: 0.48,
        }),
      ),
      focusedHeadWorld = new THREE.Vector3(),
      focusedPatientFollowTarget = new THREE.Vector3(),
      focusedPatientFollowDelta = new THREE.Vector3();
    patientFocusMarker.rotation.x = Math.PI;
    patientFocusMarker.castShadow = true;
    patientFocusMarker.visible = false;
    patientFocusMarker.renderOrder = 24;
    patientFocusMarker.raycast = () => {};
    scene.add(patientFocusMarker);
    let focusedPatient: Walker | null = null,
      focusedPatientStateKey = "",
      mobilePatientFollowInitialized = false;
    const clearFocusedPatient = () => {
      if (!focusedPatient) return;
      focusedPatient = null;
      focusedPatientStateKey = "";
      mobilePatientFollowInitialized = false;
      patientFocusMarker.visible = false;
      onPatientFocus(null);
    };
    clearPatientFocusRef.current = clearFocusedPatient;
    const focusPatient = (w: Walker) => {
      focusedPatient = w;
      focusedPatientStateKey = patientStateKey(w);
      mobilePatientFollowInitialized = false;
      patientFocusMarker.visible = true;
      onPatientFocus(patientFocusInteraction(w));
    };
    const updateFocusedPatient = (t: number, dt: number) => {
      if (!focusedPatient) return;
      if (
        !focusedPatient.group.visible ||
        !focusedPatient.group.userData.activePatient
      ) {
        clearFocusedPatient();
        return;
      }
      focusedPatient.headRig.getWorldPosition(focusedHeadWorld);
      patientFocusMarker.position.copy(focusedHeadWorld);
      patientFocusMarker.position.y += 0.54 + Math.sin(t * 2.4) * 0.025;
      patientFocusMarker.rotation.set(Math.PI, t * 1.9, 0);
      if (mobileView()) {
        focusedPatient.group.getWorldPosition(focusedPatientFollowTarget);
        focusedPatientFollowTarget.y += 0.92;
        if (!mobilePatientFollowInitialized) {
          focusedPatientFollowDelta
            .copy(focusedPatientFollowTarget)
            .sub(controls.target);
          camera.position.add(focusedPatientFollowDelta);
          controls.target.copy(focusedPatientFollowTarget);
          cameraTransitionRef.current = null;
          controls.enabled = true;
          mobilePatientFollowInitialized = true;
        } else {
          const followAmount = 1 - Math.exp(-dt * 10);
          focusedPatientFollowDelta
            .copy(focusedPatientFollowTarget)
            .sub(controls.target)
            .multiplyScalar(followAmount);
          controls.target.add(focusedPatientFollowDelta);
          camera.position.add(focusedPatientFollowDelta);
        }
      } else mobilePatientFollowInitialized = false;
      const currentStateKey = patientStateKey(focusedPatient);
      if (currentStateKey !== focusedPatientStateKey) {
        focusedPatientStateKey = currentStateKey;
        onPatientFocus(patientFocusInteraction(focusedPatient));
      }
    };

    const ray = new THREE.Raycaster(),
      mouse = new THREE.Vector2(),
      birdScreenPoint = new THREE.Vector3();
    const isVisibleInteractiveObject = (object: THREE.Object3D) => {
      let current: THREE.Object3D | null = object;
      while (current && current !== scene) {
        if (!current.visible) return false;
        current = current.parent;
      }
      return true;
    };
    const pointer = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(mouse, camera);
      return ray
        .intersectObjects(interactive, true)
        .find((hit) => {
          if (!isVisibleInteractiveObject(hit.object)) return false;
          const root = hit.object.userData.hitRoot || hit.object,
            objectFloor = (root.userData.floor as 1 | 2 | 3 | undefined) ?? 1;
          return objectFloor === activeFloorRef.current;
        });
    };
    const birdAtPointer = (e: PointerEvent) => {
      const activeBirds =
        activeFloorRef.current === 1
          ? streetBirds
          : activeFloorRef.current === 3
            ? courtyardBirds
            : [];
      if (activeBirds.length === 0) return undefined;
      const bounds = renderer.domElement.getBoundingClientRect(),
        radius = touchDevice ? 54 : 42;
      return activeBirds.find((bird) => {
        if (!bird.group.visible) return false;
        bird.group.getWorldPosition(birdScreenPoint);
        birdScreenPoint.project(camera);
        if (birdScreenPoint.z < -1 || birdScreenPoint.z > 1) return false;
        const screenX =
            bounds.left + ((birdScreenPoint.x + 1) * bounds.width) / 2,
          screenY =
            bounds.top + ((1 - birdScreenPoint.y) * bounds.height) / 2;
        return Math.hypot(e.clientX - screenX, e.clientY - screenY) <= radius;
      });
    };
    const showBirdStatus = () => {
      if (focusedPatient) clearFocusedPatient();
      onTalk("assistant", {
        eyebrow: "BIRD STATUS",
        title: activeFloorRef.current === 3 ? "中庭小鳥" : "小鳥",
        line: contentRef.current.dialogues.bird,
      });
    };
    const doctorIsWaitingForPatient = (w: Walker) =>
      w.role === "doctor" &&
      w.action === "clinicSit" &&
      !!w.room &&
      !w.group.userData.consultQueued &&
      !w.group.userData.consultPatient &&
      !w.group.userData.doctorPath &&
      !w.group.userData.doctorPathMode &&
      !patients.some(
        (patient) =>
          patient.group.visible &&
          patient.group.userData.consultRoom === w.room &&
          patient.group.userData.consultDoctor === w.group.uuid &&
          (patient.group.userData.consultPath ||
            ["consult", "exam", "clinicScan"].includes(
              patient.group.userData.visitPhase,
            )),
      );
    const clickedCharacterTaskTarget = (w: Walker) => {
      const consultPath = w.group.userData.consultPath as
          | THREE.Vector3[]
          | undefined,
        lifecyclePath = w.group.userData.lifecyclePath as
          | THREE.Vector3[]
          | undefined,
        doctorPath = w.group.userData.doctorPath as
          | THREE.Vector3[]
          | undefined,
        clinicStaffPath = w.group.userData.clinicStaffPath as
          | THREE.Vector3[]
          | undefined;
      return (
        consultPath?.[0] ||
        lifecyclePath?.[0] ||
        doctorPath?.[0] ||
        clinicStaffPath?.[0] ||
        (w.group.userData.seatGoal as THREE.Vector3 | undefined) ||
        (w.group.userData.qrGoal as THREE.Vector3 | undefined) ||
        (w.group.userData.qrQueueGoal as THREE.Vector3 | undefined) ||
        w.route[w.waypoint]
      );
    };
    const clickedCharacterRecoveryPoint = (w: Walker) => {
      const origin = w.group.position.clone(),
        taskTarget = clickedCharacterTaskTarget(w),
        forward = taskTarget
          ? taskTarget.clone().sub(origin).setY(0)
          : new THREE.Vector3(
              -Math.sin(w.group.rotation.y),
              0,
              -Math.cos(w.group.rotation.y),
            ),
        nearby = navigationCrowd.filter(
          (other) => other !== w && other.group.visible,
        ),
        candidates: { point: THREE.Vector3; score: number }[] = [];
      if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
      forward.normalize();
      // A manual recovery is deliberately a visible side-step rather than a
      // warp. Try 45-90 degree exits on both sides of the current task heading.
      const recoveryAngles = [
        Math.PI / 4,
        -Math.PI / 4,
        Math.PI / 3,
        -Math.PI / 3,
        (Math.PI * 5) / 12,
        (-Math.PI * 5) / 12,
        Math.PI / 2,
        -Math.PI / 2,
      ];
      for (const radius of [0.62, 0.84, 1.08, 1.36, 1.62])
        for (const angle of recoveryAngles) {
          const direction = forward
              .clone()
              .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle),
            point = origin.clone().addScaledVector(direction, radius),
            firstStep = origin
              .clone()
              .lerp(point, Math.min(1, 0.12 / radius));
          if (
            !boundaryClear(w, point) ||
            navBlocked(w, point, 0.3, seatObstacleAccess(w)) ||
            !staticSegmentClear(w, origin, point) ||
            !manualRecoveryPeopleStepClear(firstStep, w) ||
            !manualRecoveryPeopleSegmentClear(origin, point, w)
          )
            continue;
          const closestPerson = nearby.reduce(
              (closest, other) =>
                Math.min(closest, point.distanceTo(other.group.position)),
              4,
            ),
            taskDistance = taskTarget ? point.distanceTo(taskTarget) : 0,
            crowdPenalty = Math.max(0, 0.72 - closestPerson) * 12,
            turnPenalty = Math.abs(Math.abs(angle) - Math.PI / 3) * 0.08;
          candidates.push({
            point,
            score:
              crowdPenalty +
              taskDistance * 0.055 +
              radius * 0.035 +
              turnPenalty,
          });
        }
      return candidates.sort((a, b) => a.score - b.score)[0]?.point;
    };
    const resumeClickedCharacterTask = (w: Walker) => {
      // Clicking is a manual escape hatch only for a character who is supposed
      // to be moving. Intentional sitting, scanning, treatment and conversation
      // actions keep their current animation and timing.
      if (!w.group.visible || w.action !== "walk") return false;
      w.pause = 0;
      w.stuck = 0;
      w.group.userData.blockedTime = 0;
      w.group.userData.idleTime = 0;
      w.group.userData.navReplanCooldown = 0;
      w.group.userData.escapeAttempt = 0;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      delete w.group.userData.detourGoal;
      delete w.group.userData.yieldGoal;
      delete w.group.userData.recoveryGoal;
      delete w.group.userData.manualRecoveryGoal;
      delete w.group.userData.navAvoidPeople;
      delete w.group.userData.avoidanceSide;
      delete w.group.userData.avoidanceSideUntil;
      delete w.group.userData.blockRecoveryPause;
      delete w.group.userData.crowdStallReplanIssued;
      delete w.group.userData.crowdStallEscapeIssued;
      w.group.userData.progressAnchor = w.group.position.clone();
      w.group.userData.motionAnchor = w.group.position.clone();
      if (w.role === "patient") {
        const monitor = patientMonitors.get(w.group.uuid);
        if (monitor) {
          monitor.lastPosition.copy(w.group.position);
          monitor.noProgressTime = 0;
          monitor.invalidPositionTime = 0;
          monitor.seatExitTime = 0;
          monitor.clinicTransitTime = 0;
          monitor.calledTaskNoProgressTime = 0;
          monitor.calledTaskLastPosition.copy(w.group.position);
        }
        w.group.userData.calledNoProgress = 0;
        w.group.userData.calledProgressAnchor = w.group.position.clone();
        w.group.userData.clinicNoProgress = 0;
        w.group.userData.clinicMotionAnchor = w.group.position.clone();
        if (w.group.userData.consultState === "inbound") {
          interruptPatientForCall(w);
          rebuildInboundClinicPath(w);
        } else if (
          w.group.userData.counterScanPending &&
          w.group.userData.visitPhase === "checkin"
        )
          restoreCounterScanRoute(w, true);
      }
      const recoveryPoint =
        !w.group.userData.revolvingDoorTransit &&
        clickedCharacterRecoveryPoint(w);
      if (recoveryPoint) {
        w.group.userData.recoveryGoal = recoveryPoint;
        w.group.userData.manualRecoveryGoal = true;
        const recoveryDirection = recoveryPoint
            .clone()
            .sub(w.group.position)
            .setY(0)
            .normalize(),
          taskDirection = clickedCharacterTaskTarget(w)
            ?.clone()
            .sub(w.group.position)
            .setY(0)
            .normalize();
        if (taskDirection)
          w.group.userData.avoidanceSide =
            Math.sign(
              taskDirection.x * recoveryDirection.z -
                taskDirection.z * recoveryDirection.x,
            ) || 1;
        // The short visible hesitation makes the 45-90 degree change of course
        // readable, while remaining below the agreed 0.4 second limit.
        w.pause = 0.14;
      }
      w.action = "walk";
      w.actionTime = 0;
      if (!recoveryPoint) w.pause = 0;
      return true;
    };
    const click = (e: PointerEvent) => {
      if (birdAtPointer(e)) {
        showBirdStatus();
        return;
      }
      const hit = pointer(e);
      if (!hit) return;
      const root = hit.object.userData.hitRoot || hit.object;
      if (root.userData.interactive === "elevator") {
        if (focusedPatient) clearFocusedPatient();
        onElevatorOpen();
      } else if (root.userData.interactive === "qr") {
        const qrId = root.userData.qrId as string | undefined;
        if (qrId)
          window.open(`/qr/${qrId}`, "_blank", "noopener,noreferrer");
      } else if (root.userData.interactive === "door") {
        const d = doors.find((v) => v.room === root.userData.room)!,
          closed =
            !d.auto && d.pivot.position.distanceTo(d.closedPosition) < 0.16;
        if (!closed) return;
        const right = new THREE.Vector3()
          .setFromMatrixColumn(camera.matrixWorld, 0)
          .normalize();
        d.knockBadge.position.copy(hit.point).addScaledVector(right, 0.2);
        d.knockBadge.position.y += 0.2;
        d.knockBadge.position.addScaledVector(ray.ray.direction, -0.035);
        d.knockTime = 1.45;
        const doctor = doctors[d.room - 1],
          doctorInside =
            doctor &&
            (doctor.action === "clinicSit" ||
              (doctor.action === "wave" &&
                doctor.group.userData.waveResume === "clinicSit") ||
              doctor.group.position.distanceTo(clinicDoctorSeats[d.room - 1]) <
                3.25);
        if (doctor && doctorInside && !clinicHasPatient(d.room))
          doctor.group.userData.knockExit = true;
        onKnock(d.room);
      } else if (root.userData.interactive === "wardDoor") {
        const wardDoor =
          wardSwingDoors[Number(root.userData.wardDoorIndex)];
        if (wardDoor)
          wardDoor.openTarget = wardDoor.openTarget === 1 ? 0 : 1;
      } else if (root.userData.interactive === "courtyardDoor") {
        const courtyardDoor =
          courtyardAutoDoors[Number(root.userData.courtyardDoorIndex)];
        if (courtyardDoor) {
          courtyardDoor.openTarget = 1;
          courtyardDoor.closeAt = performance.now() + 4200;
        }
      } else if (root.userData.interactive === "bird") {
        showBirdStatus();
      } else if (root.userData.interactive === "medicationRobot") {
        if (focusedPatient) clearFocusedPatient();
        onTalk("assistant", {
          eyebrow: "MEDICATION ROBOT · 3F",
          title: "給藥機器人",
          line: medicationRobotStatus(),
          detail:
            "依序服務本輪剛完成護理檢查的病患，完成後返回護理站右上角待機。",
        });
      } else if (root.userData.interactive === "person") {
        const inpatient = inpatientPatients.find(
          (actor) => actor.walker.group === root,
        );
        if (inpatient) {
          if (focusedPatient) clearFocusedPatient();
          onTalk("patient", {
            eyebrow: "INPATIENT STATUS · 3F",
            title: `病房 ${inpatient.slot.room} · ${inpatient.slot.index + 1} 號床病患`,
            line: `目前狀態：${patientCurrentStatus(inpatient)}`,
            detail: "此病床為固定所屬床位；移動時會全程單手扶著點滴架。",
          });
          return;
        }
        const wardNurse = wardNurses.find(
          (actor) => actor.walker.group === root,
        );
        if (wardNurse) {
          if (focusedPatient) clearFocusedPatient();
          onTalk("nurse", {
            eyebrow: "WARD NURSE STATUS · 3F",
            title: `三樓護理師 ${wardNurse.index + 1}`,
            line: wardNurseStatus(wardNurse),
            detail: "護理站電腦、病例與病房巡檢工作會由三位護理師輪替執行。",
          });
          return;
        }
        const w = walkers.find((v) => v.group === root);
        if (w?.role === "patient") {
          focusPatient(w);
          return;
        }
        if (focusedPatient) clearFocusedPatient();
        // The eye helper always greets when clicked. If the click interrupts
        // walking, save that intent and rebuild its collision-safe route only
        // after the greeting finishes; manual stuck recovery must never consume
        // the click before the wave can begin.
        if (w?.group.userData.eyeAssistant) {
          if (w.action !== "wave") {
            const wasTalking = w.action === "socialTalk",
              wasWalking = w.action === "walk",
              partner = wasTalking
                ? walkers.find(
                    (candidate) =>
                      candidate.group.uuid === w.group.userData.talkPartner,
                  )
                : undefined;
            w.group.userData.waveResume = wasTalking ? "socialTalk" : "walk";
            w.group.userData.waveResumeTime = w.actionTime;
            w.group.userData.waveNeedsRepath = wasWalking;
            if (partner) {
              w.group.userData.waveTalkPartner = partner.group.uuid;
              partner.group.userData.talkPausedByEye = w.group.uuid;
            }
          }
          w.action = "wave";
          w.actionTime = 0;
          w.pause = 0;
          onTalk(root.userData.role, staffInteraction(w));
          return;
        }
        const restarted = w ? resumeClickedCharacterTask(w) : false;
        if (w && !restarted && doctorIsWaitingForPatient(w)) {
          w.group.userData.waveResume = "clinicSit";
          w.group.userData.waveResumeTime = w.actionTime;
          w.action = "wave";
          w.actionTime = 0;
          w.pause = 0;
        }
        onTalk(root.userData.role, w ? staffInteraction(w) : undefined);
      }
    };
    const move = (e: PointerEvent) =>
      (renderer.domElement.style.cursor =
        birdAtPointer(e) || pointer(e) ? "pointer" : "grab");
    renderer.domElement.addEventListener("click", click);
    renderer.domElement.addEventListener("pointermove", move);

    const counterNursePoint = new THREE.Vector3(0, 0, receptionNurseZ),
      counterPublicPoint = new THREE.Vector3(0, 0, -1.78),
      // After reporting at the centre of the counter, the patient walks sideways
      // to the lobby-facing side of the QR stand before taking out the phone.
      counterQrApproachPoint = new THREE.Vector3(1.9, 0, -1.78),
      // Medicine pickup leaves the same service point in the opposite direction.
      // This first waypoint makes the requested left turn visible before the
      // patient joins the automatic-door exit lane.
      medicineDepartureTurnPoint = new THREE.Vector3(-1.9, 0, -1.78),
      counterQueueDirection = new THREE.Vector3(0, 0, 1),
      // Check-in and medicine pickup share one first-arrival-first-served queue.
      // Everyone waits in one straight, single-file line. Each successive mark
      // is exactly one metre behind the person ahead; the active guest stands at
      // counterPublicPoint and the first waiting mark starts one metre behind it.
      counterQueueHoldingPoints = Array.from(
        { length: 11 },
        (_, queueIndex) =>
          new THREE.Vector3(
            counterPublicPoint.x,
            0,
            counterPublicPoint.z + queueIndex + 1,
          ),
      );
    const counterServiceQueue: string[] = [];
    let counterArrivalSequence = 0;
    const isCounterServicePhase = (w: Walker) =>
      w.role === "patient" &&
      w.group.visible &&
      w.group.userData.activePatient &&
      ((w.group.userData.visitPhase === "checkin" &&
        !w.group.userData.counterScanPending &&
        w.action !== "counterScan") ||
        w.group.userData.visitPhase === "pickupQueue" ||
        w.group.userData.visitPhase === "pickup" ||
        w.action === "counterTalk" ||
        w.action === "medicinePickup");
    const counterQueuePosition = (w: Walker) =>
      counterServiceQueue.indexOf(w.group.uuid);
    const releaseCounterService = (w: Walker) => {
      const servicedQueueIndex = counterQueuePosition(w);
      if (servicedQueueIndex >= 0)
        counterServiceQueue.splice(servicedQueueIndex, 1);
      delete w.group.userData.counterClaimed;
      delete w.group.userData.counterQueueOrder;
      delete w.group.userData.counterQueueIndex;
      delete w.group.userData.counterQueueWaiting;
      delete w.group.userData.pickupAtQueue;
    };
    const counterQueueHoldingGoal = (w: Walker) => {
      const queuePosition = counterQueuePosition(w);
      return counterQueueHoldingPoints[
        Math.min(
          Math.max(0, queuePosition - 1),
          counterQueueHoldingPoints.length - 1,
        )
      ];
    };
    const counterQueueVisualDepth = (w: Walker) =>
      Math.max(
        0,
        w.group.position
          .clone()
          .sub(counterPublicPoint)
          .dot(counterQueueDirection),
      );
    const syncCounterServiceQueue = () => {
      for (
        let queueIndex = counterServiceQueue.length - 1;
        queueIndex >= 0;
        queueIndex--
      ) {
        const queued = patients.find(
          (patient) => patient.group.uuid === counterServiceQueue[queueIndex],
        );
        if (!queued || !isCounterServicePhase(queued)) {
          if (queued) {
            delete queued.group.userData.counterQueueOrder;
            delete queued.group.userData.counterQueueIndex;
            delete queued.group.userData.counterQueueWaiting;
          }
          counterServiceQueue.splice(queueIndex, 1);
        }
      }
      // Several patients can become eligible in the same rendered frame (most
      // notably on the initial screen). Distance breaks that tie so the patient
      // who is already closest to reception receives the earlier ticket.
      patients
        .filter(
          (patient) =>
            isCounterServicePhase(patient) &&
            !counterServiceQueue.includes(patient.group.uuid),
        )
        .sort(
          (a, b) =>
            a.group.position.distanceTo(counterPublicPoint) -
            b.group.position.distanceTo(counterPublicPoint),
        )
        .forEach((patient) => {
          counterServiceQueue.push(patient.group.uuid);
          patient.group.userData.counterQueueOrder = ++counterArrivalSequence;
        });
      // Rebuild the logical order from the visible single-file order instead of
      // retaining an earlier radial-distance tie.  The counter occupant remains
      // first; everyone else is ordered by their projection along the queue
      // centreline, with the arrival ticket used only as a stable near-tie break.
      counterServiceQueue.sort((aUuid, bUuid) => {
        const a = patients.find((patient) => patient.group.uuid === aUuid),
          b = patients.find((patient) => patient.group.uuid === bUuid);
        if (!a || !b) return 0;
        const aServing =
            a.action === "counterTalk" || a.action === "medicinePickup",
          bServing =
            b.action === "counterTalk" || b.action === "medicinePickup";
        if (aServing !== bServing) return aServing ? -1 : 1;
        const depthDifference =
          counterQueueVisualDepth(a) - counterQueueVisualDepth(b);
        if (Math.abs(depthDifference) > 0.12) return depthDifference;
        return (
          (a.group.userData.counterQueueOrder || 0) -
          (b.group.userData.counterQueueOrder || 0)
        );
      });
      counterServiceQueue.forEach((uuid, queueIndex) => {
        const queued = patients.find((patient) => patient.group.uuid === uuid);
        if (queued) queued.group.userData.counterQueueIndex = queueIndex;
      });
      const activeGuest = patients.find(
          (patient) =>
            patient.action === "counterTalk" ||
            patient.action === "medicinePickup",
        ),
        queueHead = patients.find(
          (patient) => patient.group.uuid === counterServiceQueue[0],
        ),
        rightfulOwner = activeGuest || queueHead;
      // A stale claimant must never make the counter look busy. Only the current
      // visible head (or the guest already being served) may own the service lane.
      patients.forEach((patient) => {
        if (
          patient !== rightfulOwner &&
          patient.group.userData.counterClaimed
        )
          delete patient.group.userData.counterClaimed;
      });
      if (
        !activeGuest &&
        queueHead?.action === "walk" &&
        isCounterServicePhase(queueHead) &&
        !queueHead.group.userData.counterScanPending
      ) {
        queueHead.group.userData.counterClaimed = true;
        delete queueHead.group.userData.counterQueueWaiting;
        delete queueHead.group.userData.pickupAtQueue;
        queueHead.group.userData.lifecyclePath = [counterPublicPoint.clone()];
        queueHead.group.userData.navAvoidPeople = true;
        delete queueHead.group.userData.navPath;
        delete queueHead.group.userData.navTarget;
        delete queueHead.group.userData.detourGoal;
        delete queueHead.group.userData.yieldGoal;
        queueHead.pause = 0;
      }
    };
    // Social conversations must never stop traffic at the entrance, in the
    // payment-to-reception aisle, or across the public frontage of any clinic.
    // Characters may walk through these areas; the scheduler simply waits until
    // both participants have reached a side waiting zone before starting.
    const inClinicConversationNoStopZone = (p: THREE.Vector3) =>
      clinicDoorPoints.some((door, room) => {
        const relative = p.clone().sub(door),
          depth = relative.dot(clinicOuts[room]),
          side = Math.abs(relative.dot(clinicTangents[room]));
        return depth > -3.3 && depth < 0.55 && side < 1.8;
      });
    const inConversationNoStopZone = (p: THREE.Vector3) => {
      const revolvingEntranceApron =
          Math.abs(p.x) < 3.65 && p.z > 3.45 && p.z < 9.2,
        paymentToReceptionAisle =
          p.x > -3.95 && p.x < 3.65 && p.z > -2.5 && p.z <= 5.35;
      return (
        revolvingEntranceApron ||
        paymentToReceptionAisle ||
        inClinicConversationNoStopZone(p)
      );
    };
    const conversationPairIsClear = (a: Walker, b: Walker) => {
      const midpoint = a.group.position
        .clone()
        .lerp(b.group.position, 0.5);
      return (
        !inConversationNoStopZone(a.group.position) &&
        !inConversationNoStopZone(b.group.position) &&
        !inConversationNoStopZone(midpoint)
      );
    };
    const medicinePickupQueueGoal = (w: Walker) =>
      counterQueueHoldingGoal(w);
    const isCounterQueueHead = (w: Walker) =>
      w.role === "patient" &&
      isCounterServicePhase(w) &&
      (counterQueuePosition(w) === 0 || !!w.group.userData.counterClaimed);
    const counterHeadPassThroughPair = (a: Walker, b: Walker) => {
      const aQueued = counterQueuePosition(a) >= 0,
        bQueued = counterQueuePosition(b) >= 0;
      // Only unrelated passers may cross the active queue head. The next queue
      // member remains solid, preserving the single-file one-metre spacing.
      return (
        (isCounterQueueHead(a) && !bQueued) ||
        (isCounterQueueHead(b) && !aQueued)
      );
    };
    const counterIsBusy = (self: Walker) =>
      patients.some(
        (p) =>
          p !== self &&
          p.group.visible &&
          (p.group.userData.counterClaimed ||
            p.action === "counterTalk" ||
            p.action === "medicinePickup"),
      );
    const peopleClear = (candidate: THREE.Vector3, self: Walker, min = 0.78) =>
      !navigationCrowd.some((o) => {
        if (
          o === self ||
          !o.group.visible ||
          counterHeadPassThroughPair(self, o) ||
          bypassGenericStreetAvoidance(self, o)
        )
          return false;
        return candidate.distanceTo(o.group.position) < min;
      });
    // When two walkers have already entered each other's clearance radius, a
    // strict distance test prevents either one from taking the first step away.
    // Permit only steps that increase the gap; approaching steps remain blocked.
    const peopleStepClear = (
      candidate: THREE.Vector3,
      self: Walker,
      min = 0.53,
    ) =>
      !navigationCrowd.some((o) => {
        if (
          o === self ||
          !o.group.visible ||
          counterHeadPassThroughPair(self, o) ||
          bypassGenericStreetAvoidance(self, o)
        )
          return false;
        const currentGap = self.group.position.distanceTo(o.group.position),
          nextGap = candidate.distanceTo(o.group.position),
          safeGap =
            self.group.userData.eyeAssistant || o.group.userData.eyeAssistant
              ? Math.max(min, 0.68)
              : min;
        return currentGap < safeGap
          ? nextGap <= currentGap + 0.001
          : nextGap < safeGap;
      });
    // Manual click recovery needs to work even after several walkers have
    // already compressed inside the normal clearance radius. Keep a hard body
    // core, but allow a smooth step through the surrounding soft clearance as
    // long as the move is not driving deeper into a severe overlap.
    const manualRecoveryPeopleStepClear = (
      candidate: THREE.Vector3,
      self: Walker,
    ) =>
      !navigationCrowd.some((other) => {
        if (
          other === self ||
          !other.group.visible ||
          counterHeadPassThroughPair(self, other) ||
          bypassGenericStreetAvoidance(self, other)
        )
          return false;
        const currentGap = self.group.position.distanceTo(other.group.position),
          nextGap = candidate.distanceTo(other.group.position);
        if (nextGap < 0.24) return true;
        if (currentGap < 0.34) return nextGap < currentGap - 0.002;
        if (currentGap < 0.72) return nextGap < 0.3;
        return nextGap < 0.42;
      });
    const manualRecoveryPeopleSegmentClear = (
      from: THREE.Vector3,
      to: THREE.Vector3,
      self: Walker,
    ) => {
      const segment = to.clone().sub(from).setY(0),
        lengthSq = segment.lengthSq();
      if (lengthSq < 0.001) return false;
      return !navigationCrowd.some((other) => {
        if (
          other === self ||
          !other.group.visible ||
          counterHeadPassThroughPair(self, other) ||
          bypassGenericStreetAvoidance(self, other)
        )
          return false;
        const currentGap = from.distanceTo(other.group.position),
          offset = other.group.position.clone().sub(from).setY(0),
          along = THREE.MathUtils.clamp(offset.dot(segment) / lengthSq, 0, 1),
          closest = from.clone().addScaledVector(segment, along),
          closestGap = closest.distanceTo(other.group.position),
          endGap = to.distanceTo(other.group.position);
        // Never cross another person's body core. If both characters already
        // overlap, the selected route must start by opening that gap.
        if (currentGap < 0.34)
          return closestGap < Math.max(0.2, currentGap - 0.015) ||
            endGap <= currentGap + 0.08;
        return closestGap < 0.28 || endGap < 0.44;
      });
    };
    // Lobby-only walkers may never be steered or separated through the fan-shaped
    // perimeter. Doctors and patients on an active consultation path are allowed to
    // cross the perimeter only through the physical door opening; wall obstacles
    // still protect the solid portions of every clinic wall.
    const boundaryClear = (w: Walker, candidate: THREE.Vector3) => {
      if (w.group.userData.lifecyclePath) {
        // A lifecycle path is an ordered workflow, not permission to leave the
        // building through any point on the fan-shaped curtain wall. Keep
        // counter/seat/QR-only paths inside the lobby. Entering and departing
        // patients may be outside only on the rendered pavement or in the
        // narrow, physical automatic-door portal.
        if (insideLobby(candidate, 0.68)) return true;
        const streetTransit =
            w.group.userData.visitPhase === "entering" ||
            w.group.userData.visitPhase === "leaving",
          onPublicPavement = candidate.z >= 8.72 && candidate.z <= 10.12,
          inAutomaticDoorPortal =
            Math.abs(candidate.x) <= 1.34 &&
            candidate.z >= 6.42 &&
            candidate.z < 8.72;
        return streetTransit && (onPublicPavement || inAutomaticDoorPortal);
      }
      const clinicTransit =
        w.role === "doctor" ||
        !!w.group.userData.consultPath ||
        !!w.group.userData.clinicStaffPath;
      if (!clinicTransit) return insideLobby(candidate, 0.68);
      const room =
          ((w.role === "doctor" || w.group.userData.clinicStaffPath
            ? w.room
            : w.group.userData.consultRoom) || 1) - 1,
        door = clinicDoorPoints[room],
        out = clinicOuts[room],
        tan = clinicTangents[room],
        relative = candidate.clone().sub(door),
        depth = relative.dot(out),
        side = Math.abs(relative.dot(tan));
      if (depth < -0.16) return insideLobby(candidate, 0.42);
      if (depth < 1.48) return side < 1.22;
      return depth < 7.08 && side < 2.72;
    };
    const inAssignedDoorPortal = (w: Walker, p: THREE.Vector3) => {
      if (
        !(
          w.role === "doctor" ||
          w.group.userData.consultPath ||
          w.group.userData.clinicStaffPath
        )
      )
        return false;
      const room =
          ((w.role === "doctor" || w.group.userData.clinicStaffPath
            ? w.room
            : w.group.userData.consultRoom) || 1) - 1,
        relative = p.clone().sub(clinicDoorPoints[room]),
        depth = relative.dot(clinicOuts[room]),
        side = Math.abs(relative.dot(clinicTangents[room]));
      return depth > -2.05 && depth < 2.45 && side < 1.08;
    };
    // The centre of each doorway is an explicit transit corridor. General obstacle
    // data is intentionally disabled only inside this narrow strip; otherwise the
    // wall samples and nearby props can make the A* grid close an open doorway.
    const assignedDoorIndex = (w: Walker) =>
      ((w.role === "doctor" || w.group.userData.clinicStaffPath
        ? w.room
        : w.group.userData.consultRoom) || 1) - 1;
    const inAssignedDoorCore = (w: Walker, p: THREE.Vector3) => {
      if (
        !(
          w.role === "doctor" ||
          w.group.userData.consultPath ||
          w.group.userData.clinicStaffPath
        )
      )
        return false;
      const room = assignedDoorIndex(w),
        relative = p.clone().sub(clinicDoorPoints[room]),
        depth = relative.dot(clinicOuts[room]),
        side = Math.abs(relative.dot(clinicTangents[room]));
      return depth > -2.08 && depth < 2.58 && side < 0.86;
    };
    const clinicStoolBlocked = (w: Walker, p: THREE.Vector3, r: number) =>
      clinicStoolZones.some((zone) => {
        const ownPatientTransit =
          w.role === "patient" &&
          w.group.userData.consultRoom === zone.room &&
          [
            "inbound",
            "toExam",
            "postExamSeat",
            "clinicScan",
            "leaving",
          ].includes(w.group.userData.consultState);
        return !ownPatientTransit && p.distanceTo(zone.pos) < 0.42 + r;
      });
    const protectedWaitingSeatRowBlocked = (
      w: Walker,
      p: THREE.Vector3,
      r = 0.32,
    ) =>
      waitingSeatRowZones.some((zone) => {
        const ownsSeatTransit = !!(
            w.role === "patient" &&
            w.seatId !== undefined &&
            Math.floor(w.seatId / 5) === zone.island &&
            (w.group.userData.seatGoal ||
              w.group.userData.seatApproach ||
              w.group.userData.leavingSeat ||
              w.group.userData.pickupSeatExit)
          ),
          // Navigation points represent a character's centre. Expand the row by
          // the full body radius plus a little shoulder room; otherwise a centre
          // can remain technically outside while the model visibly overlaps the
          // chair backs. The extra clearance is especially important beside the
          // planter at the left-front island, where crowd steering used to funnel
          // walkers along the exact edge of the protected row.
          clearance = Math.max(0.48, r + 0.18),
          minX = zone.minX - clearance,
          maxX = zone.maxX + clearance,
          minZ = zone.minZ - clearance,
          maxZ = zone.maxZ + clearance,
          inside =
            p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ,
          current = w.group.position,
          currentlyInside =
            current.x > minX &&
            current.x < maxX &&
            current.z > minZ &&
            current.z < maxZ;
        if (!inside || ownsSeatTransit) return false;
        if (!currentlyInside) return true;
        // A stale workflow flag may occasionally leave a patient already inside
        // the protected row. Keep inward and lateral motion blocked, but allow
        // every step that reduces their depth toward the nearest edge so recovery
        // can walk them out instead of sealing them inside the zone.
        const currentDepth = Math.min(
            current.x - minX,
            maxX - current.x,
            current.z - minZ,
            maxZ - current.z,
          ),
          nextDepth = Math.min(
            p.x - minX,
            maxX - p.x,
            p.z - minZ,
            maxZ - p.z,
          );
        return nextDepth >= currentDepth - 0.004;
      });
    const inReceptionNurseExclusionZone = (p: THREE.Vector3) =>
      // The three metres are measured from the lobby service position, while
      // the rear edge also covers the physical counter face. A small lateral
      // body margin keeps the nurse model itself outside the protected lane.
      Math.abs(p.x) < 4.55 &&
      p.z > -2.94 &&
      p.z < counterPublicPoint.z + 3;
    const navBlocked = (
      w: Walker,
      p: THREE.Vector3,
      r = 0.32,
      allowedSeat?: number,
    ) =>
      w.group.userData.lobbyRoamingNurse &&
      inReceptionNurseExclusionZone(p)
        ? true
        : inAssignedDoorCore(w, p)
        ? false
        : protectedWaitingSeatRowBlocked(w, p, r) ||
          blocked(p, obs, r, allowedSeat, inAssignedDoorPortal(w, p)) ||
          clinicStoolBlocked(w, p, r);
    const isActiveDoorTransit = (w: Walker) => {
      const room = assignedDoorIndex(w),
        door = clinicDoorPoints[room],
        doctorMode = w.group.userData.doctorPathMode,
        patientTransit =
          w.role === "patient" &&
          !!w.group.userData.consultPath &&
          !w.group.userData.leavingSeat,
        doctorTransit =
          w.role === "doctor" &&
          (doctorMode === "knockExit" || doctorMode === "knockReturn"),
        nurseTransit =
          w.role === "nurse" &&
          !!w.room &&
          (w.group.userData.clinicStaffPathMode === "doorWait" ||
            w.group.userData.clinicStaffPathMode === "followIn" ||
            w.group.userData.clinicStaffPathMode === "leadIn" ||
            w.group.userData.clinicStaffPathMode === "returnReady");
      return (
        !!door &&
        (patientTransit || doctorTransit || nurseTransit) &&
        w.group.position.distanceTo(door) < 4.05
      );
    };
    // Departure, medicine pickup and clinic transfer are mutually exclusive
    // patient transit phases. While any is active, no generic crowd watchdog may
    // replace the destination; it may only replan toward that same destination.
    const hasExclusivePatientTransit = (w: Walker) =>
      w.role === "patient" &&
      (w.group.userData.visitPhase === "leaving" ||
        w.group.userData.departureLocked ||
        w.group.userData.counterScanPending ||
        w.group.userData.pickupFlowLocked ||
        w.group.userData.pickupSeatExit ||
        w.group.userData.leavingSeat ||
        (!!w.group.userData.consultPath &&
          [
            "inbound",
            "leaving",
            "toExam",
            "postExamSeat",
            "clinicScan",
          ].includes(w.group.userData.consultState)));
    const seatObstacleAccess = (w: Walker) =>
      w.group.userData.leavingSeat ||
      w.group.userData.pickupSeatExit ||
      w.group.userData.seatGoal ||
      w.group.userData.seatApproach
        ? w.seatId
        : undefined;
    const circulationHubs = [
      new THREE.Vector3(0, 0, -3.45),
      new THREE.Vector3(-2.25, 0, -2.55),
      new THREE.Vector3(2.25, 0, -2.55),
      new THREE.Vector3(0, 0, -0.35),
      new THREE.Vector3(-2.35, 0, 2.05),
      new THREE.Vector3(2.35, 0, 2.05),
      new THREE.Vector3(0, 0, 4.15),
      new THREE.Vector3(-1.35, 0, 6.1),
      new THREE.Vector3(1.35, 0, 6.1),
      new THREE.Vector3(-7.1, 0, 4.2),
      new THREE.Vector3(7.1, 0, 4.2),
    ];
    // A called patient leaving the counter-side row of the right waiting island
    // can otherwise begin the clinic route inside the narrow pocket between the
    // reception planter, the counter collision zone and the chair backs. Walk
    // inward to the open cross-aisle first; A* then owns the remaining route to
    // the assigned clinic. This remains a visible walking route (never a warp).
    const rightReceptionCallMerge = new THREE.Vector3(2.25, 0, -2.55),
      needsRightReceptionCallMerge = (w: Walker) => {
        const { x, z } = w.group.position;
        return x > 3.15 && x < 6.35 && z > -3.08 && z < -0.62;
      };
    const chooseReleasePoint = (w: Walker) =>
      circulationHubs
        .filter(
          (p) =>
            boundaryClear(w, p) &&
            !navBlocked(w, p, 0.35) &&
            p.distanceTo(w.group.position) > 2.2 &&
            doors.every((d) => p.distanceTo(d.pivot.position) > 3.15),
        )
        .map((p) => ({
          p,
          crowd: walkers.reduce((sum, o) => {
            const reserved = o.group.userData.yieldGoal as
              | THREE.Vector3
              | undefined;
            return (
              sum +
              (o !== w &&
              (p.distanceTo(o.group.position) < 1.7 ||
                (reserved && p.distanceTo(reserved) < 0.8))
                ? 1
                : 0)
            );
          }, 0),
        }))
        .sort(
          (a, b) =>
            a.crowd - b.crowd ||
            b.p.distanceTo(w.group.position) - a.p.distanceTo(w.group.position),
        )[0]
        ?.p.clone();
    const chooseRecoverySide = (w: Walker, target: THREE.Vector3) => {
      const forward = target.clone().sub(w.group.position);
      forward.y = 0;
      if (forward.lengthSq() < 0.001)
        forward.set(
          -Math.sin(w.group.rotation.y),
          0,
          -Math.cos(w.group.rotation.y),
        );
      forward.normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      return [1, -1]
        .map((side) => {
          let score = 0;
          for (const distance of [0.5, 0.65, 0.8]) {
            const candidate = w.group.position
              .clone()
              .addScaledVector(right, side * distance)
              .addScaledVector(forward, 0.16);
            if (
              boundaryClear(w, candidate) &&
              !navBlocked(w, candidate, 0.32, seatObstacleAccess(w))
            ) {
              score += 2;
              if (peopleClear(candidate, w, 0.62)) score += 2;
            }
          }
          return { side, score };
        })
        .sort(
          (a, b) =>
            b.score - a.score ||
            (w.group.id % 2 === 0 ? b.side - a.side : a.side - b.side),
        )[0].side;
    };
    const escapeStep = (
      w: Walker,
      target?: THREE.Vector3,
      lockedSide?: number,
    ) => {
      const phase =
          (w.group.userData.gaitPhase || 0) +
          (w.group.userData.escapeAttempt || 0) * 0.73,
        forward = target
          ? target.clone().sub(w.group.position).setY(0)
          : new THREE.Vector3(
              -Math.sin(w.group.rotation.y),
              0,
              -Math.cos(w.group.rotation.y),
            ),
        candidates: { p: THREE.Vector3; score: number }[] = [];
      if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
      forward.normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      for (const radius of [0.55, 0.85, 1.2, 1.65])
        for (let k = 0; k < 20; k++) {
          const a = phase + (k / 20) * Math.PI * 2,
            p = w.group.position
              .clone()
              .add(
                new THREE.Vector3(
                  Math.cos(a) * radius,
                  0,
                  Math.sin(a) * radius,
                ),
              ),
            steps = Math.max(3, Math.ceil(radius / 0.16));
          let clear = true;
          for (let s = 1; s <= steps; s++) {
            const q = w.group.position.clone().lerp(p, s / steps);
            if (
              !boundaryClear(w, q) ||
              navBlocked(w, q, 0.32, seatObstacleAccess(w))
            ) {
              clear = false;
              break;
            }
          }
          if (!clear || !peopleClear(p, w, 0.64)) continue;
          const crowd = walkers.reduce(
              (n, o) =>
                n + (o !== w && p.distanceTo(o.group.position) < 1.35 ? 1 : 0),
              0,
            ),
            lateral = p.clone().sub(w.group.position).dot(right),
            wrongLockedSide =
              lockedSide && lateral * lockedSide < 0.08 ? 4.8 : 0,
            score =
              (target ? p.distanceTo(target) : 0) +
              crowd * 2.4 +
              radius * 0.08 +
              wrongLockedSide;
          candidates.push({ p, score });
        }
      return candidates.sort((a, b) => a.score - b.score)[0]?.p;
    };
    const staticSegmentClear = (
      w: Walker,
      from: THREE.Vector3,
      to: THREE.Vector3,
    ) => {
      const steps = Math.max(2, Math.ceil(from.distanceTo(to) / 0.22));
      for (let k = 1; k <= steps; k++) {
        const p = from.clone().lerp(to, k / steps);
        if (
          !boundaryClear(w, p) ||
          navBlocked(w, p, 0.3, seatObstacleAccess(w))
        )
          return false;
      }
      return true;
    };
    const planPath = (
      w: Walker,
      target: THREE.Vector3,
      avoidPeople = false,
    ) => {
      const door = clinicDoorPoints[assignedDoorIndex(w)];
      if (
        isActiveDoorTransit(w) &&
        inAssignedDoorPortal(w, w.group.position) &&
        (inAssignedDoorPortal(w, target) || target.distanceTo(door) < 2.7)
      )
        return [target.clone()];
      if (
        inAssignedDoorCore(w, target) &&
        inAssignedDoorPortal(w, w.group.position) &&
        w.group.position.distanceTo(door) < 3.05
      )
        return [target.clone()];
      const humanSegmentClear = (from: THREE.Vector3, to: THREE.Vector3) => {
        const steps = Math.max(2, Math.ceil(from.distanceTo(to) / 0.3));
        for (let k = 1; k <= steps; k++)
          if (!peopleClear(from.clone().lerp(to, k / steps), w, 0.66))
            return false;
        return true;
      };
      if (
        staticSegmentClear(w, w.group.position, target) &&
        (!avoidPeople || humanSegmentClear(w.group.position, target))
      )
        return [target.clone()];
      // Called patients get a finer navigation grid so the route can resolve the
      // narrow transition from the lobby aisle into the reserved door corridor.
      const step = hasExclusivePatientTransit(w) ? 0.5 : 0.62,
        minX = -22,
        maxX = 22,
        minZ = -15,
        maxZ = 10.5,
        key = (x: number, z: number) => `${x},${z}`,
        point = (x: number, z: number) =>
          new THREE.Vector3(minX + x * step, 0, minZ + z * step),
        cols = Math.floor((maxX - minX) / step) + 1,
        rows = Math.floor((maxZ - minZ) / step) + 1,
        toCell = (p: THREE.Vector3) => ({
          x: THREE.MathUtils.clamp(
            Math.round((p.x - minX) / step),
            0,
            cols - 1,
          ),
          z: THREE.MathUtils.clamp(
            Math.round((p.z - minZ) / step),
            0,
            rows - 1,
          ),
        }),
        passable = (p: THREE.Vector3) =>
          boundaryClear(w, p) && !navBlocked(w, p, 0.3, seatObstacleAccess(w)),
        nearest = (c: { x: number; z: number }) => {
          for (let radius = 0; radius <= 5; radius++)
            for (let dz = -radius; dz <= radius; dz++)
              for (let dx = -radius; dx <= radius; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
                const x = c.x + dx,
                  z = c.z + dz;
                if (
                  x >= 0 &&
                  x < cols &&
                  z >= 0 &&
                  z < rows &&
                  passable(point(x, z))
                )
                  return { x, z };
              }
        },
        start = nearest(toCell(w.group.position)),
        goal = nearest(toCell(target));
      // Never fall back to a direct line when the grid cannot place either end.
      // That fallback made a blocked walker keep facing and stepping toward the
      // chair row even though every candidate step was rejected.
      if (!start || !goal) return [];
      const open = [{ ...start, f: 0 }],
        came = new Map<string, string>(),
        g = new Map<string, number>([[key(start.x, start.z), 0]]),
        cells = new Map<string, { x: number; z: number }>([
          [key(start.x, start.z), start],
        ]),
        dirs = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ],
        goalKey = key(goal.x, goal.z);
      let found = false,
        iterations = 0;
      while (open.length && iterations++ < 7200) {
        open.sort((a, b) => a.f - b.f);
        const current = open.shift()!,
          ck = key(current.x, current.z);
        if (ck === goalKey) {
          found = true;
          break;
        }
        const cp = point(current.x, current.z);
        for (const [dx, dz] of dirs) {
          const nx = current.x + dx,
            nz = current.z + dz;
          if (nx < 0 || nx >= cols || nz < 0 || nz >= rows) continue;
          const np = point(nx, nz),
            nk = key(nx, nz);
          if (!passable(np) || !staticSegmentClear(w, cp, np)) continue;
          const humanPenalty = avoidPeople
              ? walkers.reduce((sum, o) => {
                  if (o === w || counterHeadPassThroughPair(w, o)) return sum;
                  const d = np.distanceTo(o.group.position);
                  return sum + (d < 1.45 ? (1.45 - d) * 5.2 : 0);
                }, 0)
              : 0,
            next = (g.get(ck) ?? Infinity) + Math.hypot(dx, dz) + humanPenalty;
          if (next < (g.get(nk) ?? Infinity)) {
            came.set(nk, ck);
            g.set(nk, next);
            cells.set(nk, { x: nx, z: nz });
            const h = Math.hypot(goal.x - nx, goal.z - nz);
            open.push({ x: nx, z: nz, f: next + h });
          }
        }
      }
      if (!found) return [];
      const raw: THREE.Vector3[] = [];
      let cursor = goalKey;
      while (cursor !== key(start.x, start.z)) {
        const c = cells.get(cursor);
        if (!c) break;
        raw.push(point(c.x, c.z));
        cursor = came.get(cursor) || key(start.x, start.z);
      }
      raw.reverse();
      const smooth: THREE.Vector3[] = [],
        source = w.group.position.clone();
      let anchor = source,
        index = 0;
      while (index < raw.length) {
        let far = index;
        while (
          far + 1 < raw.length &&
          staticSegmentClear(w, anchor, raw[far + 1]) &&
          (!avoidPeople || humanSegmentClear(anchor, raw[far + 1]))
        )
          far++;
        smooth.push(raw[far]);
        anchor = raw[far];
        index = far + 1;
      }
      if (
        staticSegmentClear(w, anchor, target) &&
        (!avoidPeople || humanSegmentClear(anchor, target))
      )
        smooth.push(target.clone());
      return smooth;
    };
    const seatApproachPoint = (
      w: Walker,
      seat: { pos: THREE.Vector3; yaw: number; release: THREE.Vector3 },
      id: number,
    ) => {
      // Approach and leave through the same chair-owned lane. This keeps the two
      // corrected inner seats from approaching through one corridor and trying
      // to exit through another after the waiting cycle is interrupted.
      const front = seat.release.clone().sub(seat.pos).normalize();
      let temporarilyOccupiedFallback: THREE.Vector3 | undefined;
      for (const distance of [0.86, 1.02, 1.2])
        for (const angle of [0, 0.32, -0.32, 0.62, -0.62]) {
          const p = seat.pos
            .clone()
            .addScaledVector(
              front.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle),
              distance,
            );
          if (!insideLobby(p, 0.7) || blocked(p, obs, 0.34, id)) continue;
          // A passing person must not make a geometrically valid chair look
          // unavailable forever. Reserve the chair now; live steering will wait
          // for the temporary pedestrian conflict to clear.
          if (peopleClear(p, w, 0.58)) return p;
          temporarilyOccupiedFallback ||= p;
        }
      return temporarilyOccupiedFallback;
    };
    const lobbySeatedPatientCount = () =>
      patients.filter(
        (p) =>
          p.group.visible &&
          p.group.userData.activePatient &&
          p.action === "sit" &&
          insideLobby(p.group.position, 0.12),
      ).length;
    const lobbySeatPipelineCount = () =>
      patients.filter(
        (p) =>
          p.group.visible && (p.action === "sit" || p.group.userData.seatGoal),
      ).length;
    const lobbySeatIntentCount = () =>
      patients.filter(
        (p) =>
          p.group.visible &&
          p.group.userData.activePatient &&
          (p.action === "sit" ||
            p.action === "lobbyScan" ||
            p.group.userData.seatGoal ||
            p.group.userData.pendingSeatAfterScan ||
            p.group.userData.qrGoal ||
            p.group.userData.qrQueueGoal),
      ).length;
    const reserveLobbySeat = (w: Walker, afterScan = false) => {
      if (lobbySeatPipelineCount() >= 7) return false;
      const avoided = w.group.userData.avoidSeatId as number | undefined,
        reserved = new Set(
          patients
            .filter(
              (p) =>
                p !== w &&
                p.group.visible &&
                (p.action === "sit" ||
                  p.group.userData.seatGoal ||
                  p.group.userData.leavingSeat),
            )
            .map((p) => p.seatId),
        ),
        choice = seatSpots
          .map((seat, id) => ({
            seat,
            id,
            approach: seatApproachPoint(w, seat, id),
            d: w.group.position.distanceTo(seat.pos),
          }))
          .filter(
            (v) =>
              v.seat.available &&
              !reserved.has(v.id) &&
              v.id !== avoided &&
              v.approach,
          )
          .sort((a, b) => a.d - b.d)[0];
      if (!choice || !choice.approach) return false;
      w.seatId = choice.id;
      w.seatPoint = choice.seat.pos.clone();
      w.seatYaw = choice.seat.yaw;
      w.group.userData.seatGoal = choice.approach.clone();
      w.group.userData.seatApproach = true;
      w.group.userData.seatApproachTime = 0;
      w.group.userData.seatApproachStallTime = 0;
      w.group.userData.seatApproachBestDistance = w.group.position.distanceTo(
        choice.approach,
      );
      w.group.userData.seatMotionAnchor = w.group.position.clone();
      w.group.userData.seatNoMotion = 0;
      w.group.userData.postScanSit = afterScan;
      w.group.userData.rotationSit = !afterScan;
      w.sitCooldown = 0;
      delete w.group.userData.avoidSeatId;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      delete w.group.userData.detourGoal;
      delete w.group.userData.yieldGoal;
      return true;
    };
    const reserveSeatAfterScan = (w: Walker) => {
      w.group.userData.pendingSeatAfterScan = true;
      const reserved = reserveLobbySeat(w, true);
      if (reserved) {
        delete w.group.userData.pendingSeatAfterScan;
        delete w.group.userData.seatRetryCooldown;
        delete w.group.userData.qrQueueGoal;
      } else w.group.userData.seatRetryCooldown = 0.45 + Math.random() * 0.35;
      return reserved;
    };
    // Canonical patient flow: counter check-in -> waiting loop -> consultation ->
    // first 6–12 second phone sit -> lobby QR scan -> second 6–12 second phone
    // sit -> medicine -> full-street departure.
    const completePatientScan = (w: Walker) => {
      const phase = w.group.userData.visitPhase;
      if (phase === "checkin") {
        w.group.userData.visitPhase = "queue";
        w.group.userData.consultCooldown = 0.55 + Math.random() * 1.1;
      } else if (phase === "postLobbyScan")
        w.group.userData.visitPhase = "postWait";
      else if (phase !== "queue") return;
      w.group.userData.hasScanned = true;
      reserveSeatAfterScan(w);
    };
    const qrQueuePoints = [
      new THREE.Vector3(-2.2, 0, 1.65),
      new THREE.Vector3(2.2, 0, 1.65),
      new THREE.Vector3(-2.1, 0, 3.45),
      new THREE.Vector3(2.1, 0, 3.45),
      new THREE.Vector3(0, 0, 5.25),
    ];
    const claimLobbyQrStation = (w: Walker) => {
      if (lobbySeatPipelineCount() >= 7) return false;
      const occupied = new Set(
          patients
            .filter(
              (p) =>
                p !== w &&
                p.group.visible &&
                p.group.userData.qrStation !== undefined &&
                (p.action === "walk" || p.action === "lobbyScan"),
            )
            .map((p) => p.group.userData.qrStation as number),
        ),
        choice = lobbyQrStations
          .map((station, id) => ({
            station,
            id,
            d: w.group.position.distanceTo(station.approach),
          }))
          .filter((v) => !occupied.has(v.id))
          .sort((a, b) => a.d - b.d)[0];
      if (!choice) return false;
      w.group.userData.qrStation = choice.id;
      w.group.userData.qrGoal = choice.station.approach.clone();
      delete w.group.userData.qrQueueGoal;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      w.group.userData.navAvoidPeople = true;
      return true;
    };
    // Characters must turn only around the vertical axis. THREE.Object3D.lookAt also
    // adds pitch when its target is above the floor (such as the counter QR sign),
    // which made the whole model — most visibly the female bun character — tip over.
    const faceFlat = (g: THREE.Group, target: THREE.Vector3) => {
      const dx = target.x - g.position.x,
        dz = target.z - g.position.z;
      g.rotation.set(0, Math.atan2(-dx, -dz), 0);
    };
    const faceSmooth = (
      g: THREE.Group,
      target: THREE.Vector3,
      amount = 0.28,
    ) => {
      const dx = target.x - g.position.x,
        dz = target.z - g.position.z,
        targetYaw = Math.atan2(-dx, -dz),
        diff = Math.atan2(
          Math.sin(targetYaw - g.rotation.y),
          Math.cos(targetYaw - g.rotation.y),
        );
      g.rotation.y += diff * amount;
    };
    const phoneGroupWorld = new THREE.Quaternion(),
      phoneParentWorld = new THREE.Quaternion(),
      phoneDesiredWorld = new THREE.Quaternion(),
      phoneLocalTilt = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-Math.PI / 6, 0, 0),
      ),
      phonePalmOffset = new THREE.Vector3(),
      upperCupWorldPosition = new THREE.Vector3();
    const bedPoseX = new THREE.Vector3(),
      bedPoseY = new THREE.Vector3(),
      bedPoseZ = new THREE.Vector3(0, -1, 0),
      bedPoseMatrix = new THREE.Matrix4();
    const poseSeated = (w: Walker, yaw: number) => {
      w.group.position.y = 0.14;
      w.group.scale.set(1, 0.88, 1);
      w.group.rotation.y = yaw;
      w.legs.forEach((l, k) => {
        l.position.set(k ? 0.14 : -0.14, 0.69, -0.3);
        l.rotation.x = -Math.PI / 2;
      });
    };
    const poseBedSit = (w: Walker, room: number) => {
      resetUpperPose(w);
      w.group.position.copy(clinicBedEdgeSeatPoints[room]);
      w.group.position.y = 0.58;
      w.group.scale.set(0.92, 0.92, 0.92);
      w.group.rotation.set(0, clinicBedSitYaws[room], 0);
      w.legs.forEach((l, k) => {
        l.position.set(k ? 0.13 : -0.13, 0.52, -0.28);
        // Keep the knee bend on a single local axis.  Leaving stale Y/Z
        // rotations here made a leg appear to turn over as the whole patient
        // rig rolled from the bed edge onto the mattress.
        l.rotation.set(-Math.PI / 2, 0, 0);
      });
    };
    const poseExamBed = (w: Walker, room: number) => {
      resetUpperPose(w);
      bedPoseY.copy(clinicOuts[room]).normalize();
      bedPoseX.copy(bedPoseY).cross(bedPoseZ).normalize();
      bedPoseMatrix.makeBasis(bedPoseX, bedPoseY, bedPoseZ);
      w.group.position
        .copy(clinicBedPoints[room])
        .addScaledVector(bedPoseY, -0.72);
      w.group.position.y = 1.06;
      w.group.scale.set(0.88, 0.88, 0.88);
      w.group.quaternion.setFromRotationMatrix(bedPoseMatrix);
      w.legs.forEach((l, k) => {
        l.position.set(k ? 0.13 : -0.13, 0.31, 0);
        l.rotation.x = 0;
      });
    };
    const resetUpperPose = (w: Walker) => {
      w.arms.forEach((a) => a.rotation.set(0, 0, 0));
      w.headRig.rotation.set(0, 0, 0);
      if (w.phone) {
        w.phone.visible = false;
        w.phone.position.set(0, 0, 0);
        w.phone.rotation.set(0, 0, 0);
        (w.phone.material as THREE.MeshStandardMaterial).emissive.setHex(0);
      }
    };
    const poseStanding = (w: Walker) => {
      const yaw = w.group.rotation.y;
      w.group.position.y = 0;
      w.group.scale.set(1, 1, 1);
      w.group.rotation.set(0, yaw, 0);
      w.legs.forEach((l, k) => {
        l.position.set(k ? 0.13 : -0.13, 0.31, 0);
        l.rotation.x = 0;
      });
      resetUpperPose(w);
    };
    const beginClinicDeparture = (
      w: Walker,
      room: number,
      usedBed: boolean,
    ) => {
      if (w.scanBadge) w.scanBadge.visible = false;
      resetUpperPose(w);
      poseStanding(w);
      w.action = "walk";
      w.actionTime = 0;
      w.group.userData.visitPhase = "postClinicWait";
      w.group.userData.hasScanned = true;
      w.group.userData.consultCooldown = 30 + Math.random() * 14;
      w.group.userData.consultState = "leaving";
      if (!usedBed) w.group.userData.clinicExitOrigin = "chair";
      w.group.userData.clinicMotionAnchor = w.group.position.clone();
      w.group.userData.clinicNoProgress = 0;
      w.group.userData.consultPath = [
        clinicPatientSeatApproaches[room].clone(),
        clinicDoorInsidePoints[room].clone(),
        clinicDoorCenterPoints[room].clone(),
        doorOutside[room].clone(),
      ];
      const roomNurse = clinicNurses[room];
      if (roomNurse && !usedBed) {
        roomNurse.group.userData.roomReady = true;
        delete roomNurse.group.userData.servicePatient;
      }
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      delete w.group.userData.detourGoal;
      delete w.group.userData.yieldGoal;
      w.pause = 0.05;
    };
    const holdPhoneAtFace = (w: Walker, phase: number, scanning = false) => {
      const lift = 1.82 + Math.sin(phase) * 0.022;
      w.arms[0].rotation.set(0, 0, 0);
      w.arms[1].rotation.set(lift, 0, -0.22);
      if (w.phone && w.phone.parent) {
        w.phone.visible = true;
        w.group.updateWorldMatrix(true, true);
        w.group.getWorldQuaternion(phoneGroupWorld);
        w.phone.parent.getWorldQuaternion(phoneParentWorld);
        phoneDesiredWorld.copy(phoneGroupWorld).multiply(phoneLocalTilt);
        w.phone.quaternion.copy(
          phoneParentWorld.invert().multiply(phoneDesiredWorld),
        );
        phonePalmOffset
          .set(0, 1, 0)
          .applyQuaternion(w.phone.quaternion)
          .multiplyScalar(0.1845);
        w.phone.position.copy(phonePalmOffset);
        (w.phone.material as THREE.MeshStandardMaterial).emissive.setHex(
          scanning ? 0x45c2c7 : 0,
        );
      }
    };
    const clinicHasPatient = (room: number) =>
      patients.some(
        (p) =>
          p.group.visible &&
          p.group.userData.consultRoom === room &&
          (p.action === "clinicChairSit" ||
            p.action === "consultSit" ||
            p.action === "postExamTalk" ||
            p.action === "postScanTalk" ||
            p.action === "clinicScan" ||
            p.action === "bedSit" ||
            p.action === "examBed" ||
            p.action === "bedExit" ||
            p.group.userData.consultState === "inbound" ||
            p.group.userData.consultState === "toExam" ||
            p.group.userData.consultState === "postExamSeat" ||
            p.group.userData.consultState === "clinicScan" ||
            p.group.userData.consultState === "leaving"),
      );
    const startDoctorKnockExit = (w: Walker) => {
      poseStanding(w);
      delete w.group.userData.knockExit;
      delete w.group.userData.consultQueued;
      delete w.group.userData.consultPatient;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      delete w.group.userData.detourGoal;
      w.group.userData.greetOnExit = true;
      w.group.userData.doctorPath = w.route.slice(1, 6).map((p) => p.clone());
      w.group.userData.doctorPathMode = "knockExit";
      w.action = "walk";
      w.actionTime = 0;
      w.pause = 0.08;
      w.readCooldown = Math.max(w.readCooldown, 5);
    };
    const occupiesAssignedLobbySeat = (w: Walker, radius = 0.92) =>
      w.seatId !== undefined &&
      w.group.position.distanceTo(seatSpots[w.seatId].pos) < radius;
    const seatExitPoint = (w: Walker) =>
      monitoredSeatExitPoint(
        w,
        Math.max(
          w.group.userData.monitorRecoveryCount || 0,
          // A called patient has priority over temporary foot traffic. The
          // selected lane still obeys furniture geometry and live per-step
          // person clearance, but the reservation itself cannot wait forever.
          w.group.userData.consultState === "inbound" ? 1 : 0,
        ),
      );
    const releaseLobbySitter = (w: Walker) => {
      poseStanding(w);
      seatExitReservations.delete(w.group.uuid);
      w.action = "walk";
      w.actionTime = 0;
      w.sitCooldown = 10 + Math.random() * 5;
      w.waypoint = (w.waypoint + 1) % w.route.length;
      w.pause = 0.06;
      w.group.userData.lastSitOrder = performance.now();
      w.group.userData.leavingSeat = true;
      w.group.userData.allowSeatAccess = true;
      delete w.group.userData.detourGoal;
      delete w.group.userData.yieldGoal;
      const exit = seatExitPoint(w);
      if (exit) w.group.userData.detourGoal = exit;
      delete w.group.userData.postScanSit;
      delete w.group.userData.rotationSit;
      delete w.group.userData.seatGoal;
      delete w.group.userData.seatApproach;
      delete w.group.userData.seatApproachTime;
      delete w.group.userData.seatApproachStallTime;
      delete w.group.userData.seatApproachBestDistance;
      delete w.group.userData.seatMotionAnchor;
      delete w.group.userData.seatNoMotion;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      delete w.group.userData.navAvoidPeople;
      w.group.userData.blockedTime = 0;
      w.group.userData.idleTime = 0;
      w.group.userData.progressAnchor = w.group.position.clone();
    };
    const finishLobbySit = (w: Walker) => {
      seatExitReservations.delete(w.group.uuid);
      w.group.position.copy(w.seatPoint || w.group.userData.seatGoal);
      delete w.group.userData.seatGoal;
      delete w.group.userData.seatApproach;
      delete w.group.userData.seatApproachTime;
      delete w.group.userData.seatApproachStallTime;
      delete w.group.userData.seatApproachBestDistance;
      delete w.group.userData.seatMotionAnchor;
      delete w.group.userData.seatNoMotion;
      delete w.group.userData.pendingSeatAfterScan;
      delete w.group.userData.seatRetryCooldown;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      w.action = "sit";
      w.actionTime = 0;
      w.group.userData.sitDuration = 6 + Math.random() * 6;
      w.group.userData.lastSitOrder = performance.now();
      w.stuck = 0;
      poseSeated(w, w.seatYaw ?? 0);
    };
    const continueWaitingCycle = (w: Walker) => {
      w.group.userData.visitPhase = "queue";
      w.group.userData.queueReady = true;
      // An uncalled patient gets one complete 6–12 second lobby-walking turn.
      // When it expires they must use a lobby QR station and take another seat.
      // A clinic call bypasses this timer through interruptPatientForCall().
      w.group.userData.queueCycleCooldown = 6 + Math.random() * 6;
      delete w.group.userData.qrGoal;
      delete w.group.userData.qrQueueGoal;
      delete w.group.userData.qrStation;
      delete w.group.userData.pendingSeatAfterScan;
      releaseLobbySitter(w);
    };
    const beginPostConsultLobbyScan = (w: Walker) => {
      // The first post-consultation phone sit is complete. Release only the
      // patient's chair, then make a public lobby QR station the next task.
      w.group.userData.visitPhase = "postLobbyScan";
      w.group.userData.hasScanned = false;
      releaseLobbySitter(w);
      delete w.group.userData.pendingSeatAfterScan;
      delete w.group.userData.qrGoal;
      delete w.group.userData.qrQueueGoal;
      delete w.group.userData.qrStation;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      w.pause = 0.04;
    };
    const interruptPatientForCall = (w: Walker) => {
      const partner = walkers.find(
        (o) => o.group.uuid === w.group.userData.talkPartner,
      );
      if (partner?.action === "socialTalk") {
        partner.action = "walk";
        partner.actionTime = 0;
        partner.pause = 0.04;
        resetUpperPose(partner);
        delete partner.group.userData.talkPartner;
        delete partner.group.userData.talkDuration;
        delete partner.group.userData.navPath;
        delete partner.group.userData.navTarget;
      }
      const wasSitting = w.action === "sit",
        ownedSeatTransit = !!(
          wasSitting ||
          w.group.userData.seatGoal ||
          w.group.userData.seatApproach ||
          w.group.userData.leavingSeat
        ),
        assignedSeat = w.seatId === undefined ? undefined : seatSpots[w.seatId],
        nearSeat =
          wasSitting ||
          (ownedSeatTransit &&
            !!assignedSeat &&
            occupiesAssignedLobbySeat(w));
      if (wasSitting) releaseLobbySitter(w);
      else {
        poseStanding(w);
        seatExitReservations.delete(w.group.uuid);
        w.action = "walk";
        w.actionTime = 0;
        w.pause = 0;
        delete w.group.userData.detourGoal;
        delete w.group.userData.leavingSeat;
        delete w.group.userData.allowSeatAccess;
        if (nearSeat) {
          w.group.userData.leavingSeat = true;
          w.group.userData.allowSeatAccess = true;
          const exit = seatExitPoint(w);
          if (exit) w.group.userData.detourGoal = exit;
        }
      }
      if (w.scanBadge) w.scanBadge.visible = false;
      delete w.group.userData.talkPartner;
      delete w.group.userData.talkDuration;
      delete w.group.userData.seatGoal;
      delete w.group.userData.seatApproach;
      delete w.group.userData.seatApproachTime;
      delete w.group.userData.seatApproachStallTime;
      delete w.group.userData.seatApproachBestDistance;
      delete w.group.userData.pendingSeatAfterScan;
      delete w.group.userData.postScanSit;
      delete w.group.userData.rotationSit;
      delete w.group.userData.qrGoal;
      delete w.group.userData.qrQueueGoal;
      delete w.group.userData.qrStation;
      delete w.group.userData.yieldGoal;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      if (w.group.userData.leavingSeat)
        delete w.group.userData.navAvoidPeople;
      else w.group.userData.navAvoidPeople = true;
      w.group.userData.calledProgressAnchor = w.group.position.clone();
      w.group.userData.calledNoProgress = 0;
      w.group.userData.calledElapsed = 0;
    };
    const rerouteStalledWalker = (w: Walker, index: number) => {
      const consultPath = w.group.userData.consultPath as
          | THREE.Vector3[]
          | undefined,
        lifecyclePath = w.group.userData.lifecyclePath as
          | THREE.Vector3[]
          | undefined,
        seatGoal = w.group.userData.seatGoal as THREE.Vector3 | undefined,
        qrGoal = w.group.userData.qrGoal as THREE.Vector3 | undefined,
        doctorPath = w.group.userData.doctorPath as THREE.Vector3[] | undefined,
        clinicStaffPath = w.group.userData.clinicStaffPath as
          | THREE.Vector3[]
          | undefined,
        pickupGoal = w.group.userData.pickupFlowLocked
          ? medicinePickupQueueGoal(w)
          : undefined,
        ordinary =
          !consultPath &&
          !lifecyclePath &&
          !seatGoal &&
          !qrGoal &&
          !doctorPath &&
          !clinicStaffPath &&
          !pickupGoal &&
          !w.group.userData.leavingSeat,
        recovery = (w.group.userData.stallRecoveries || 0) + 1;
      w.group.userData.stallRecoveries = recovery;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      delete w.group.userData.detourGoal;
      delete w.group.userData.yieldGoal;
      w.group.userData.navAvoidPeople = true;
      w.group.userData.blockedTime = 0;
      w.group.userData.idleTime = 0;
      w.group.userData.progressAnchor = w.group.position.clone();
      w.pause = 0;
      w.stuck = 0;
      if (ordinary)
        w.waypoint =
          (w.waypoint +
            1 +
            ((index + recovery) % Math.max(2, w.route.length - 1))) %
          w.route.length;
      const target =
        consultPath?.[0] ||
        lifecyclePath?.[0] ||
        doctorPath?.[0] ||
        clinicStaffPath?.[0] ||
        seatGoal ||
        qrGoal ||
        pickupGoal ||
        w.route[w.waypoint];
      if (w.group.userData.pickupFlowLocked) {
        // Post-phone pickup owns its destination. A recovery may clear and
        // rebuild navigation, but it must never insert a lobby detour.
        return;
      }
      if (w.group.userData.leavingSeat) {
        const exit = seatExitPoint(w);
        if (exit) w.group.userData.detourGoal = exit;
        return;
      }
      if (ordinary) {
        const release = chooseReleasePoint(w);
        if (release) {
          w.group.userData.yieldGoal = release;
          return;
        }
      }
      const escape = escapeStep(w, target);
      if (escape) w.group.userData.detourGoal = escape;
      else if (ordinary) {
        const release = chooseReleasePoint(w);
        if (release) w.group.userData.yieldGoal = release;
      }
    };
    const clearPatientNavigation = (w: Walker) => {
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      delete w.group.userData.detourGoal;
      delete w.group.userData.yieldGoal;
      delete w.group.userData.recoveryGoal;
      delete w.group.userData.manualRecoveryGoal;
      w.group.userData.navAvoidPeople = true;
      w.group.userData.blockedTime = 0;
      w.group.userData.idleTime = 0;
      w.group.userData.patientWindowTime = 0;
      w.group.userData.calledNoProgress = 0;
      w.group.userData.clinicNoProgress = 0;
      w.pause = 0;
      w.stuck = 0;
    };
    const restoreCounterScanRoute = (w: Walker, recovering = false) => {
      // Once check-in is complete, the desk QR scan is an owned workflow step.
      // Crowd recovery may add one local release point, but it must always keep
      // the same QR endpoint and may never fall back to the lobby roaming route.
      clearPatientNavigation(w);
      const target = counterQrApproachPoint.clone(),
        release = recovering ? escapeStep(w, target) : undefined;
      w.group.userData.counterScanPending = true;
      w.group.userData.lifecyclePath =
        release && w.group.position.distanceTo(release) > 0.12
          ? [release.clone(), target]
          : [target];
      w.group.userData.navAvoidPeople = true;
      w.action = "walk";
      w.actionTime = 0;
      w.pause = 0;
    };
    // A clear chair exit is a short, owned corridor rather than a generic lobby
    // destination.  Reserving its landing point prevents two simultaneous rises
    // (or a passing walker and a rising patient) from choosing the same spot.
    const seatExitReservations = new Map<string, THREE.Vector3>();
    // A patient must first clear the physical chair before any ordinary route can
    // take over. Each chair therefore has an outward-only release lane. This avoids
    // the former random-angle search, which sometimes selected the table side of a
    // chair and left a called patient oscillating between the seat and furniture.
    const monitoredSeatExitPoint = (w: Walker, attempt: number) => {
      const seat = w.seatId === undefined ? undefined : seatSpots[w.seatId],
        origin = w.group.position.clone(),
        outward = seat
          ? seat.release.clone().sub(seat.pos).normalize()
          : new THREE.Vector3(0, 0, -1).applyAxisAngle(
              new THREE.Vector3(0, 1, 0),
              w.seatYaw || w.group.rotation.y,
            ),
        angles = [0, 0.16, -0.16, 0.3, -0.3],
        distances = [1.46, 1.72, 2],
        last = w.group.userData.monitorLastSeatExit as
          | THREE.Vector3
          | undefined,
        candidates: { p: THREE.Vector3; score: number }[] = [];
      for (let ai = 0; ai < angles.length; ai++)
        for (const distance of distances) {
          const angle = angles[(ai + attempt) % angles.length],
            p = origin
              .clone()
              .addScaledVector(
                outward
                  .clone()
                  .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle),
                distance,
              ),
            steps = Math.ceil(distance / 0.14);
          let clear =
            boundaryClear(w, p) &&
            !blocked(p, obs, 0.34, w.seatId);
          for (let s = 1; clear && s <= steps; s++) {
            const q = origin.clone().lerp(p, s / steps);
            if (!boundaryClear(w, q) || blocked(q, obs, 0.3, w.seatId))
              clear = false;
            // Seated neighbours are necessarily close to the first part of the
            // lane.  Only the open half and its landing point must be person-free.
            if (
              clear &&
              s / steps > 0.52 &&
              !peopleClear(q, w, s === steps ? 0.72 : 0.58)
            )
              clear = false;
          }
          if (!clear) continue;
          if (
            [...seatExitReservations.entries()].some(
              ([uuid, claim]) => uuid !== w.group.uuid && claim.distanceTo(p) < 0.82,
            )
          )
            continue;
          const repeat = last && p.distanceTo(last) < 0.3 ? 0.4 : 0;
          candidates.push({
            p,
            score: Math.abs(angle) * 3 + repeat + distance * 0.04,
          });
        }
      let selected = candidates.sort((a, b) => a.score - b.score)[0]?.p;
      // A called patient must not wait forever merely because every outward
      // landing point is temporarily occupied. After one failed monitored
      // attempt, reserve the safest geometrically valid lane; live movement
      // still waits for a small human clearance before taking each step.
      if (!selected && attempt >= 1) {
        const fallbackCandidates: { p: THREE.Vector3; score: number }[] = [];
        for (const distance of distances)
          for (const angle of angles) {
            const p = origin
                .clone()
                .addScaledVector(
                  outward
                    .clone()
                    .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle),
                  distance,
                ),
              steps = Math.ceil(distance / 0.14);
            let staticClear =
              boundaryClear(w, p) && !blocked(p, obs, 0.34, w.seatId);
            for (let s = 1; staticClear && s <= steps; s++) {
              const q = origin.clone().lerp(p, s / steps);
              if (!boundaryClear(w, q) || blocked(q, obs, 0.3, w.seatId))
                staticClear = false;
            }
            if (
              !staticClear ||
              [...seatExitReservations.entries()].some(
                ([uuid, claim]) =>
                  uuid !== w.group.uuid && claim.distanceTo(p) < 0.82,
              )
            )
              continue;
            const nearbyPeople = walkers.filter(
              (o) =>
                o !== w && o.group.visible && o.group.position.distanceTo(p) < 1.1,
            ).length;
            fallbackCandidates.push({
              p,
              score: nearbyPeople * 2.2 + Math.abs(angle) * 3 + distance * 0.04,
            });
          }
        selected = fallbackCandidates.sort((a, b) => a.score - b.score)[0]?.p;
      }
      if (selected) {
        w.group.userData.monitorLastSeatExit = selected.clone();
        seatExitReservations.set(w.group.uuid, selected.clone());
      } else seatExitReservations.delete(w.group.uuid);
      return selected;
    };
    // Build an inbound route from the patient's current side of the doorway.
    // Once the patient has crossed the door centre, a recovery route must never
    // add that centre point again: doing so made the character turn around,
    // step back into the lobby, and then enter the same clinic a second time.
    const inboundClinicPathFromCurrent = (w: Walker, room: number) => {
      const door = clinicDoorPoints[room],
        depth = w.group.position
          .clone()
          .sub(door)
          .dot(clinicOuts[room]),
        centre = clinicDoorCenterPoints[room].clone(),
        inside = clinicDoorInsidePoints[room].clone(),
        chair = clinicPatientSeatApproaches[room].clone();
      if (depth < -0.34) {
        const lobbyPath = [doorOutside[room].clone(), centre, inside, chair];
        return needsRightReceptionCallMerge(w)
          ? [rightReceptionCallMerge.clone(), ...lobbyPath]
          : lobbyPath;
      }
      if (depth < 0.16) return [centre, inside, chair];
      if (depth < 1.28) return [inside, chair];
      return [chair];
    };
    const clinicNurseDoorWaitPathFromCurrent = (
      nurse: Walker,
      room: number,
    ) => {
      const depth = nurse.group.position
        .clone()
        .sub(clinicDoorPoints[room])
        .dot(clinicOuts[room]);
      if (depth > 0.54)
        return [
          clinicDoorInsidePoints[room].clone(),
          clinicDoorCenterPoints[room].clone(),
          doorOutside[room].clone(),
          clinicNurseDoorPoints[room].clone(),
        ];
      if (depth > -0.24)
        return [
          clinicDoorCenterPoints[room].clone(),
          doorOutside[room].clone(),
          clinicNurseDoorPoints[room].clone(),
        ];
      return [
        doorOutside[room].clone(),
        clinicNurseDoorPoints[room].clone(),
      ];
    };
    const rebuildInboundClinicPath = (w: Walker) => {
      const room = (w.group.userData.consultRoom || 1) - 1,
        nearSeat = occupiesAssignedLobbySeat(w);
      clearPatientNavigation(w);
      if (nearSeat) {
        w.group.userData.leavingSeat = true;
        w.group.userData.allowSeatAccess = true;
        const exit = monitoredSeatExitPoint(
          w,
          (w.group.userData.monitorRecoveryCount || 0) + 1,
        );
        if (exit) w.group.userData.detourGoal = exit;
        delete w.group.userData.navAvoidPeople;
      } else {
        delete w.group.userData.leavingSeat;
        delete w.group.userData.allowSeatAccess;
        w.group.userData.consultPath = inboundClinicPathFromCurrent(w, room);
        // A* owns the route to the lobby-side door point. Adding a second
        // escape goal here used to supersede the call route and strand the patient.
      }
      w.group.userData.calledProgressAnchor = w.group.position.clone();
      if (!nearSeat) w.group.userData.navAvoidPeople = true;
    };
    const clearCalledPatientTask = (w: Walker) => {
      delete w.group.userData.calledTaskActive;
      delete w.group.userData.calledTaskRoom;
      delete w.group.userData.calledTransitPriority;
    };
    const reassertCalledPatientTask = (
      w: Walker,
      monitor: PatientMonitor,
      t: number,
    ) => {
      const room = THREE.MathUtils.clamp(
          Number(
            w.group.userData.calledTaskRoom ||
              w.group.userData.calledScreenRoom ||
              w.group.userData.consultRoom ||
              1,
          ) - 1,
          0,
          4,
        ),
        doctor = doctors[room],
        roomNurse = clinicNurses[room];
      // Keep the original call assignment authoritative. A lobby animation,
      // stale pause, or local recovery may be discarded, but the patient number,
      // assigned room and room reservation must not change.
      w.group.userData.visitPhase = "consult";
      w.group.userData.consultRoom = room + 1;
      w.group.userData.consultState = "inbound";
      w.group.userData.calledScreenRoom = room + 1;
      w.group.userData.calledTaskActive = true;
      w.group.userData.calledTaskRoom = room + 1;
      w.group.userData.calledTransitPriority ||= ++calledTransitSequence;
      if (doctor) {
        w.group.userData.consultDoctor = doctor.group.uuid;
        doctor.group.userData.consultPatient = w.group.uuid;
        doctor.group.userData.consultQueued = true;
      }
      interruptPatientForCall(w);
      rebuildInboundClinicPath(w);
      if (roomNurse) {
        roomNurse.group.userData.roomReady = false;
        roomNurse.group.userData.servicePatient = w.group.uuid;
        const patientWaitingAtDoor = !!(
          w.group.userData.waitingForClinicNurse ||
          w.group.position.distanceTo(doorOutside[room]) < 0.62
        );
        if (
          patientWaitingAtDoor &&
          roomNurse.action === "clinicNurseDoor"
        ) {
          // A patient and nurse can otherwise form a permanent handshake
          // deadlock: the patient waits for leadIn while the nurse waits for the
          // patient to enter its one-metre trigger. Once the called-task
          // watchdog fires at the door, make the nurse lead the already-arrived
          // patient through the reserved corridor.
          roomNurse.group.userData.clinicStaffPath = [
            clinicDoorCenterPoints[room].clone(),
            clinicDoorInsidePoints[room].clone(),
            clinicNurseSeatExitPoints[room].clone(),
          ];
          roomNurse.group.userData.clinicStaffPathMode = "leadIn";
          roomNurse.speed = 1.18;
          roomNurse.action = "walk";
          roomNurse.actionTime = 0;
          roomNurse.pause = 0;
          delete roomNurse.group.userData.navPath;
          delete roomNurse.group.userData.navTarget;
        } else if (
          roomNurse.group.userData.clinicStaffPathMode !== "leadIn" &&
          roomNurse.group.userData.clinicStaffPathMode !== "followIn"
        ) {
          roomNurse.group.userData.clinicStaffPath =
            clinicNurseDoorWaitPathFromCurrent(roomNurse, room);
          roomNurse.group.userData.clinicStaffPathMode = "doorWait";
          roomNurse.speed = 1.34;
          if (roomNurse.action === "clinicNurseSit") {
            roomNurse.action = "clinicNurseRise";
            roomNurse.actionTime = 0;
          } else if (roomNurse.action !== "clinicNurseRise")
            roomNurse.action = "walk";
          roomNurse.pause = 0;
          delete roomNurse.group.userData.navPath;
          delete roomNurse.group.userData.navTarget;
        }
      }
      monitor.calledTaskTime = 0;
      monitor.calledTaskNoProgressTime = 0;
      monitor.calledTaskLastPosition.copy(w.group.position);
      monitor.lastCalledTaskRecoveryAt = t;
      w.group.userData.monitorHealth = "called-task-reasserted";
    };
    const recoverPatientFlow = (
      w: Walker,
      index: number,
      monitor: PatientMonitor,
      t: number,
    ) => {
      if (t - monitor.lastRecoveryAt < 0.38) return;
      monitor.lastRecoveryAt = t;
      monitor.recoveries++;
      monitor.noProgressTime = 0;
      monitor.invalidPositionTime = 0;
      monitor.seatExitTime = 0;
      monitor.clinicTransitTime = 0;
      w.group.userData.monitorRecoveryCount = monitor.recoveries;
      w.group.userData.monitorHealth = "recovering";
      clearPatientNavigation(w);
      if (
        w.group.userData.visitPhase === "checkin" &&
        w.group.userData.counterScanPending
      ) {
        restoreCounterScanRoute(w, true);
        return;
      }
      const nearSeat = occupiesAssignedLobbySeat(w);
      if (
        nearSeat &&
        (w.group.userData.leavingSeat ||
          w.group.userData.consultState === "inbound")
      ) {
        w.group.userData.leavingSeat = true;
        w.group.userData.allowSeatAccess = true;
        const exit = monitoredSeatExitPoint(w, monitor.recoveries);
        if (exit) w.group.userData.detourGoal = exit;
        delete w.group.userData.navAvoidPeople;
        return;
      }
      if (w.group.userData.consultState === "inbound") {
        rebuildInboundClinicPath(w);
        return;
      }
      if (
        w.group.userData.pickupFlowLocked &&
        !w.group.userData.counterClaimed &&
        !w.group.userData.pickupAtQueue
      ) {
        // Medicine pickup keeps its workflow lock, but the lock must not also
        // forbid every recovery step. Insert one nearby walkable release point,
        // then resume the same queue destination without allowing lobby roaming.
        const pickupGoal = medicinePickupQueueGoal(w),
          release = escapeStep(w, pickupGoal) || chooseReleasePoint(w);
        if (release && w.group.position.distanceTo(release) > 0.12)
          w.group.userData.lifecyclePath = [release.clone()];
        w.group.userData.navAvoidPeople = true;
        return;
      }
      if (hasExclusivePatientTransit(w)) {
        // Preserve the ordered clinic checkpoints. Recovery is allowed to
        // replan the current segment, but not to replace it with a detour goal.
        w.group.userData.navAvoidPeople = true;
        return;
      }
      if (w.group.userData.seatGoal) {
        const previousSeat = w.seatId;
        delete w.group.userData.seatGoal;
        delete w.group.userData.seatApproach;
        delete w.group.userData.seatApproachTime;
        delete w.group.userData.seatApproachStallTime;
        delete w.group.userData.seatApproachBestDistance;
        delete w.group.userData.seatMotionAnchor;
        delete w.group.userData.seatNoMotion;
        if (previousSeat !== undefined)
          w.group.userData.avoidSeatId = previousSeat;
        w.group.userData.pendingSeatAfterScan = true;
        w.group.userData.seatRetryCooldown = 0.22;
        w.group.userData.leavingSeat = true;
        w.group.userData.allowSeatAccess = true;
        const exit = monitoredSeatExitPoint(w, monitor.recoveries);
        if (exit) w.group.userData.detourGoal = exit;
        delete w.group.userData.navAvoidPeople;
        return;
      }
      if (w.group.userData.qrGoal) {
        delete w.group.userData.qrGoal;
        delete w.group.userData.qrStation;
        w.group.userData.qrQueueIndex =
          ((w.group.userData.qrQueueIndex || 0) + 1 + monitor.recoveries) %
          qrQueuePoints.length;
        w.group.userData.qrQueueGoal =
          qrQueuePoints[w.group.userData.qrQueueIndex].clone();
        return;
      }
      if (w.group.userData.qrQueueGoal) {
        w.group.userData.qrQueueIndex =
          ((w.group.userData.qrQueueIndex || 0) + 1 + monitor.recoveries) %
          qrQueuePoints.length;
        w.group.userData.qrQueueGoal =
          qrQueuePoints[w.group.userData.qrQueueIndex].clone();
        return;
      }
      if (
        w.group.userData.visitPhase === "postClinicWait" ||
        w.group.userData.visitPhase === "postWait"
      ) {
        w.group.userData.pendingSeatAfterScan = true;
        w.group.userData.seatRetryCooldown = 0.18;
        return;
      }
      if (w.group.userData.visitPhase === "queue") {
        w.group.userData.queueCycleCooldown = 0;
        delete w.group.userData.pendingSeatAfterScan;
      }
      rerouteStalledWalker(w, index);
    };
    const patientWorkflowTarget = (w: Walker) => {
      const consultPath = w.group.userData.consultPath as
          | THREE.Vector3[]
          | undefined,
        lifecyclePath = w.group.userData.lifecyclePath as
          | THREE.Vector3[]
          | undefined,
        recoveryGoal = w.group.userData.recoveryGoal as
          | THREE.Vector3
          | undefined,
        seatGoal = w.group.userData.seatGoal as THREE.Vector3 | undefined,
        qrGoal = w.group.userData.qrGoal as THREE.Vector3 | undefined,
        qrQueueGoal = w.group.userData.qrQueueGoal as
          | THREE.Vector3
          | undefined;
      return (
        recoveryGoal ||
        consultPath?.[0] ||
        lifecyclePath?.[0] ||
        (w.group.userData.pickupFlowLocked
          ? medicinePickupQueueGoal(w)
          : undefined) ||
        seatGoal ||
        qrGoal ||
        qrQueueGoal ||
        w.route[w.waypoint]
      );
    };
    const forcePatientGoalReplan = (w: Walker) => {
      // Crowd separation may move the body, but it never owns or rewrites the
      // workflow destination. Clear only transient collision state and rebuild a
      // path toward the same consultation, scan, seat, pickup or departure goal.
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      delete w.group.userData.blockRecoveryPause;
      delete w.group.userData.avoidanceSide;
      delete w.group.userData.avoidanceSideUntil;
      w.group.userData.blockedTime = 0;
      w.group.userData.navReplanCooldown = 0;
      w.group.userData.navAvoidPeople = true;
      w.pause = 0;
      if (
        !w.group.userData.leavingSeat &&
        !w.group.userData.pickupSeatExit &&
        !w.group.userData.recoveryGoal
      ) {
        delete w.group.userData.detourGoal;
        delete w.group.userData.yieldGoal;
      }
    };
    const assignPatientRecoveryGoal = (w: Walker) => {
      const originalGoal = patientWorkflowTarget(w),
        insideDedicatedDoor = inAssignedDoorPortal(w, w.group.position),
        insideAutomaticDoor = !!(
          w.group.userData.revolvingDoorTransit &&
          inAutomaticDoorTransitLane(w, w.group.position)
        );
      if (!originalGoal || insideDedicatedDoor || insideAutomaticDoor) return false;
      const safeGround =
        escapeStep(w, originalGoal) || chooseReleasePoint(w);
      if (!safeGround || w.group.position.distanceTo(safeGround) < 0.12)
        return false;
      // recoveryGoal has its own route precedence and is removed on arrival. The
      // original workflow arrays and dedicated endpoints remain untouched beneath
      // it, so the patient resumes the exact task after reaching safe open ground.
      w.group.userData.recoveryGoal = safeGround.clone();
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      delete w.group.userData.blockRecoveryPause;
      delete w.group.userData.avoidanceSide;
      delete w.group.userData.avoidanceSideUntil;
      w.group.userData.blockedTime = 0;
      w.group.userData.navReplanCooldown = 0;
      w.group.userData.navAvoidPeople = true;
      w.pause = 0;
      return true;
    };
    const monitorPatientFlow = (
      w: Walker,
      index: number,
      dt: number,
      t: number,
    ) => {
      if (!w.group.visible || !w.group.userData.activePatient) {
        detachPatientMonitor(w);
        return;
      }
      let monitor = patientMonitors.get(w.group.uuid);
      if (!monitor) {
        attachPatientMonitor(w);
        monitor = patientMonitors.get(w.group.uuid)!;
      }
      const stateKey = patientStateKey(w),
        step = patientFlowStep(w);
      if (stateKey !== monitor.stateKey) {
        // A real workflow transition invalidates any old temporary escape point.
        // The transition's own dedicated target takes control immediately.
        delete w.group.userData.recoveryGoal;
        delete w.group.userData.manualRecoveryGoal;
        delete w.group.userData.crowdStallReplanIssued;
        delete w.group.userData.crowdStallEscapeIssued;
        monitor.stateKey = stateKey;
        monitor.stateAge = 0;
        monitor.noProgressTime = 0;
        monitor.lastPosition.copy(w.group.position);
      } else monitor.stateAge += dt;
      monitor.flowStep = step;
      monitor.patientNo = String(w.group.userData.queueNumber || "--");
      w.group.userData.monitorFlowStep = step;
      const phase = w.group.userData.visitPhase;
      const calledTaskActive = !!w.group.userData.calledTaskActive,
        calledTaskArrived =
          w.action === "clinicChairSit" ||
          w.action === "consultSit" ||
          w.action === "postExamTalk" ||
          w.action === "postScanTalk" ||
          w.action === "clinicScan" ||
          w.action === "bedSit" ||
          w.action === "examBed" ||
          w.action === "bedExit";
      if (calledTaskActive && calledTaskArrived) {
        clearCalledPatientTask(w);
        monitor.calledTaskTime = 0;
        monitor.calledTaskNoProgressTime = 0;
        monitor.calledTaskLastPosition.copy(w.group.position);
      } else if (calledTaskActive) {
        const calledPath = w.group.userData.consultPath as
            | THREE.Vector3[]
            | undefined,
          calledTaskStateLost =
            phase !== "consult" ||
            w.action !== "walk" ||
            w.group.userData.consultState !== "inbound" ||
            !calledPath?.length,
          calledMoved = w.group.position.distanceTo(
            monitor.calledTaskLastPosition,
          ),
          intentionallyWaitingAtClinicDoor = !!(
            w.group.userData.waitingForClinicNurse &&
            Number(w.group.userData.clinicNurseWaitTime || 0) < 2.2 &&
            w.group.position.distanceTo(
              doorOutside[
                THREE.MathUtils.clamp(
                  Number(w.group.userData.calledTaskRoom || 1) - 1,
                  0,
                  4,
                )
              ],
            ) < 0.52
          );
        monitor.calledTaskTime += dt;
        if (calledMoved > 0.055) {
          monitor.calledTaskLastPosition.copy(w.group.position);
          monitor.calledTaskNoProgressTime = 0;
        } else if (!intentionallyWaitingAtClinicDoor)
          monitor.calledTaskNoProgressTime += dt;
        else {
          monitor.calledTaskLastPosition.copy(w.group.position);
          monitor.calledTaskNoProgressTime = 0;
        }
        if (
          t - monitor.lastCalledTaskRecoveryAt > 0.8 &&
          ((calledTaskStateLost && monitor.calledTaskTime > 0.45) ||
            monitor.calledTaskNoProgressTime > 1.45)
        ) {
          reassertCalledPatientTask(w, monitor, t);
          return;
        }
      } else {
        monitor.calledTaskTime = 0;
        monitor.calledTaskNoProgressTime = 0;
        monitor.calledTaskLastPosition.copy(w.group.position);
      }
      // Patient poses that depend on a staff member used to be allowed to wait
      // forever. Repair the missing staff transition while keeping the patient
      // in place, then let the normal visible staff walk finish the workflow.
      if (w.action === "consultSit" && monitor.stateAge > 8.5) {
        const room = THREE.MathUtils.clamp(
            Number(w.group.userData.consultRoom || 1) - 1,
            0,
            4,
          ),
          roomNurse = clinicNurses[room],
          nurseReady = !!(
            roomNurse?.action === "clinicNurseSit" &&
            roomNurse.group.userData.servicePatient === w.group.uuid
          );
        if (roomNurse && !nurseReady) {
          const nurseDepth = roomNurse.group.position
            .clone()
            .sub(clinicDoorPoints[room])
            .dot(clinicOuts[room]);
          roomNurse.group.userData.roomReady = false;
          roomNurse.group.userData.servicePatient = w.group.uuid;
          roomNurse.group.userData.clinicStaffPath = [
            ...(nurseDepth < -0.18
              ? [
                  clinicDoorCenterPoints[room].clone(),
                  clinicDoorInsidePoints[room].clone(),
                ]
              : nurseDepth < 0.7
                ? [clinicDoorInsidePoints[room].clone()]
                : []),
            clinicNurseSeatExitPoints[room].clone(),
          ];
          roomNurse.group.userData.clinicStaffPathMode = "followIn";
          roomNurse.speed = 1.18;
          poseStanding(roomNurse);
          roomNurse.action = "walk";
          roomNurse.actionTime = 0;
          roomNurse.pause = 0;
          delete roomNurse.group.userData.navPath;
          delete roomNurse.group.userData.navTarget;
          monitor.stateAge = 0;
          monitor.lastRecoveryAt = t;
          w.group.userData.monitorHealth = "clinic-nurse-reasserted";
        }
      }
      if (w.action === "postExamTalk" && monitor.stateAge > 6.5) {
        const room = THREE.MathUtils.clamp(
            Number(w.group.userData.consultRoom || 1) - 1,
            0,
            4,
          ),
          doctor = doctors[room];
        if (doctor && doctor.action !== "clinicSit") {
          poseStanding(doctor);
          doctor.group.userData.doctorPath = [
            clinicDoctorRetreatPoints[room].clone(),
            clinicDoctorSeats[room].clone(),
          ];
          doctor.group.userData.doctorPathMode = "return";
          doctor.action = "walk";
          doctor.actionTime = 0;
          doctor.pause = 0;
          delete doctor.group.userData.navPath;
          delete doctor.group.userData.navTarget;
          monitor.stateAge = 0;
          monitor.lastRecoveryAt = t;
          w.group.userData.monitorHealth = "clinic-doctor-reasserted";
        }
      }
      const liveCounterQueuePosition = counterQueuePosition(w);
      if (
        w.group.userData.counterQueueWaiting &&
        (liveCounterQueuePosition <= 0 ||
          w.group.position.distanceTo(counterQueueHoldingGoal(w)) > 0.44)
      ) {
        // A waiting flag is valid only while the patient is physically standing
        // on their current queue mark. Stale flags used to mask real no-motion
        // failures and could remain from the first rendered frame.
        delete w.group.userData.counterQueueWaiting;
        w.pause = 0;
      }
      if (
        w.group.userData.revolvingDoorWaiting &&
        !w.group.userData.revolvingDoorMode
      ) {
        delete w.group.userData.revolvingDoorWaiting;
        w.pause = 0;
      }
      if (
        phase === "leaving" &&
        w.group.visible &&
        (!w.group.userData.lifecyclePath ||
          !w.group.userData.departureLocked ||
          w.action !== "walk")
      ) {
        // Departure is a locked terminal workflow. If any local recovery ever
        // clears its route, rebuild the exit path immediately instead of
        // allowing the patient to fall back to the ordinary lobby loop.
        beginPatientDeparture(w, index);
        return;
      }
      if (
        phase === "checkin" &&
        w.action === "walk" &&
        w.group.userData.counterScanPending &&
        !w.group.userData.consultPath
      ) {
        const scanPath = w.group.userData.lifecyclePath as
            | THREE.Vector3[]
            | undefined,
          stillOwnsQrTarget = !!scanPath?.some(
            (point) => point.distanceTo(counterQrApproachPoint) < 0.08,
          );
        if (
          w.group.position.distanceTo(counterQrApproachPoint) > 0.14 &&
          !stillOwnsQrTarget
        )
          restoreCounterScanRoute(w);
      }
      if (w.group.userData.consultState !== "inbound") {
        delete w.group.userData.waitingForClinicNurse;
        delete w.group.userData.clinicNurseWaitTime;
        delete w.group.userData.lastClinicNurseNudge;
      }
      // A counter claim is a workflow lock. If its path was cleared by a local
      // avoidance recovery, rebuild the exact counter/QR route immediately
      // instead of considering an aimlessly moving patient "healthy" forever.
      if (
        w.action === "walk" &&
        (phase === "checkin" || phase === "pickupQueue") &&
        w.group.userData.counterClaimed &&
        !w.group.userData.lifecyclePath &&
        !w.group.userData.consultPath
      ) {
        const target = w.group.userData.counterScanPending
          ? counterQrApproachPoint
          : counterPublicPoint;
        if (w.group.position.distanceTo(target) > 0.3) {
          w.group.userData.lifecyclePath = [target.clone()];
          w.group.userData.navAvoidPeople = true;
          delete w.group.userData.navPath;
          delete w.group.userData.navTarget;
          delete w.group.userData.detourGoal;
          delete w.group.userData.yieldGoal;
          w.pause = 0;
        }
      }
      if (
        w.group.userData.counterClaimed &&
        phase !== "checkin" &&
        phase !== "pickupQueue" &&
        phase !== "pickup" &&
        w.action !== "counterTalk" &&
        w.action !== "counterScan" &&
        w.action !== "medicinePickup"
      )
        delete w.group.userData.counterClaimed;
      // Unknown phases are never allowed to degrade into a permanent roaming
      // loop. Reattach the existing character to the first patient step without
      // teleporting it or replacing its visit identity.
      if (step < 0 && w.action === "walk") {
        w.group.userData.visitPhase = "checkin";
        w.group.userData.counterDone = false;
        w.group.userData.hasScanned = false;
        w.group.userData.queueNumber ||= nextPatientNumber();
        delete w.group.userData.consultPath;
        delete w.group.userData.consultState;
        delete w.group.userData.consultDoctor;
        delete w.group.userData.counterClaimed;
        delete w.group.userData.lifecyclePath;
        delete w.group.userData.navPath;
        delete w.group.userData.navTarget;
        w.pause = 0;
      }
      const revolvingDoorTransitActive = !!(
          w.group.userData.revolvingDoorTransit &&
          w.group.userData.revolvingDoorMode
        ),
        intentionallyWaitingForRevolvingDoor = !!(
          w.group.userData.revolvingDoorWaiting &&
          w.group.userData.revolvingDoorMode
        ),
        moved = w.group.position.distanceTo(monitor.lastPosition),
        activeClinicDoorWait = !!(
          w.group.userData.waitingForClinicNurse &&
          Number(w.group.userData.clinicNurseWaitTime || 0) < 2.2
        ),
        expectedMovement =
          w.action === "walk" &&
          !activeClinicDoorWait &&
          !w.group.userData.counterQueueWaiting &&
          !intentionallyWaitingForRevolvingDoor &&
          !w.group.userData.streetFollowing &&
          !w.group.userData.revolvingDoorFollowing,
        nearbyMovingConflict = walkers.some(
          (o) =>
            o !== w &&
            o.group.visible &&
            o.action === "walk" &&
            o.group.position.distanceTo(w.group.position) < 0.72,
        );
      if (moved > 0.055) {
        monitor.lastPosition.copy(w.group.position);
        monitor.noProgressTime = 0;
        monitor.lastHealthyAt = t;
        w.group.userData.monitorHealth = "healthy";
        delete w.group.userData.crowdStallReplanIssued;
        delete w.group.userData.crowdStallEscapeIssued;
        if (monitor.recoveries > 0 && t - monitor.lastRecoveryAt > 2.4)
          monitor.recoveries--;
      } else if (expectedMovement) monitor.noProgressTime += dt;
      else {
        monitor.lastPosition.copy(w.group.position);
        monitor.noProgressTime = 0;
        w.group.userData.monitorHealth = "expected-stop";
      }
      const invalidPosition =
        expectedMovement &&
        !revolvingDoorTransitActive &&
        !inAssignedDoorPortal(w, w.group.position) &&
        (!boundaryClear(w, w.group.position) ||
          navBlocked(w, w.group.position, 0.29, seatObstacleAccess(w)));
      monitor.invalidPositionTime = invalidPosition
        ? monitor.invalidPositionTime + dt
        : 0;
      monitor.seatExitTime = w.group.userData.leavingSeat
        ? monitor.seatExitTime + dt
        : 0;
      monitor.clinicTransitTime =
        w.group.userData.consultState === "inbound" &&
        w.group.userData.consultPath
          ? monitor.clinicTransitTime + dt
          : 0;
      const noSeatTask =
        w.action === "walk" &&
        !w.group.userData.consultPath &&
        !w.group.userData.seatGoal &&
        !w.group.userData.pendingSeatAfterScan &&
        !w.group.userData.leavingSeat;
      if (
        (w.group.userData.visitPhase === "postClinicWait" ||
          w.group.userData.visitPhase === "postWait") &&
        noSeatTask
      ) {
        w.group.userData.pendingSeatAfterScan = true;
        w.group.userData.seatRetryCooldown = 0;
      }
      if (
        w.action === "sit" &&
        !["queue", "postClinicWait", "postWait"].includes(
          w.group.userData.visitPhase,
        ) &&
        monitor.stateAge > 0.45
      ) {
        releaseLobbySitter(w);
        return;
      }
      if (
        w.group.userData.visitPhase === "consult" &&
        w.action === "walk" &&
        !w.group.userData.consultPath &&
        monitor.stateAge > 0.55
      ) {
        rebuildInboundClinicPath(w);
        return;
      }
      if (monitor.invalidPositionTime > 0.22) {
        recoverPatientFlow(w, index, monitor, t);
        return;
      }
      if (monitor.seatExitTime > 0.85 && monitor.noProgressTime > 0.62) {
        recoverPatientFlow(w, index, monitor, t);
        return;
      }
      if (monitor.clinicTransitTime > 0.9 && monitor.noProgressTime > 0.72) {
        recoverPatientFlow(w, index, monitor, t);
        return;
      }
      if (
        expectedMovement &&
        !revolvingDoorTransitActive &&
        monitor.noProgressTime > 3 &&
        !w.group.userData.crowdStallReplanIssued
      ) {
        forcePatientGoalReplan(w);
        w.group.userData.crowdStallReplanIssued = true;
        w.group.userData.monitorHealth = nearbyMovingConflict
          ? "crowd-stall-replanned"
          : "stall-replanned";
      }
      if (
        expectedMovement &&
        !revolvingDoorTransitActive &&
        monitor.noProgressTime > 6 &&
        !w.group.userData.crowdStallEscapeIssued
      ) {
        if (assignPatientRecoveryGoal(w)) {
          w.group.userData.crowdStallEscapeIssued = true;
          w.group.userData.monitorHealth = "safe-ground-recovery";
          monitor.lastPosition.copy(w.group.position);
          monitor.noProgressTime = 0;
        } else {
          // Door corridors preserve their ordered checkpoints; if no separate
          // ground node is legal, reassert that same workflow instead.
          recoverPatientFlow(w, index, monitor, t);
        }
        return;
      }
      if (w.action === "sit" && w.actionTime > 12.15) {
        if (w.group.userData.visitPhase === "queue") continueWaitingCycle(w);
        else if (w.group.userData.visitPhase === "postClinicWait")
          beginPostConsultLobbyScan(w);
        else if (w.group.userData.visitPhase === "postWait")
          beginMedicinePickup(w, index);
      }
    };
    const lobbyPatientCount = () =>
      patients.filter(
        (p) =>
          p.group.visible &&
          p.group.userData.activePatient &&
          p.group.userData.visitPhase !== "leaving" &&
          insideLobby(p.group.position, 0.12),
      ).length;
    const hospitalPatientCount = () =>
      patients.filter(
        (p) =>
          p.group.visible &&
          p.group.userData.activePatient &&
          (insideLobby(p.group.position, 0.12) ||
            (p.group.userData.visitPhase !== "entering" &&
              p.group.userData.visitPhase !== "leaving")),
      ).length;
    // Admission capacity counts everyone still entering or receiving care, but
    // not visitors who have begun the independent full-street departure. This
    // keeps twelve care-side patients flowing while departures remain visible.
    const admissionPatientCount = () =>
      patients.filter(
        (p) =>
          p.group.visible &&
          p.group.userData.activePatient &&
          p.group.userData.visitPhase !== "leaving",
      ).length;
    const medicinePickupPoint = counterPublicPoint.clone();
    const removeRevolvingDoorEntryWaiter = (uuid: string) => {
      const queueIndex = revolvingDoorEntryWaiters.indexOf(uuid);
      if (queueIndex >= 0) revolvingDoorEntryWaiters.splice(queueIndex, 1);
    };
    const revolvingDoorEntryHoldingTarget = (w: Walker) => {
      const queueIndex = revolvingDoorEntryWaiters.indexOf(w.group.uuid);
      if (queueIndex < 0) return revolvingDoorEntryQueue;
      return revolvingDoorEntryHoldingPoints[
        Math.min(queueIndex, revolvingDoorEntryHoldingPoints.length - 1)
      ];
    };
    const removeRevolvingDoorExitWaiter = (uuid: string) => {
      const queueIndex = revolvingDoorExitWaiters.indexOf(uuid);
      if (queueIndex >= 0) revolvingDoorExitWaiters.splice(queueIndex, 1);
    };
    const revolvingDoorExitHoldingTarget = (w: Walker) => {
      const queueIndex = revolvingDoorExitWaiters.indexOf(w.group.uuid);
      if (queueIndex < 0) return revolvingDoorExitQueue;
      return revolvingDoorExitHoldingPoints[
        Math.min(queueIndex, revolvingDoorExitHoldingPoints.length - 1)
      ];
    };
    // Incoming patients begin just beyond the rendered right edge and walk the
    // complete sidewalk before joining the right-hand entrance queue. Keeping
    // these points on the inner side of the pavement also leaves the street trees
    // outside their route and prevents a new visitor from appearing beside the
    // automatic door.
    const arrivalStreetPath = () => [
      new THREE.Vector3(15.35, 0, 9.55),
      new THREE.Vector3(13.35, 0, 9.55),
      new THREE.Vector3(11.35, 0, 9.55),
      new THREE.Vector3(9.35, 0, 9.55),
      new THREE.Vector3(7.35, 0, 9.55),
      new THREE.Vector3(5.35, 0, 9.55),
      new THREE.Vector3(3.35, 0, 9.55),
      ...revolvingDoorEntryPath.map((point) => point.clone()),
    ];
    // After clearing the revolving door, every departing patient remains visible
    // for the complete leftward sidewalk journey. The final point sits just past
    // the rendered street edge, so the model disappears only after walking the
    // full streetscape instead of popping out beside the entrance.
    const departureStreetPath = () => [
      new THREE.Vector3(-2.45, 0, 9.24),
      new THREE.Vector3(-5.35, 0, 9.34),
      new THREE.Vector3(-8.15, 0, 9.44),
      new THREE.Vector3(-10.95, 0, 9.38),
      new THREE.Vector3(-13.7, 0, 9.28),
      new THREE.Vector3(-16.4, 0, 9.22),
    ];
    // Reaching this off-screen edge is sufficient to finish departure. Waiting
    // for the exact final waypoint let same-direction following rules form an
    // unnecessary queue at the end of the street.
    const streetDepartureRecycleX = -15.72;
    const remainingDeparturePath = (w: Walker, _index: number) => {
      const streetPath = departureStreetPath(),
        alreadyOnStreet = w.group.position.z >= 8.84 && w.group.position.x < -0.35,
        insideOrBeyondDoor =
          w.group.position.z > 4.52 ||
          w.group.position.distanceTo(revolvingDoorCenter) < 2.25;
      if (alreadyOnStreet) {
        const remainingStreet = streetPath.filter(
          (point) => point.x < w.group.position.x - 0.16,
        );
        return remainingStreet.length
          ? remainingStreet
          : [streetPath[streetPath.length - 1].clone()];
      }
      if (!insideOrBeyondDoor)
        return [
          ...revolvingDoorExitPath.map((point) => point.clone()),
          ...streetPath,
        ];
      // A repaired departure must continue forward from the patient's current
      // point. Rebuilding the full path here used to turn an occupant around and
      // send them back toward the lobby-side entrance of the drum.
      const forwardIndex = revolvingDoorExitPath.findIndex(
          (point, pathIndex) =>
            pathIndex > 0 && point.z > w.group.position.z + 0.08,
        ),
        remaining =
          forwardIndex >= 0
            ? revolvingDoorExitPath.slice(forwardIndex)
            : [revolvingDoorExitPath[revolvingDoorExitPath.length - 1]];
      return [
        ...remaining
          .filter((point) => w.group.position.distanceTo(point) > 0.16)
          .map((point) => point.clone()),
        ...streetPath,
      ];
    };
    const beginMedicinePickup = (w: Walker, _index: number) => {
      let pickupSeatExit: THREE.Vector3 | undefined;
      if (w.action === "sit") {
        releaseLobbySitter(w);
        pickupSeatExit = (
          w.group.userData.detourGoal as THREE.Vector3 | undefined
        )?.clone();
      } else {
        poseStanding(w);
        w.action = "walk";
        w.actionTime = 0;
      }
      w.group.userData.visitPhase = "pickupQueue";
      w.group.userData.pickupFlowLocked = true;
      // Pickup now shares the canonical reception queue. The removed legacy
      // pickup-array reference threw as each patient finished the second lobby
      // wait, leaving more standing patients in a half-entered state over time.
      w.group.userData.navAvoidPeople = true;
      w.pause = 0;
      if (
        pickupSeatExit &&
        w.group.position.distanceTo(pickupSeatExit) > 0.16
      ) {
        w.group.userData.lifecyclePath = [pickupSeatExit];
        w.group.userData.pickupSeatExit = true;
        w.group.userData.allowSeatAccess = true;
      } else {
        seatExitReservations.delete(w.group.uuid);
        delete w.group.userData.lifecyclePath;
        delete w.group.userData.pickupSeatExit;
        delete w.group.userData.allowSeatAccess;
      }
      delete w.group.userData.counterClaimed;
      delete w.group.userData.pendingSeatAfterScan;
      delete w.group.userData.postScanSit;
      delete w.group.userData.rotationSit;
      delete w.group.userData.queueReady;
      delete w.group.userData.pickupAtQueue;
      delete w.group.userData.leavingSeat;
      delete w.group.userData.detourGoal;
      delete w.group.userData.yieldGoal;
      delete w.group.userData.seatGoal;
      delete w.group.userData.seatApproach;
      delete w.group.userData.qrGoal;
      delete w.group.userData.qrQueueGoal;
      delete w.group.userData.qrStation;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
    };
    const beginPatientDeparture = (w: Walker, index: number) => {
      if (paymentKioskOwner === w.group.uuid) paymentKioskOwner = null;
      seatExitReservations.delete(w.group.uuid);
      const leavingMedicineCounter = w.action === "medicinePickup";
      // Release reception as one atomic step before the departing patient is
      // given any exit route. Waiting until the next frame's queue cleanup left
      // the completed pickup as the active guest, so the visible second patient
      // could never inherit the service lane after a recovery/re-sort.
      releaseCounterService(w);
      const existingPath = w.group.userData.lifecyclePath as
          | THREE.Vector3[]
          | undefined,
        wasDoorTransit = !!(
          w.group.userData.revolvingDoorMode === "exit" &&
          w.group.userData.revolvingDoorTransit &&
          w.group.position.distanceTo(revolvingDoorCenter) < 3.05
        ),
        preserveExistingDoorPath = !!(
          wasDoorTransit && existingPath?.length
        ),
        baseDeparturePath = preserveExistingDoorPath
          ? existingPath!.map((point) => point.clone())
          : remainingDeparturePath(w, index),
        departurePath = leavingMedicineCounter
          ? [medicineDepartureTurnPoint.clone(), ...baseDeparturePath]
          : baseDeparturePath,
        needsDoorAdmission =
          !wasDoorTransit &&
          baseDeparturePath[0]?.distanceTo(revolvingDoorExitQueue) < 0.08;
      if (w.action === "sit") releaseLobbySitter(w);
      else {
        poseStanding(w);
        w.action = "walk";
        w.actionTime = 0;
        w.pause = 0;
      }
      w.group.userData.visitPhase = "leaving";
      clearCalledPatientTask(w);
      w.group.userData.departureLocked = true;
      w.group.userData.lifecyclePath = departurePath;
      w.group.userData.revolvingDoorMode = "exit";
      w.group.userData.revolvingDoorTransit = wasDoorTransit;
      if (wasDoorTransit) {
        removeRevolvingDoorExitWaiter(w.group.uuid);
      } else if (
        needsDoorAdmission &&
        !revolvingDoorExitWaiters.includes(w.group.uuid)
      )
        revolvingDoorExitWaiters.push(w.group.uuid);
      else if (!needsDoorAdmission)
        removeRevolvingDoorExitWaiter(w.group.uuid);
      w.group.userData.navAvoidPeople = true;
      w.sitCooldown = 20;
      delete w.group.userData.counterClaimed;
      delete w.group.userData.counterScanPending;
      delete w.group.userData.pendingSeatAfterScan;
      delete w.group.userData.postScanSit;
      delete w.group.userData.queueReady;
      delete w.group.userData.pickupFlowLocked;
      delete w.group.userData.pickupSeatExit;
      delete w.group.userData.pickupQueueIndex;
      delete w.group.userData.pickupAtQueue;
      delete w.group.userData.consultPath;
      delete w.group.userData.consultState;
      delete w.group.userData.consultDoctor;
      delete w.group.userData.examCareComplete;
      delete w.group.userData.postExamSeat;
      delete w.group.userData.detourGoal;
      delete w.group.userData.yieldGoal;
      delete w.group.userData.seatGoal;
      delete w.group.userData.seatApproach;
      delete w.group.userData.leavingSeat;
      delete w.group.userData.allowSeatAccess;
      delete w.group.userData.qrGoal;
      delete w.group.userData.qrQueueGoal;
      delete w.group.userData.qrStation;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      delete w.group.userData.revolvingDoorWaiting;
    };
    const completePatientDeparture = (w: Walker) => {
      if (focusedPatient === w) clearFocusedPatient();
      removeRevolvingDoorExitWaiter(w.group.uuid);
      detachPatientMonitor(w);
      resetUpperPose(w);
      if (w.medicineBag) w.medicineBag.visible = false;
      w.group.userData.activePatient = false;
      w.group.userData.respawnTimer = 0.16 + Math.random() * 0.22;
      delete w.group.userData.departureLocked;
      delete w.group.userData.lifecyclePath;
      delete w.group.userData.revolvingDoorBaseSpeed;
      delete w.group.userData.revolvingDoorTransitStartedAt;
      delete w.group.userData.revolvingDoorProgressAnchor;
      delete w.group.userData.revolvingDoorNoProgress;
      delete w.group.userData.revolvingDoorWaiting;
      delete w.group.userData.revolvingDoorTransit;
      delete w.group.userData.revolvingDoorMode;
      delete w.group.userData.streetDepartureMode;
      delete w.group.userData.streetFollowing;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      delete w.group.userData.detourGoal;
      delete w.group.userData.yieldGoal;
      w.group.visible = false;
      w.action = "walk";
      w.actionTime = 0;
      w.pause = 0;
    };
    const spawnNewPatient = (w: Walker, index: number) => {
      if (paymentKioskOwner === w.group.uuid) paymentKioskOwner = null;
      removeRevolvingDoorEntryWaiter(w.group.uuid);
      removeRevolvingDoorExitWaiter(w.group.uuid);
      seatExitReservations.delete(w.group.uuid);
      const tailArrivalCount = patients.filter(
          (patient) =>
            patient !== w &&
            patient.group.visible &&
            patient.group.userData.activePatient &&
            patient.group.userData.visitPhase === "entering" &&
            patient.group.position.x > 14.8,
        ).length,
        streetX =
          16.4 + Math.min(tailArrivalCount, 5) * 0.92 + Math.random() * 0.18,
        freshColor =
          patientColors[
            (index +
              1 +
              Math.floor(Math.random() * (patientColors.length - 1))) %
              patientColors.length
          ];
      poseStanding(w);
      if (w.medicineBag) w.medicineBag.visible = false;
      w.group.traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData.uniformPart)
          (o.material as THREE.MeshStandardMaterial).color.setHex(freshColor);
      });
      w.group.visible = true;
      w.group.userData.activePatient = true;
      w.group.userData.visitPhase = "entering";
      clearCalledPatientTask(w);
      w.group.userData.queueNumber = nextPatientNumber();
      w.group.userData.counterDone = false;
      w.group.userData.hasScanned = false;
      w.group.userData.consultRoom = 1 + Math.floor(Math.random() * 5);
      w.group.userData.consultCooldown = 4 + Math.random() * 5;
      w.group.userData.scanCooldown = 0.8 + Math.random() * 2;
      w.group.userData.counterRescanCooldown = 12 + Math.random() * 5;
      w.group.position.set(streetX, 0, 9.55);
      w.group.userData.lifecyclePath = arrivalStreetPath();
      w.group.userData.revolvingDoorMode = "entry";
      w.group.userData.revolvingDoorTransit = false;
      w.speed = Number(w.group.userData.patientBaseSpeed || 0.72);
      revolvingDoorEntryWaiters.push(w.group.uuid);
      w.action = "walk";
      w.actionTime = 0;
      w.pause = 0;
      w.waypoint = (index * 3 + 1) % w.route.length;
      delete w.group.userData.consultPath;
      delete w.group.userData.consultState;
      delete w.group.userData.consultDoctor;
      delete w.group.userData.examCareComplete;
      delete w.group.userData.postExamSeat;
      delete w.group.userData.clinicExitOrigin;
      delete w.group.userData.counterClaimed;
      delete w.group.userData.counterScanPending;
      delete w.group.userData.counterQueueOrder;
      delete w.group.userData.counterQueueIndex;
      delete w.group.userData.counterQueueWaiting;
      delete w.group.userData.seatGoal;
      delete w.group.userData.seatApproach;
      delete w.group.userData.pendingSeatAfterScan;
      delete w.group.userData.postScanSit;
      delete w.group.userData.qrGoal;
      delete w.group.userData.qrQueueGoal;
      delete w.group.userData.qrStation;
      delete w.group.userData.queueReady;
      delete w.group.userData.pickupFlowLocked;
      delete w.group.userData.pickupSeatExit;
      delete w.group.userData.pickupQueueIndex;
      delete w.group.userData.pickupAtQueue;
      delete w.group.userData.navPath;
      delete w.group.userData.navTarget;
      delete w.group.userData.detourGoal;
      delete w.group.userData.yieldGoal;
      delete w.group.userData.revolvingDoorWaiting;
      delete w.group.userData.revolvingDoorProgressAnchor;
      delete w.group.userData.revolvingDoorNoProgress;
      delete w.group.userData.streetDepartureMode;
      delete w.group.userData.streetFollowing;
      w.group.userData.progressAnchor = w.group.position.clone();
      w.group.userData.navAvoidPeople = true;
      attachPatientMonitor(w);
    };
    const initialSeatIds = [0, 1, 6, 7, 10, 15],
      initialSitterCount = 5 + Math.floor(Math.random() * 2),
      initialSitters = [...patients]
        .filter((p) => p.group.userData.activePatient)
        .sort(() => Math.random() - 0.5)
        .slice(0, initialSitterCount);
    initialSitters.forEach((p, index) => {
      const id = initialSeatIds[index];
      p.seatId = id;
      p.seatPoint = seatSpots[id].pos.clone();
      p.seatYaw = seatSpots[id].yaw;
      p.group.position.copy(p.seatPoint);
      p.action = "sit";
      p.actionTime = 0;
      p.group.userData.visitPhase = "queue";
      p.group.userData.counterDone = true;
      p.group.userData.hasScanned = true;
      p.group.userData.consultCooldown = 0.6 + Math.random() * 2.6;
      p.group.userData.postScanSit = true;
      p.group.userData.sitDuration = 6 + Math.random() * 6;
      p.group.userData.lastSitOrder = index;
      poseSeated(p, p.seatYaw);
    });
    patients
      .filter(
        (p) =>
          p.group.userData.activePatient && !initialSitters.includes(p),
      )
      .slice(0, 2)
      .forEach((p, index) => spawnNewPatient(p, index + patients.indexOf(p)));
    patients
      .filter(
        (p) =>
          p.group.userData.activePatient && !patientMonitors.has(p.group.uuid),
      )
      .forEach(attachPatientMonitor);
    const floorOneWalkerVisibility = new Map<string, boolean>();
    const applyFloor = (floorNumber: 1 | 2 | 3) => {
      // From 3F, retain the 2F architectural layer while replacing its open
      // clinical sets with closed ceilings and sealed doorway backstops.
      secondFloor.visible = floorNumber >= 2;
      thirdFloor.visible = floorNumber === 3;
      secondFloorPrivacyShell.visible = floorNumber === 3;
      secondFloorInteriorObjects.forEach((object) => {
        object.visible = floorNumber === 2;
      });
      // The lower clinic rooms are open dollhouse sets on 1F. Hide every
      // interior object while upstairs so no camera angle can reveal them
      // through or above the continuous lower envelope.
      floorOneClinicInteriorObjects.forEach((object) => {
        object.visible = floorNumber === 1;
      });
      upperClinicalActors.forEach(({ walker }) => {
        walker.group.visible = floorNumber === 2;
      });
      upperFamilyActors.forEach(({ walker }) => {
        walker.group.visible = floorNumber === 2;
      });
      if (floorNumber !== 1) {
        walkers.forEach((walker) => {
          if (!floorOneWalkerVisibility.has(walker.group.uuid))
            floorOneWalkerVisibility.set(
              walker.group.uuid,
              walker.group.visible,
            );
          walker.group.visible = false;
        });
        clearFocusedPatient();
      } else {
        walkers.forEach((walker) => {
          const previousVisibility = floorOneWalkerVisibility.get(
            walker.group.uuid,
          );
          if (previousVisibility !== undefined)
            walker.group.visible = previousVisibility;
        });
        floorOneWalkerVisibility.clear();
      }
    };
    applyFloorRef.current = applyFloor;
    applyFloor(activeFloorRef.current);
    const clock = new THREE.Clock();
    let raf = 0,
      readyRaf = 0,
      firstFrameReported = false,
      lowMotionTime = 0,
      lastRenderErrorAt = 0,
      lastReportedPatientCount = -1,
      lastSeatFillAt = -1;
    const render = () => {
      raf = requestAnimationFrame(render);
      try {
        const dt = Math.min(clock.getDelta(), 0.04),
          t = clock.elapsedTime;
        if (activeFloorRef.current === 3) {
          updateThirdFloorCare(dt, t);
          wardSwingDoors.forEach((door) => {
            const step = dt * 1.85;
            door.openAmount = THREE.MathUtils.lerp(
              door.openAmount,
              door.openTarget,
              1 - Math.exp(-step * 4),
            );
            door.pivots.forEach(({ pivot, side, closedYaw }) => {
              pivot.rotation.y =
                closedYaw - side * Math.PI * 0.46 * door.openAmount;
            });
          });
          courtyardAutoDoors.forEach((door) => {
            if (door.openTarget === 1 && performance.now() >= door.closeAt)
              door.openTarget = 0;
            const speed = door.openTarget > door.openAmount ? 1.45 : 1.7;
            door.openAmount = THREE.MathUtils.lerp(
              door.openAmount,
              door.openTarget,
              1 - Math.exp(-dt * speed * 4),
            );
            door.leaves.forEach(({ mesh, closed, side }) => {
              mesh.position
                .copy(closed)
                .addScaledVector(
                  door.tangent,
                  side * door.opening * 0.46 * door.openAmount,
                );
            });
          });
        }
        if (activeFloorRef.current === 2) {
          upperOperatingDoors.forEach((door) => {
            const target = door.openRequested ? 1 : 0,
              step = dt * (target > door.openAmount ? 1.35 : 1.7);
            door.openAmount = THREE.MathUtils.clamp(
              door.openAmount +
                Math.sign(target - door.openAmount) *
                  Math.min(step, Math.abs(target - door.openAmount)),
              0,
              1,
            );
            door.leaves.forEach(({ mesh, closed, side }) => {
              mesh.position
                .copy(closed)
                .addScaledVector(
                  door.tan,
                  side * (door.opening / 2 + 0.12) * door.openAmount,
                );
            });
          });

          upperORReportStates.forEach((report) => {
            const { door, nurse } = report,
              walker = nurse.walker,
              nurseSpeed = 0.82,
              familySpeed = UPPER_FAMILY_WALK_SPEED;
            if (
              report.phase === "idle" &&
              t >= report.nextStartAt &&
              upperORReportStates.every(
                (other) => other === report || other.phase === "idle",
              )
            ) {
              report.phase = "approaching";
              report.phaseStart = t;
              report.briefingDuration = 6 + Math.random() * 4;
              report.nurseTravelDuration =
                report.nurseApproachLength / nurseSpeed;
            }
            door.openRequested =
              report.phase === "opening" ||
              report.phase === "outbound" ||
              report.phase === "returnOpening" ||
              report.phase === "returning";

            if (
              report.phase === "approaching" &&
              t - report.phaseStart >= report.nurseTravelDuration
            ) {
              report.phase = "doorPause";
              report.phaseStart = t;
            } else if (
              report.phase === "doorPause" &&
              t - report.phaseStart >= 0.5
            ) {
              report.phase = "opening";
              report.phaseStart = t;
              // Family members react as soon as the automatic door starts to
              // open, walking toward the live-position lineup while the nurse
              // is still completing the doorway sequence.
              beginUpperReportFamilyGather(report, t);
            } else if (
              report.phase === "opening" &&
              door.openAmount >= 0.96
            ) {
              report.phase = "outbound";
              report.phaseStart = t;
              report.nurseTravelDuration = report.nurseExitLength / nurseSpeed;
            } else if (
              report.phase === "outbound" &&
              t - report.phaseStart >= report.nurseTravelDuration
            ) {
              report.phase =
                t - report.familyGatherStart >= report.familyTravelDuration
                  ? "briefing"
                  : "gathering";
              report.phaseStart = t;
            } else if (
              report.phase === "gathering" &&
              t - report.familyGatherStart >= report.familyTravelDuration
            ) {
              report.phase = "briefing";
              report.phaseStart = t;
            } else if (
              report.phase === "briefing" &&
              t - report.phaseStart >= report.briefingDuration
            ) {
              report.participants.forEach((participant) => {
                const actor = upperFamilyActors[participant.actorIndex],
                  isReturningToAssignedSeat =
                    participant.resumePosition.distanceToSquared(
                      actor.basePosition,
                    ) < 0.2;
                participant.returnPath = smoothUpperFamilyPath([
                  participant.gatherPosition,
                  ...(isReturningToAssignedSeat ? [actor.seatExit] : []),
                  participant.resumePosition,
                ]);
                participant.returnLength = upperFamilyPathLength(
                  participant.returnPath,
                );
                participant.returnComplete = false;
              });
              report.familyTravelDuration =
                Math.max(
                  ...report.participants.map(
                    (participant) => participant.returnLength,
                  ),
                ) / familySpeed;
              report.nurseTravelDuration =
                report.nurseReturnLength / nurseSpeed;
              report.familyReturnStart = t;
              report.phase = "returnPause";
              report.phaseStart = t;
            } else if (
              report.phase === "returnPause" &&
              t - report.phaseStart >= 0.5
            ) {
              report.phase = "returnOpening";
              report.phaseStart = t;
            } else if (
              report.phase === "returnOpening" &&
              door.openAmount >= 0.96
            ) {
              report.phase = "returning";
              report.phaseStart = t;
            } else if (
              report.phase === "returning" &&
              t - report.phaseStart >= report.nurseTravelDuration
            ) {
              // Close the automatic door as soon as the nurse has crossed the
              // threshold into the room.  The rest of the walk to the work
              // position continues along the protected side aisle while the
              // leaves are already closing behind them.
              report.phase = "returnInterior";
              report.phaseStart = t;
              report.nurseTravelDuration =
                report.nurseInteriorLength / nurseSpeed;
            } else if (
              report.phase === "returnInterior" &&
              t - report.phaseStart >= report.nurseTravelDuration &&
              t - report.familyReturnStart >= report.familyTravelDuration
            ) {
              report.participants.forEach((participant) => {
                const actor = upperFamilyActors[participant.actorIndex];
                if (!participant.returnComplete) {
                  actor.walker.group.position.copy(participant.resumePosition);
                  actor.walker.group.rotation.y = participant.resumeYaw;
                  actor.avoidanceOffset.copy(
                    participant.resumeAvoidanceOffset,
                  );
                  const interruptedTask = participant.resumeTaskKind
                    ? upperFamilyTasks.find(
                        (task) =>
                          task.kind === participant.resumeTaskKind &&
                          task.activeActor === participant.actorIndex &&
                          task.phase === participant.resumeTaskPhase,
                      )
                    : undefined;
                  if (
                    interruptedTask &&
                    participant.resumeTaskElapsed !== undefined
                  )
                    interruptedTask.phaseStart =
                      t - participant.resumeTaskElapsed;
                  participant.returnComplete = true;
                }
              });
              upperReportingFamilyGroups.delete(report.familyGroup);
              walker.group.position.copy(report.nurseBasePosition);
              report.phase = "closing";
              report.phaseStart = t;
            } else if (
              report.phase === "closing" &&
              door.openAmount <= 0.02
            ) {
              report.phase = "idle";
              report.phaseStart = t;
              report.nextStartAt = t + 58 + Math.random() * 24;
              report.participants = [];
            }

            if (report.phase !== "idle") {
              resetUpperPose(walker);
              poseStanding(walker);
              if (walker.chart) walker.chart.visible = true;
              const elapsed = t - report.phaseStart,
                travelling =
                  report.phase === "approaching" ||
                  report.phase === "outbound" ||
                  report.phase === "returning" ||
                  report.phase === "returnInterior";
              if (report.phase === "approaching") {
                const point = upperFamilyPathPoint(
                  report.nurseApproachPath,
                  elapsed * nurseSpeed,
                );
                walker.group.position.copy(point.position);
                walker.group.rotation.y = facingYaw(
                  walker.group.position,
                  point.lookAt,
                );
              } else if (
                report.phase === "doorPause" ||
                report.phase === "opening"
              ) {
                walker.group.position.copy(report.doorWaitPoint);
                walker.group.rotation.y = facingYaw(
                  walker.group.position,
                  door.centre,
                );
              } else if (report.phase === "outbound") {
                const point = upperFamilyPathPoint(
                  report.nurseExitPath,
                  elapsed * nurseSpeed,
                );
                walker.group.position.copy(point.position);
                walker.group.rotation.y = facingYaw(
                  walker.group.position,
                  point.lookAt,
                );
              } else if (report.phase === "returning") {
                const point = upperFamilyPathPoint(
                  report.nurseReturnPath,
                  elapsed * nurseSpeed,
                );
                walker.group.position.copy(point.position);
                walker.group.rotation.y = facingYaw(
                  walker.group.position,
                  point.lookAt,
                );
              } else if (report.phase === "returnInterior") {
                const point = upperFamilyPathPoint(
                  report.nurseInteriorPath,
                  elapsed * nurseSpeed,
                );
                walker.group.position.copy(point.position);
                walker.group.rotation.y = facingYaw(
                  walker.group.position,
                  point.lookAt,
                );
              } else if (
                report.phase === "returnPause" ||
                report.phase === "returnOpening"
              ) {
                walker.group.position.copy(report.reportPoint);
                walker.group.rotation.y = facingYaw(
                  walker.group.position,
                  door.centre,
                );
              } else if (
                report.phase === "gathering" ||
                report.phase === "briefing"
              ) {
                walker.group.position.copy(report.reportPoint);
                walker.group.rotation.y = facingYaw(
                  walker.group.position,
                  report.reportPoint.clone().addScaledVector(door.out, -1.3),
                );
              } else walker.group.position.copy(report.nurseBasePosition);

              if (travelling) {
                const gait = Math.sin(t * 6.5 + report.room);
                walker.legs[0].rotation.x = gait * 0.34;
                walker.legs[1].rotation.x = -gait * 0.34;
                // Keep the left hand supporting the chart throughout every
                // walking segment; only the free arm follows the gait.
                walker.arms[0].rotation.x = 0.91;
                walker.arms[0].rotation.z = 0.34;
                walker.arms[1].rotation.x = gait * 0.16;
                walker.arms[1].rotation.z = -0.06;
              } else if (report.phase === "briefing") {
                walker.arms[0].rotation.x =
                  0.64 + Math.sin(t * 2.6) * 0.13;
                walker.arms[0].rotation.z = 0.24;
                walker.arms[1].rotation.x = 0.92;
                walker.arms[1].rotation.z = -0.28;
                walker.headRig.rotation.y = Math.sin(t * 1.8) * 0.08;
              } else {
                walker.arms[0].rotation.x = 0.91;
                walker.arms[0].rotation.z = 0.34;
                walker.arms[1].rotation.x = 0.24;
              }
            }
          });

          upperClinicalActors.forEach(
            ({ walker, job, phase, baseY, baseYaw, room }) => {
              const report = upperORReportStates.find(
                (candidate) => candidate.room === room,
              );
              if (
                job === "circulatingNurse" &&
                report &&
                report.phase !== "idle"
              )
                return;
              const pulse = Math.sin(t * 2.85 + phase),
                fasterPulse = Math.sin(t * 5.8 + phase),
                slowerPulse = Math.sin(t * 1.55 + phase),
                handoffCycle = (t + room * 1.37) % 8.8,
                handoffProgress = THREE.MathUtils.clamp(
                  (handoffCycle - 5.25) / 1.85,
                  0,
                  1,
                ),
                handoffAmount = Math.sin(handoffProgress * Math.PI);
              walker.group.position.y =
                baseY + (job === "anesthetist" ? 0 : slowerPulse * 0.014);
              const handoffYaw = walker.group.userData.handoffYaw;
              if (
                (job === "surgeon" || job === "scrubNurse") &&
                typeof handoffYaw === "number"
              ) {
                const yawDifference = Math.atan2(
                  Math.sin(handoffYaw - baseYaw),
                  Math.cos(handoffYaw - baseYaw),
                );
                walker.group.rotation.y =
                  baseYaw +
                  yawDifference *
                    handoffAmount *
                    (job === "surgeon" ? 0.3 : 0.72);
              } else {
                walker.group.rotation.y = baseYaw + slowerPulse * 0.025;
              }
              walker.arms.forEach((arm) => arm.rotation.set(0, 0, 0));
              walker.headRig.rotation.set(0, 0, 0);
              if (job === "surgeon") {
                walker.arms[0].rotation.x = 0.82 + fasterPulse * 0.18;
                walker.arms[1].rotation.x = THREE.MathUtils.lerp(
                  0.76 - fasterPulse * 0.16,
                  1.24,
                  handoffAmount,
                );
                walker.arms[0].rotation.z = -0.12;
                walker.arms[1].rotation.z = THREE.MathUtils.lerp(
                  0.12,
                  -0.18,
                  handoffAmount,
                );
                walker.headRig.rotation.x = 0.17 + fasterPulse * 0.055;
                walker.headRig.rotation.y = handoffAmount * 0.2;
              } else if (job === "scrubNurse") {
                walker.arms[0].rotation.x = 0.5 + slowerPulse * 0.1;
                walker.arms[1].rotation.x = THREE.MathUtils.lerp(
                  0.92 + pulse * 0.13,
                  1.25,
                  handoffAmount,
                );
                walker.arms[1].rotation.z = THREE.MathUtils.lerp(
                  -0.09,
                  0.18,
                  handoffAmount,
                );
                walker.headRig.rotation.y = pulse * 0.08;
              } else if (job === "circulatingNurse") {
                if (walker.chart) {
                  walker.chart.visible = true;
                  walker.chart.position.set(0, 0.91, -0.39);
                  walker.chart.rotation.x =
                    -0.47 + Math.sin(t * 2.3 + phase) * 0.018;
                }
                walker.arms[0].rotation.x = 0.91;
                walker.arms[0].rotation.z = 0.34;
                walker.arms[1].rotation.x =
                  1.02 + Math.sin(t * 6.2 + phase) * 0.13;
                walker.arms[1].rotation.z =
                  -0.32 + Math.sin(t * 6.2 + phase) * 0.045;
                walker.headRig.rotation.y = Math.sin(t * 1.8 + phase) * 0.045;
                walker.headRig.rotation.x =
                  0.14 + Math.sin(t * 2.2 + phase) * 0.05;
              } else if (job === "anesthetist") {
                walker.arms[0].rotation.x = 0.46 + pulse * 0.1;
                walker.arms[1].rotation.x = 0.58 - pulse * 0.11;
                walker.headRig.rotation.x =
                  0.13 + Math.sin(t * 2.2 + phase) * 0.1;
                walker.headRig.rotation.y = slowerPulse * 0.035;
              } else if (job === "examDoctor") {
                walker.arms[0].rotation.x =
                  1.02 + Math.sin(t * 5.2 + phase) * 0.16;
                walker.arms[0].rotation.z = 0.22;
                walker.arms[1].rotation.x =
                  0.94 + Math.sin(t * 4.6 + phase + 1) * 0.14;
                walker.arms[1].rotation.z = -0.2;
                walker.headRig.rotation.x =
                  0.08 + Math.sin(t * 2.4 + phase) * 0.055;
              } else if (job === "examNurse") {
                if (walker.chart) {
                  walker.chart.visible = true;
                  walker.chart.position.set(0, 0.91, -0.39);
                  walker.chart.rotation.x =
                    -0.47 + Math.sin(t * 2.3 + phase) * 0.018;
                }
                walker.arms[0].rotation.x = 0.91;
                walker.arms[0].rotation.z = 0.34;
                walker.arms[1].rotation.x =
                  1.02 + Math.sin(t * 6.2 + phase) * 0.13;
                walker.arms[1].rotation.z =
                  -0.32 + Math.sin(t * 6.2 + phase) * 0.045;
                walker.headRig.rotation.y = Math.sin(t * 1.8 + phase) * 0.045;
                walker.headRig.rotation.x =
                  0.14 + Math.sin(t * 2.2 + phase) * 0.05;
              }
            },
          );
          upperWaterStream.visible = false;
          upperFamilyTasks.forEach((task) => {
            if (
              task.phase === "idle" &&
              task.activeActor === null &&
              t >= task.nextStartAt
            ) {
              // Screen and water share one dispatcher. Search the remaining
              // queue for the first eligible companion instead of reserving a
              // second task for someone who is already busy. The selected
              // person moves to the back while deferred people keep their
              // relative priority, preserving a fair seven-person rotation.
              const eligibleOrderIndex = task.order.findIndex((actorIndex) => {
                const candidate = upperFamilyActors[actorIndex];
                return (
                  actorIndex !== lastUpperFamilyTaskActor &&
                  t >= upperFamilyTaskRestUntil[actorIndex] &&
                  !candidate.activeTask &&
                  !upperReportingFamilyGroups.has(
                    candidate.familyGroup as 1 | 2,
                  )
                );
              });
              if (eligibleOrderIndex >= 0) {
                const [nextActorIndex] = task.order.splice(
                    eligibleOrderIndex,
                    1,
                  ),
                  nextActor = upperFamilyActors[nextActorIndex];
                task.order.push(nextActorIndex);
                nextActor.activeTask = task.kind;
                nextActor.phoneRaised = false;
                task.activeActor = nextActorIndex;
                task.phase = "outbound";
                task.phaseStart = t;
                lastUpperFamilyTaskActor = nextActorIndex;
              }
            }
            if (task.activeActor === null) return;
            const actor = upperFamilyActors[task.activeActor],
              walker = actor.walker,
              outboundPath = upperFamilyPath(actor, task),
              pathLength = upperFamilyPathLength(outboundPath),
              elapsedDistance = (t - task.phaseStart) * UPPER_FAMILY_WALK_SPEED,
              reportParticipant = upperORReportStates
                .flatMap((report) => report.participants)
                .find(
                  (participant) => participant.actorIndex === task.activeActor,
                );
            if (reportParticipant && !reportParticipant.returnComplete) {
              // The interrupted phase is frozen from the exact elapsed-time
              // snapshot captured when the door opened.  It is deliberately
              // not advanced with per-frame dt: browser throttling can make t
              // jump farther than dt and previously let the hidden task finish
              // in the background before the companion returned.
              return;
            }
            if (task.phase === "outbound") {
              placeAlongUpperFamilyPath(
                actor,
                outboundPath,
                elapsedDistance,
                dt,
                task.kind === "water" ? 0.16 : 0,
              );
              if (elapsedDistance >= pathLength) {
                walker.group.position.copy(task.routeEnd);
                actor.avoidanceOffset.set(0, 0, 0);
                task.phase = task.kind === "screen" ? "viewing" : "activity";
                task.phaseStart = t;
              }
            } else if (task.phase === "viewing") {
              walker.group.position.copy(screenEnd);
              if (t - task.phaseStart >= 1.8) {
                task.phase = "scanMove";
                task.phaseStart = t;
              }
            } else if (task.phase === "scanMove") {
              const scanPath = [screenEnd, screenScanEnd],
                scanPathLength = upperFamilyPathLength(scanPath);
              placeAlongUpperFamilyPath(actor, scanPath, elapsedDistance, dt);
              if (elapsedDistance >= scanPathLength) {
                walker.group.position.copy(screenScanEnd);
                actor.avoidanceOffset.set(0, 0, 0);
                task.phase = "activity";
                task.phaseStart = t;
              }
            } else if (task.phase === "activity") {
              walker.group.position.copy(
                task.kind === "screen" ? screenScanEnd : task.routeEnd,
              );
              const activityDuration = task.kind === "screen" ? 2.4 : 8.8;
              if (t - task.phaseStart >= activityDuration) {
                actor.cup.visible = false;
                task.phase = "returning";
                task.phaseStart = t;
              }
            } else if (task.phase === "returning") {
              const returnPath =
                  task.kind === "screen"
                    ? [
                        screenScanEnd,
                        screenEnd,
                        ...outboundPath.slice(0, -1).reverse(),
                      ]
                    : outboundPath.slice().reverse(),
                returnLength = upperFamilyPathLength(returnPath);
              placeAlongUpperFamilyPath(
                actor,
                returnPath,
                elapsedDistance,
                dt,
                task.kind === "water" ? 0.16 : 0,
              );
              if (elapsedDistance >= returnLength) {
                walker.group.position.copy(actor.basePosition);
                actor.avoidanceOffset.set(0, 0, 0);
                actor.activeTask = undefined;
                actor.phoneRaised = false;
                actor.phoneChangeAt = t + 6 + Math.random() * 9;
                upperFamilyTaskRestUntil[task.activeActor] =
                  t + 6 + Math.random() * 4;
                task.lastFamily = actor.familyGroup;
                task.activeActor = null;
                task.phase = "idle";
                task.nextStartAt = t + 2 + Math.random() * 3;
                task.orderIndex += 1;
                if (task.orderIndex >= task.order.length) {
                  task.order = shuffledFamilyOrder(task.lastFamily);
                  task.orderIndex = 0;
                }
              }
            }
          });
          upperFamilyActors.forEach((actor) => {
            const {
                walker,
                restActivity,
                phase,
                basePosition,
                baseYaw,
                activeTask,
              } = actor,
              task = activeTask
                ? upperFamilyTasks.find((candidate) => candidate.kind === activeTask)
                : undefined,
              report = upperORReportStates.find(
                (candidate) =>
                  (candidate.phase === "opening" ||
                    candidate.phase === "outbound" ||
                    candidate.phase === "gathering" ||
                    candidate.phase === "briefing" ||
                    candidate.phase === "returnPause" ||
                    candidate.phase === "returnOpening" ||
                    candidate.phase === "returning" ||
                    candidate.phase === "returnInterior") &&
                  candidate.participants.some(
                    (participant) =>
                      !participant.returnComplete &&
                      upperFamilyActors[participant.actorIndex] === actor,
                  ),
              ),
              reportParticipant = report?.participants.find(
                (participant) =>
                  !participant.returnComplete &&
                  upperFamilyActors[participant.actorIndex] === actor,
              );
            resetUpperPose(walker);
            if (report && reportParticipant) {
              if (walker.scanBadge) walker.scanBadge.visible = false;
              actor.cup.visible = false;
              actor.cupWater.visible = false;
              actor.phoneChangeAt += dt;
              poseStanding(walker);
              const isFamilyGathering =
                  report.phase === "opening" ||
                  report.phase === "outbound" ||
                  report.phase === "gathering",
                isFamilyReturning =
                  report.phase === "returnPause" ||
                  report.phase === "returnOpening" ||
                  report.phase === "returning" ||
                  report.phase === "returnInterior",
                elapsedDistance =
                  (t -
                    (isFamilyReturning
                      ? report.familyReturnStart
                      : isFamilyGathering
                        ? report.familyGatherStart
                      : report.phaseStart)) *
                  UPPER_FAMILY_WALK_SPEED,
                movementPath =
                  isFamilyGathering
                    ? reportParticipant.gatherPath
                    : isFamilyReturning
                      ? reportParticipant.returnPath
                      : undefined,
                movementLength =
                  isFamilyGathering
                    ? reportParticipant.gatherLength
                    : isFamilyReturning
                      ? reportParticipant.returnLength
                      : 0,
                reachedDestination = Boolean(
                  movementPath && elapsedDistance >= movementLength,
                ),
                travelling = Boolean(movementPath && !reachedDestination);
              if (travelling && movementPath) {
                placeAlongUpperFamilyPath(
                  actor,
                  movementPath,
                  elapsedDistance,
                  dt,
                );
              } else if (isFamilyGathering || report.phase === "briefing") {
                actor.avoidanceOffset.set(0, 0, 0);
                walker.group.position.copy(reportParticipant.gatherPosition);
                walker.group.rotation.y = facingYaw(
                  walker.group.position,
                  report.reportPoint,
                );
              } else if (isFamilyReturning) {
                actor.avoidanceOffset.copy(
                  reportParticipant.resumeAvoidanceOffset,
                );
                walker.group.position.copy(reportParticipant.resumePosition);
                walker.group.rotation.y = reportParticipant.resumeYaw;
                const interruptedTask = reportParticipant.resumeTaskKind
                  ? upperFamilyTasks.find(
                      (candidate) =>
                        candidate.kind === reportParticipant.resumeTaskKind &&
                        candidate.activeActor ===
                          reportParticipant.actorIndex &&
                        candidate.phase === reportParticipant.resumeTaskPhase,
                    )
                  : undefined;
                if (
                  interruptedTask &&
                  reportParticipant.resumeTaskElapsed !== undefined
                )
                  interruptedTask.phaseStart =
                    t - reportParticipant.resumeTaskElapsed;
                reportParticipant.returnComplete = true;
                if (
                  reportParticipant.resumePosition.distanceToSquared(
                    actor.basePosition,
                  ) < 0.2
                )
                  poseSeated(walker, actor.baseYaw);
              }
              if (travelling) {
                const gait = Math.sin(
                  t * Number(walker.group.userData.gaitRate || 6.4) + phase,
                );
                walker.legs[0].rotation.x = gait * 0.34;
                walker.legs[1].rotation.x = -gait * 0.34;
                walker.arms[0].rotation.x = -gait * 0.2;
                walker.arms[1].rotation.x = gait * 0.2;
                walker.group.position.y = Math.abs(gait) * 0.012;
              } else {
                walker.arms[0].rotation.x = 0.26;
                walker.arms[1].rotation.x = 0.34;
                if (report.phase === "briefing") {
                  // Each relative acknowledges the explanation with a short,
                  // slightly offset nod instead of remaining motionless.
                  const nodCycle = (t * 1.18 + phase * 0.31) % 3.1,
                    nod =
                      nodCycle < 1.15
                        ? Math.sin((nodCycle / 1.15) * Math.PI * 2) * 0.11
                        : 0;
                  walker.headRig.rotation.x = 0.06 + nod;
                  walker.headRig.rotation.y =
                    Math.sin(t * 0.82 + phase) * 0.025;
                } else {
                  walker.headRig.rotation.x =
                    0.04 + Math.sin(t * 1.7 + phase) * 0.035;
                }
              }
              return;
            }
            if (walker.scanBadge)
              walker.scanBadge.visible = Boolean(
                task?.kind === "screen" && task.phase === "activity",
              );
            actor.cup.visible = false;
            actor.cupWater.visible = false;
            actor.cup.position.set(0, -0.52, -0.08);
            actor.cup.rotation.set(0, 0, 0);
            if (task && task.activeActor !== null) {
              poseStanding(walker);
              if (
                task.phase === "outbound" ||
                task.phase === "scanMove" ||
                task.phase === "returning"
              ) {
                const gait = Math.sin(
                  t * Number(walker.group.userData.gaitRate || 6.4) + phase,
                );
                walker.legs[0].rotation.x = gait * 0.34;
                walker.legs[1].rotation.x = -gait * 0.34;
                walker.arms[0].rotation.x = -gait * 0.2;
                walker.arms[1].rotation.x = gait * 0.2;
                walker.group.position.y = Math.abs(gait) * 0.012;
              } else {
                const activityTarget =
                  task.kind === "water"
                    ? hydrationStation.position
                    : task.phase === "activity"
                      ? upperInfoScreen.position
                          .clone()
                          .setX(walker.group.position.x)
                      : upperInfoScreen.position;
                walker.group.rotation.y = facingYaw(
                  walker.group.position,
                  activityTarget,
                );
                if (task.kind === "water") {
                  const activityElapsed = t - task.phaseStart;
                  actor.cup.visible = task.phase === "activity";
                  if (activityElapsed < 1.35) {
                    // Reach for a fresh cup before placing it below the outlet.
                    walker.arms[1].rotation.x =
                      0.45 + (activityElapsed / 1.35) * 0.72;
                    walker.arms[1].rotation.z = -0.22;
                  } else if (activityElapsed < 3.7) {
                    // Hold the cup steadily below the red/blue taps while it fills.
                    walker.arms[1].rotation.x = 1.2;
                    walker.arms[1].rotation.z = -0.34;
                    actor.cup.position.z = -0.16;
                    actor.cup.position.y = -0.5;
                    upperWaterStream.visible = true;
                    actor.cupWater.visible = activityElapsed >= 2.75;
                    walker.headRig.rotation.x = 0.1;
                  } else {
                    // Bring the filled cup to the mouth and take several sips.
                    const sip = Math.sin((activityElapsed - 3.7) * 3.1 + phase);
                    actor.cupWater.visible = true;
                    walker.arms[1].rotation.x = 1.72 + sip * 0.08;
                    walker.arms[1].rotation.z = -0.18;
                    actor.cup.position.set(0, -0.5, -0.08);
                    walker.headRig.rotation.x = -0.08 + sip * 0.025;
                  }
                  // Keep the open rim aligned with world-up even while the arm
                  // lifts, and place its base just above the hand instead of
                  // intersecting the palm mesh.
                  if (actor.cup.visible && actor.cup.parent) {
                    walker.group.updateWorldMatrix(true, true);
                    const cupHand = walker.arms[1].children.find(
                      (part) => part.userData.handPart,
                    );
                    if (cupHand) {
                      cupHand.getWorldPosition(upperCupWorldPosition);
                      upperCupWorldPosition.y += 0.3;
                      actor.cup.position.copy(
                        actor.cup.parent.worldToLocal(upperCupWorldPosition),
                      );
                    }
                    actor.cup.parent.getWorldQuaternion(phoneParentWorld);
                    actor.cup.quaternion.copy(phoneParentWorld.invert());
                  }
                } else {
                  if (task.phase === "activity") {
                    holdPhoneAtFace(walker, t * 2.6 + phase, true);
                    walker.headRig.rotation.x = 0.08;
                  } else {
                    walker.arms[0].rotation.x = 0.18;
                    walker.arms[1].rotation.x = 0.18;
                    walker.headRig.rotation.x =
                      -0.1 + Math.sin(t * 1.45 + phase) * 0.025;
                  }
                }
              }
              return;
            }

            walker.group.position.copy(basePosition);
            walker.group.position.y = 0.14;
            walker.group.scale.set(1, 0.88, 1);
            walker.group.rotation.set(0, baseYaw, 0);
            walker.legs.forEach((leg, index) => {
              leg.position.set(index ? 0.14 : -0.14, 0.69, -0.3);
              leg.rotation.set(-Math.PI / 2, 0, 0);
            });
            if (t >= actor.phoneChangeAt) {
              actor.phoneRaised = !actor.phoneRaised;
              actor.phoneChangeAt = t + 6 + Math.random() * 9;
            }
            if (actor.phoneRaised && walker.phone) {
              holdPhoneAtFace(walker, t * 2.1 + phase);
              walker.headRig.rotation.x =
                0.08 + Math.sin(t * 1.8 + phase) * 0.025;
            } else if (restActivity === "conversation") {
              walker.arms[0].rotation.x =
                0.42 + Math.sin(t * 2.25 + phase) * 0.14;
              walker.arms[1].rotation.x = 0.28;
              walker.headRig.rotation.y =
                Math.sin(t * 1.45 + phase) * 0.13;
            } else {
              walker.arms[0].rotation.x = 0.5;
              walker.arms[1].rotation.x = 0.5;
              walker.headRig.rotation.x =
                Math.sin(t * 1.35 + phase) * 0.035;
              walker.headRig.rotation.y = Math.sin(t * 0.75 + phase) * 0.07;
            }
          });
        }
        const showPaymentSuccess = t < paymentSuccessUntil;
        if (showPaymentSuccess !== paymentScreenShowingSuccess) {
          paymentScreenShowingSuccess = showPaymentSuccess;
          kioskScreenMaterial.map = showPaymentSuccess
            ? paymentPaidTexture
            : paymentIdleTexture;
          kioskScreenMaterial.needsUpdate = true;
        }
        streetBirds.forEach((bird, i) => {
          const cycleLength = 29,
            cycle = Math.floor((t + i * 11) / cycleLength),
            phase = (t + i * 11) % cycleLength;
          if (cycle !== bird.cycle) {
            bird.cycle = cycle;
            bird.tree = (cycle * 3 + i) % streetTreeXs.length;
          }
          const treeX = streetTreeXs[bird.tree],
            perch = new THREE.Vector3(treeX, 4.22, streetTreeZ),
            from = new THREE.Vector3(
              cycle % 2 ? -17 : 17,
              5.7,
              9.2 + (cycle % 3) * 0.7,
            ),
            to = new THREE.Vector3(
              cycle % 2 ? 17 : -17,
              6.15,
              10.1 + (cycle % 2) * 0.8,
            ),
            faceDirection = (a: THREE.Vector3, b: THREE.Vector3) =>
              Math.atan2(-(b.z - a.z), b.x - a.x);
          bird.note.visible = false;
          if (phase < 5 || phase > 25) {
            bird.group.visible = false;
            return;
          }
          bird.group.visible = true;
          if (phase < 10.5) {
            const q = THREE.MathUtils.smoothstep((phase - 5) / 5.5, 0, 1);
            bird.group.position.lerpVectors(from, perch, q);
            bird.group.position.y += Math.sin(q * Math.PI) * 1.05;
            bird.group.rotation.y = faceDirection(from, perch);
            bird.wings[0].rotation.x = Math.sin(t * 17) * 0.9;
            bird.wings[1].rotation.x = -Math.sin(t * 17) * 0.9;
          } else if (phase < 17.5) {
            bird.group.position.copy(perch);
            bird.group.rotation.y = cycle % 2 ? 0 : Math.PI;
            bird.wings.forEach((wing) => (wing.rotation.x = 0.08));
            bird.note.visible = true;
            const pulse = 0.68 + Math.sin(t * 6) * 0.08;
            bird.note.scale.set(pulse, pulse, 1);
            bird.note.position.y = 0.82 + Math.sin(t * 4) * 0.08;
          } else {
            const q = THREE.MathUtils.smoothstep((phase - 17.5) / 7.5, 0, 1);
            bird.group.position.lerpVectors(perch, to, q);
            bird.group.position.y += Math.sin(q * Math.PI) * 1.15;
            bird.group.rotation.y = faceDirection(perch, to);
            bird.wings[0].rotation.x = Math.sin(t * 17) * 0.9;
            bird.wings[1].rotation.x = -Math.sin(t * 17) * 0.9;
          }
        });
        updateThirdFloorCourtyardLife(t);
        streetButterflies.forEach((butterfly, i) => {
          const timing = butterflyTimings[i],
            shiftedTime = t + timing.offset,
            cycle = Math.floor(shiftedTime / timing.cycleLength),
            phase = shiftedTime % timing.cycleLength,
            appearanceSeed = butterflyUnitRandom(
              (cycle + 1) * (i + 3) * 19.713 + i * 4.17,
            ),
            // Butterfly zero stays in circulation so the street always has at
            // least one. The other independent schedules make 1–4 possible.
            shouldFly = i === 0 || appearanceSeed < 0.62;
          if (cycle !== butterfly.cycle) {
            butterfly.cycle = cycle;
            butterfly.planter =
              butterflyUnitRandom((cycle + 5) * (i + 2) * 31.371) < 0.5
                ? 0
                : 1;
            const colorSeed = butterflyUnitRandom(
                (cycle + 1) * (i + 2) * 78.233,
              ),
              color =
                butterflyPalette[
                  Math.floor(colorSeed * butterflyPalette.length) %
                    butterflyPalette.length
                ];
            butterfly.wingMaterials.forEach((wingMaterial) =>
              wingMaterial.color.setHex(color),
            );
          }
          // Each actor becomes inactive only after its own completed off-street
          // exit, so the random count never makes one disappear mid-flight.
          if (!shouldFly) {
            butterfly.group.visible = false;
            return;
          }
          butterfly.group.visible = true;
          const planterX = streetPlanterXs[butterfly.planter],
            // A butterfly visiting the left planter always enters from the
            // left; one visiting the right planter always enters from the right.
            entersFromLeft = butterfly.planter === 0,
            // 40% cross the whole street; 60% loop back to their entry side.
            crossesStreet =
              butterflyUnitRandom((cycle + 7) * (i + 5) * 51.713 + 0.31) <
              0.4,
            approachFrom = new THREE.Vector3(
              entersFromLeft ? -18.5 : 18.5,
              2.0 + i * 0.16,
              8.7 + i * 0.16,
            ),
            flowerHover = new THREE.Vector3(
              planterX + (i - 1.5) * 0.24,
              1.7 + (i % 2) * 0.14,
              7.98,
            ),
            leavesRight = crossesStreet ? entersFromLeft : !entersFromLeft,
            leaveTo = new THREE.Vector3(
              leavesRight ? 19.5 : -19.5,
              2.55 + i * 0.16,
              9.8 + i * 0.18,
            ),
            hoverEnd = timing.approach + timing.hover,
            // Crossing flights take 1.5x as long, which makes their speed one
            // third slower than before. Return flights keep their prior speed.
            leaveDuration = timing.leave * (crossesStreet ? 1.5 : 1),
            verticalFloat =
              Math.sin(t * (2.05 + i * 0.12) + i * 1.37) * 0.14 +
              Math.sin(t * (4.65 + i * 0.16) + i * 0.73) * 0.055,
            crossingFloat =
              crossesStreet && phase >= hoverEnd
                ? Math.sin(t * (1.73 + i * 0.1) + cycle * 0.61) * 0.095 +
                  Math.sin(t * (3.37 + i * 0.14) + i * 0.83) * 0.045
                : 0,
            depthFloat = Math.sin(t * (1.28 + i * 0.08) + i * 1.9) * 0.085;
          let travelYaw = entersFromLeft ? 0 : Math.PI;
          if (phase < timing.approach) {
            const q = THREE.MathUtils.smoothstep(
              phase / timing.approach,
              0,
              1,
            );
            butterfly.group.position.lerpVectors(approachFrom, flowerHover, q);
            butterfly.group.position.y += Math.sin(q * Math.PI) * 0.32;
          } else if (phase < hoverEnd) {
            const hover = phase - timing.approach;
            butterfly.group.position.copy(flowerHover);
            butterfly.group.position.x += Math.sin(hover * 1.55 + i) * 0.34;
            butterfly.group.position.y += 0.18 + Math.sin(hover * 2.7) * 0.12;
            butterfly.group.position.z += Math.cos(hover * 1.9 + i) * 0.2;
            travelYaw += Math.sin(hover * 1.45 + i) * 0.48;
          } else {
            const q = THREE.MathUtils.smoothstep(
              (phase - hoverEnd) / leaveDuration,
              0,
              1,
            );
            butterfly.group.position.lerpVectors(flowerHover, leaveTo, q);
            butterfly.group.position.y += Math.sin(q * Math.PI) * 0.38;
            travelYaw = leavesRight ? 0 : Math.PI;
          }
          // Real butterflies rise and fall continuously instead of following a
          // ruler-straight path. Two frequencies avoid a mechanical sine wave.
          butterfly.group.position.y += verticalFloat + crossingFloat;
          butterfly.group.position.z += depthFloat;
          butterfly.group.rotation.z =
            Math.sin(t * (1.52 + i * 0.09) + i) * 0.075;

          // Alternate energetic flap bursts with gentler gliding intervals.
          const flapEnvelope =
              0.68 + Math.sin(t * (0.82 + i * 0.07) + i * 1.2) * 0.32,
            flap = THREE.MathUtils.degToRad(
              42 +
                Math.sin(
                  t * (11.2 + i * 0.86) +
                    Math.sin(t * 1.37 + i) * 0.55,
                ) *
                  (17 + flapEnvelope * 15),
            );
          butterfly.wingPivots[0].rotation.x = flap;
          butterfly.wingPivots[1].rotation.x = -flap;
          butterfly.group.rotation.y =
            travelYaw + Math.sin(t * 0.73 + i * 1.7) * 0.18;
        });
        streetWalkers.forEach((w, i) => {
          const direction = w.group.userData.streetDirection as number,
            baseZ = w.group.userData.streetBaseZ as number,
            speed = w.group.userData.streetSpeed as number,
            proposed = w.group.position.clone();
          proposed.x += direction * dt * speed;
          proposed.z = baseZ + Math.sin(t * 0.55 + i) * 0.035;
          // Only left-bound pedestrians keep a following gap behind departing
          // patients. Right-bound pedestrians intentionally cross the departure
          // stream without either character yielding.
          const mustYield =
            direction < 0 &&
            patients.some((patient) => {
              if (!isStreetDepartingPatient(patient)) return false;
              const patientAhead = patient.group.position.x < w.group.position.x;
              return (
                patientAhead &&
                Math.abs(patient.group.position.z - proposed.z) < 0.72 &&
                proposed.distanceTo(patient.group.position) < 0.82
              );
            });
          if (!mustYield) w.group.position.copy(proposed);
          if (w.group.position.x > 16) w.group.position.x = -16;
          if (w.group.position.x < -16) w.group.position.x = 16;
          w.group.position.z = baseZ + Math.sin(t * 0.55 + i) * 0.035;
          w.group.rotation.set(
            0,
            direction > 0 ? -Math.PI / 2 : Math.PI / 2,
            0,
          );
          const gait = t * (5.1 + i * 0.37) + i;
          if (mustYield) {
            w.legs.forEach((leg) => (leg.rotation.x *= 0.58));
            w.arms.forEach((arm) => (arm.rotation.x *= 0.58));
          } else {
            w.legs[0].rotation.x = Math.sin(gait) * 0.38;
            w.legs[1].rotation.x = -Math.sin(gait) * 0.38;
            w.arms[0].rotation.x = -Math.sin(gait) * 0.27;
            w.arms[1].rotation.x = Math.sin(gait) * 0.27;
          }
        });
        streetCars.forEach((car) => {
          const direction = car.userData.direction as number,
            speed = car.userData.laneSpeed as number;
          car.position.x += direction * dt * speed;
          if (car.position.x > 18) car.position.x = -18;
          if (car.position.x < -18) car.position.x = 18;
          car.rotation.y = direction > 0 ? 0 : Math.PI;
          car.traverse((o) => {
            if (o.userData.carWheel) o.rotation.y += direction * dt * 6;
          });
        });
        elevatorDoorLeaves.forEach((leaves, floorNumber) => {
          const target =
              elevatorOpenRef.current &&
              activeFloorRef.current === floorNumber
                ? 1
                : 0,
            step = Math.min(1, dt * 3.1);
          leaves.openAmount = THREE.MathUtils.lerp(
            leaves.openAmount,
            target,
            step,
          );
          if (Math.abs(leaves.openAmount - target) < 0.004)
            leaves.openAmount = target;
          leaves.left.position.x = THREE.MathUtils.lerp(
            -0.62,
            -1.22,
            leaves.openAmount,
          );
          leaves.right.position.x = THREE.MathUtils.lerp(
            0.62,
            1.22,
            leaves.openAmount,
          );
          const storedScale = Math.max(0.001, 1 - leaves.openAmount);
          leaves.left.scale.x = storedScale;
          leaves.right.scale.x = storedScale;
          leaves.seam.visible = leaves.openAmount < 0.08;
        });
        if (activeFloorRef.current === 1) {
        // The sensor keeps both leaves open while anybody is approaching or
        // crossing either one-way lane. Only after 1.8 seconds with no traffic
        // may the door close. Each leaf first retracts toward the lobby interior,
        // then slides into its solid side pocket without touching the glazing.
        const automaticDoorHasTraffic = patients.some(
          (patient) =>
            patient.group.visible &&
            patient.group.userData.activePatient &&
            !!patient.group.userData.revolvingDoorMode &&
            Math.abs(patient.group.position.x) < 2.25 &&
            patient.group.position.z > 3.35 &&
            patient.group.position.z < revolvingDoorEntryQueue.z + 0.35,
        );
        if (automaticDoorHasTraffic) slidingDoorIdleTime = 0;
        else slidingDoorIdleTime += dt;
        const slidingDoorTarget =
            automaticDoorHasTraffic || slidingDoorIdleTime < 1.8 ? 1 : 0,
          // Account for the longer full-open travel: the leaves now move at 70%
          // of their previous real-world sliding speed. Closing retains its
          // existing speed and still waits for 1.8 traffic-free seconds.
          slidingDoorStep =
            dt *
            (slidingDoorTarget > slidingDoorOpenAmount ? 0.956 : 2.05);
        slidingDoorOpenAmount = THREE.MathUtils.clamp(
          slidingDoorOpenAmount +
            Math.sign(slidingDoorTarget - slidingDoorOpenAmount) *
              Math.min(slidingDoorStep, Math.abs(slidingDoorTarget - slidingDoorOpenAmount)),
          0,
          1,
        );
        slidingDoorLeaves.forEach((leaf, leafIndex) => {
          const side = leafIndex === 0 ? -1 : 1;
          leaf.position.x =
            side *
            THREE.MathUtils.lerp(
              slidingDoorClosedX,
              slidingDoorOpenX,
              slidingDoorOpenAmount,
            );
          leaf.position.z = -0.22 * slidingDoorOpenAmount;
        });
        for (
          let queueIndex = revolvingDoorEntryWaiters.length - 1;
          queueIndex >= 0;
          queueIndex--
        ) {
          const waiter = patients.find(
            (p) => p.group.uuid === revolvingDoorEntryWaiters[queueIndex],
          );
          if (
            !waiter ||
            !waiter.group.visible ||
            waiter.group.userData.visitPhase !== "entering" ||
            waiter.group.userData.revolvingDoorTransit
          )
            revolvingDoorEntryWaiters.splice(queueIndex, 1);
        }
        for (let queueIndex = revolvingDoorExitWaiters.length - 1; queueIndex >= 0; queueIndex--) {
          const waiter = patients.find(
            (p) => p.group.uuid === revolvingDoorExitWaiters[queueIndex],
          );
          if (
            !waiter ||
            !waiter.group.visible ||
            waiter.group.userData.visitPhase !== "leaving" ||
            waiter.group.userData.revolvingDoorTransit
          )
            revolvingDoorExitWaiters.splice(queueIndex, 1);
        }
        patients
          .filter(
            (patient) =>
              patient.group.visible &&
              patient.group.userData.revolvingDoorTransit,
          )
          .forEach((traveler) => {
            if (traveler.group.userData.revolvingDoorFollowing) {
              traveler.group.userData.revolvingDoorNoProgress = 0;
              traveler.group.userData.revolvingDoorProgressAnchor =
                traveler.group.position.clone();
              delete traveler.group.userData.revolvingDoorFollowing;
              return;
            }
            const progressAnchor = traveler.group.userData
                .revolvingDoorProgressAnchor as THREE.Vector3 | undefined,
              moved = progressAnchor
                ? traveler.group.position.distanceTo(progressAnchor)
                : 0;
            if (!progressAnchor)
              traveler.group.userData.revolvingDoorProgressAnchor =
                traveler.group.position.clone();
            else if (moved > 0.035) {
              progressAnchor.copy(traveler.group.position);
              traveler.group.userData.revolvingDoorNoProgress = 0;
            } else
              traveler.group.userData.revolvingDoorNoProgress =
                (traveler.group.userData.revolvingDoorNoProgress || 0) + dt;
            const noProgress =
                traveler.group.userData.revolvingDoorNoProgress || 0,
              transitAge =
                t -
                (traveler.group.userData.revolvingDoorTransitStartedAt || t);
            if (noProgress > 0.72) {
              // Each lane recovers independently, so a temporarily blocked
              // follower never freezes the opposite direction.
              const path = traveler.group.userData.lifecyclePath as
                  | THREE.Vector3[]
                  | undefined,
                target = path?.[0];
              delete traveler.group.userData.navPath;
              delete traveler.group.userData.navTarget;
              delete traveler.group.userData.detourGoal;
              delete traveler.group.userData.yieldGoal;
              traveler.pause = 0;
              traveler.action = "walk";
              traveler.speed =
                transitAge > 14
                  ? revolvingDoorTransitSpeed * 1.18
                  : revolvingDoorTransitSpeed;
              if (target) {
                const forward = target.clone().sub(traveler.group.position);
                forward.y = 0;
                const distance = forward.length();
                if (distance > 0.025)
                  traveler.group.position.addScaledVector(
                    forward.normalize(),
                    Math.min(
                      distance,
                      revolvingDoorTransitSpeed * dt * 0.62,
                    ),
                  );
              }
            }
          });
        doors.forEach((d) => {
          d.knockTime = Math.max(0, d.knockTime - dt);
          d.knockBadge.visible = d.knockTime > 0;
          if (d.knockTime > 0) {
            const pulse = 1 + Math.sin(t * 18) * 0.08;
            d.knockBadge.scale.set(0.95 * pulse, 0.68 * pulse, 1);
          }
          const doorCenter = clinicDoorPoints[d.room - 1],
            knockedDoctorTransit = doctors.some(
              (doc) =>
                doc.room === d.room &&
                (doc.group.userData.doctorPathMode === "knockExit" ||
                  doc.group.userData.doctorPathMode === "knockReturn" ||
                  (doc.action === "wave" &&
                    doc.group.userData.doorGreeting === d.room)) &&
                doc.group.position.distanceTo(doorCenter) < 3.7,
            ),
            patientTransit = patients.some(
              (p) => {
                if (
                  p.group.userData.consultRoom !== d.room ||
                  !p.group.userData.consultPath ||
                  p.group.position.distanceTo(doorCenter) >= 3.7
                )
                  return false;
                const depth = p.group.position
                  .clone()
                  .sub(doorCenter)
                  .dot(clinicOuts[d.room - 1]);
                return (
                  p.group.userData.consultState === "leaving" ||
                  (p.group.userData.consultState === "inbound" && depth < 0.78)
                );
              },
            ),
            nurseDoorService = clinicNurses.some(
              (n) =>
                n.room === d.room &&
                (n.action === "clinicNurseDoor" ||
                  n.group.userData.clinicStaffPathMode === "doorWait" ||
                  ((n.group.userData.clinicStaffPathMode === "followIn" ||
                    n.group.userData.clinicStaffPathMode === "leadIn" ||
                    n.group.userData.clinicStaffPathMode === "returnReady") &&
                    n.group.position
                      .clone()
                      .sub(doorCenter)
                      .dot(clinicOuts[d.room - 1]) < 0.58)) &&
                n.group.position.distanceTo(doorCenter) < 3.7,
            );
          d.auto = knockedDoctorTransit || patientTransit || nurseDoorService;
          const target = d.auto ? d.openPosition : d.closedPosition;
          d.pivot.position.lerp(target, 0.18);
          d.pivot.rotation.y = d.base;
        });
        patients.forEach((p) => {
          const calledRoom = p.group.userData.calledScreenRoom as
            | number
            | undefined;
          if (
            calledRoom &&
            (p.action === "clinicChairSit" || p.action === "consultSit")
          ) {
            setCallScreen(calledRoom, "看診中");
            delete p.group.userData.calledScreenRoom;
          }
          if (
            p.group.userData.baseCalledSpeed &&
            p.group.userData.consultState !== "inbound"
          ) {
            p.speed = p.group.userData.baseCalledSpeed;
            delete p.group.userData.baseCalledSpeed;
            delete p.group.userData.nurseEscortSpeed;
          }
        });
        callScreens.forEach((screen) => {
          if (
            screen.patientNo === "看診中" &&
            !patients.some(
              (p) =>
                p.group.userData.consultRoom === screen.room &&
                (p.action === "clinicChairSit" ||
                  p.action === "consultSit" ||
                  p.action === "postExamTalk" ||
                  p.action === "postScanTalk" ||
                  p.action === "clinicScan" ||
                  p.action === "bedSit" ||
                  p.action === "examBed" ||
                  p.action === "bedExit" ||
                  p.group.userData.consultState === "toExam" ||
                  p.group.userData.consultState === "postExamSeat"),
            )
          )
            setCallScreen(screen.room);
        });
        syncCounterServiceQueue();
        patients.forEach((p, index) => monitorPatientFlow(p, index, dt, t));
        walkers.forEach((w, i) => {
          try {
            if (w.role === "patient" && !w.group.userData.activePatient) return;
            if (
              isStreetDepartingPatient(w) &&
              w.group.position.x <= streetDepartureRecycleX
            ) {
              completePatientDeparture(w);
              return;
            }
            w.sitCooldown = Math.max(0, w.sitCooldown - dt);
            w.group.userData.consultCooldown = Math.max(
              0,
              (w.group.userData.consultCooldown || 0) - dt,
            );
            w.group.userData.scanCooldown = Math.max(
              0,
              (w.group.userData.scanCooldown || 0) - dt,
            );
            w.group.userData.counterRescanCooldown = Math.max(
              0,
              (w.group.userData.counterRescanCooldown || 0) - dt,
            );
            w.group.userData.seatRetryCooldown = Math.max(
              0,
              (w.group.userData.seatRetryCooldown || 0) - dt,
            );
            w.group.userData.queueCycleCooldown = Math.max(
              0,
              (w.group.userData.queueCycleCooldown || 0) - dt,
            );
            w.group.userData.escapeMode = Math.max(
              0,
              (w.group.userData.escapeMode || 0) - dt,
            );
            w.group.userData.talkCooldown = Math.max(
              0,
              (w.group.userData.talkCooldown || 0) - dt,
            );
            w.group.userData.navReplanCooldown = Math.max(
              0,
              (w.group.userData.navReplanCooldown || 0) - dt,
            );
            if (
              (w.role === "patient" ||
                w.role === "nurse" ||
                w.role === "assistant") &&
              w.action === "walk"
            )
              w.pause = Math.min(w.pause, 0.75);
            if (
              w.role === "patient" &&
              w.group.userData.visitPhase === "preScan"
            )
              w.group.userData.visitPhase = "checkin";
            w.readCooldown = Math.max(0, w.readCooldown - dt);
            w.headRig.rotation.set(0, 0, 0);
            if (w.group.userData.eyeAssistant)
              w.headRig.position.y =
                (w.group.userData.eyeHeadBaseY || 0.8) +
                Math.sin(t * 3.4 + i) *
                  (w.action === "walk" ? 0.025 : 0.012);
            if (w.chart && w.action !== "readChart") w.chart.rotation.x = -0.36;
            if (
              w.chart &&
              w.role === "nurse" &&
              w.action !== "clinicNurseExamStand"
            )
              w.chart.visible = false;
            if (
              w.phone &&
              w.action !== "counterScan" &&
              w.action !== "doorScan" &&
              w.action !== "lobbyScan" &&
              w.action !== "sit"
            )
              w.phone.visible = false;
            if (
              w.scanBadge &&
              w.action !== "counterScan" &&
              w.action !== "doorScan" &&
              w.action !== "lobbyScan"
            )
              w.scanBadge.visible = false;
            // Clear any tilt left by a previous interaction before animating this frame.
            w.group.rotation.x = 0;
            w.group.rotation.z = 0;
            if (w.group.userData.pharmacyWorking) {
              const index = w.group.userData.workIndex || 0,
                rawPhase =
                  (t + (w.group.userData.pharmacyPhaseOffset || 0)) % 41.2,
                // The seven-second packing phase is held for seven extra seconds.
                // Walking interpolation keeps its original duration, while the
                // hand/head animation continues to use real time at normal speed.
                phase =
                  rawPhase < 13.2
                    ? rawPhase
                    : rawPhase < 20.2
                      ? 13.1
                      : rawPhase - 7,
                shelf = pharmacyShelfWorkPoints[index],
                bench = pharmacyBenchWorkPoints[index],
                transferPath = pharmacyTransferPaths[index],
                medicine = w.group.userData.medicinePack as THREE.Object3D,
                bag = w.group.userData.medicineBag as THREE.Object3D;
              let walking = false;
              w.group.userData.handingBag = false;
              if (phase >= 8 && phase < 25.2)
                bag.position.set(0, 0.9, -0.44);
              else bag.position.set(-0.22, 0.85, -0.44);
              if (phase < 3.2) {
                w.group.position.copy(shelf);
                faceSmooth(
                  w.group,
                  new THREE.Vector3(shelf.x, 0, pharmacyShelfZ),
                  0.2,
                );
                medicine.visible = phase > 1.45;
                bag.visible = false;
                w.arms[0].rotation.x = 0.72 + Math.sin(t * 3.4 + index) * 0.18;
                w.arms[1].rotation.x = 1.04 + Math.sin(t * 3.1 + index) * 0.2;
                w.headRig.rotation.x = 0.1 + Math.sin(t * 1.8 + index) * 0.05;
              } else if (phase < 6.2) {
                const q = (phase - 3.2) / 3;
                w.group.position.lerpVectors(shelf, bench, q);
                faceSmooth(w.group, bench, 0.24);
                medicine.visible = true;
                bag.visible = false;
                walking = true;
              } else if (phase < 13.2) {
                w.group.position.copy(bench);
                faceSmooth(w.group, new THREE.Vector3(bench.x, 0, -8.4), 0.2);
                medicine.visible = phase < 8.1;
                bag.visible = phase > 8;
                w.arms[0].rotation.x = 0.94 + Math.sin(t * 3.6 + index) * 0.22;
                w.arms[1].rotation.x =
                  0.82 + Math.sin(t * 3.6 + index + Math.PI) * 0.18;
                w.headRig.rotation.x = 0.12 + Math.sin(t * 2 + index) * 0.05;
              } else if (phase < 22.2) {
                const q = (phase - 13.2) / 9,
                  current = pointOnRoute(transferPath, q),
                  ahead = pointOnRoute(transferPath, Math.min(1, q + 0.025));
                w.group.position.copy(current);
                faceSmooth(w.group, ahead, 0.24);
                medicine.visible = false;
                bag.visible = true;
                walking = true;
              } else if (phase < 25.2) {
                w.group.position.copy(transferPath[transferPath.length - 1]);
                faceSmooth(w.group, counterNursePoint, 0.22);
                medicine.visible = false;
                bag.visible = true;
                w.group.userData.handingBag = true;
                w.arms[0].rotation.x = 1.02;
                w.arms[0].rotation.z = 0.26;
                w.arms[1].rotation.x = 1.02;
                w.arms[1].rotation.z = -0.26;
                w.headRig.rotation.x = 0.05 + Math.sin(t * 2 + index) * 0.04;
              } else {
                const q = (phase - 25.2) / 9,
                  returnPath = [...transferPath].reverse(),
                  current = pointOnRoute(returnPath, q),
                  ahead = pointOnRoute(returnPath, Math.min(1, q + 0.025));
                w.group.position.copy(current);
                faceSmooth(w.group, ahead, 0.24);
                medicine.visible = false;
                bag.visible = false;
                walking = true;
              }
              if (walking) {
                const pharmacyGait = t * (4.1 + index * 0.22);
                w.legs[0].rotation.x = Math.sin(pharmacyGait) * 0.3;
                w.legs[1].rotation.x = -Math.sin(pharmacyGait) * 0.3;
                if (bag.visible && phase < 25.2) {
                  // The prepared bag stays centred between both palms for the
                  // entire walk to reception and during the handoff.
                  w.arms[0].rotation.x = 1.02;
                  w.arms[0].rotation.z = 0.26;
                  w.arms[1].rotation.x = 1.02;
                  w.arms[1].rotation.z = -0.26;
                } else {
                  // Once the bag is delivered, both arms immediately return to
                  // the ordinary alternating walking cycle.
                  w.arms[0].rotation.x = -Math.sin(pharmacyGait) * 0.18;
                  w.arms[0].rotation.z = 0;
                  w.arms[1].rotation.x = Math.sin(pharmacyGait) * 0.18;
                  w.arms[1].rotation.z = 0;
                }
              } else {
                w.legs[0].rotation.x = 0;
                w.legs[1].rotation.x = 0;
              }
              return;
            }
            if (w.action === "walk" && w !== receptionNurse) {
              resetUpperPose(w);
              if (w.chart) w.chart.visible = w.role === "doctor";
            }
            if (w.role === "patient" && !hasExclusivePatientTransit(w)) {
              if (w.action === "walk") {
                const origin = w.group.userData.patientWindowOrigin as
                  | THREE.Vector3
                  | undefined;
                if (!origin) {
                  w.group.userData.patientWindowOrigin =
                    w.group.position.clone();
                  w.group.userData.patientWindowTime = 0;
                } else if (w.group.position.distanceTo(origin) > 0.38) {
                  origin.copy(w.group.position);
                  w.group.userData.patientWindowTime = 0;
                } else
                  w.group.userData.patientWindowTime =
                    (w.group.userData.patientWindowTime || 0) + dt;
                if ((w.group.userData.patientWindowTime || 0) > 1.2) {
                  if (w.group.userData.seatGoal)
                    w.group.userData.seatNoMotion = 2.01;
                  else if (
                    w.group.userData.consultState === "inbound" &&
                    w.group.userData.consultPath
                  )
                    w.group.userData.calledNoProgress = 1.21;
                  else if (
                    (w.group.userData.consultState === "leaving" ||
                      w.group.userData.consultState === "toExam") &&
                    w.group.userData.consultPath
                  )
                    w.group.userData.clinicNoProgress = 1.21;
                  else if (w.group.userData.qrGoal) {
                    delete w.group.userData.qrGoal;
                    delete w.group.userData.qrStation;
                    w.group.userData.qrQueueIndex =
                      ((w.group.userData.qrQueueIndex || 0) + 1 + i) %
                      qrQueuePoints.length;
                    w.group.userData.qrQueueGoal =
                      qrQueuePoints[w.group.userData.qrQueueIndex].clone();
                    delete w.group.userData.navPath;
                    delete w.group.userData.navTarget;
                    delete w.group.userData.detourGoal;
                    delete w.group.userData.yieldGoal;
                    w.pause = 0;
                  } else if (w.group.userData.qrQueueGoal) {
                    w.group.userData.qrQueueIndex =
                      ((w.group.userData.qrQueueIndex || 0) + 1 + i) %
                      qrQueuePoints.length;
                    w.group.userData.qrQueueGoal =
                      qrQueuePoints[w.group.userData.qrQueueIndex].clone();
                    delete w.group.userData.navPath;
                    delete w.group.userData.navTarget;
                    delete w.group.userData.detourGoal;
                    delete w.group.userData.yieldGoal;
                    w.pause = 0;
                  } else rerouteStalledWalker(w, i);
                  w.group.userData.patientWindowOrigin =
                    w.group.position.clone();
                  w.group.userData.patientWindowTime = 0;
                }
              } else {
                delete w.group.userData.patientWindowOrigin;
                w.group.userData.patientWindowTime = 0;
              }
            }
            const activeSeatGoal =
              w.role === "patient" && w.action === "walk"
                ? (w.group.userData.seatGoal as THREE.Vector3 | undefined)
                : undefined;
            if (activeSeatGoal) {
              const distance = w.group.position.distanceTo(activeSeatGoal),
                best = w.group.userData.seatApproachBestDistance ?? Infinity,
                motionAnchor = w.group.userData.seatMotionAnchor as
                  | THREE.Vector3
                  | undefined,
                moved = motionAnchor
                  ? w.group.position.distanceTo(motionAnchor)
                  : 0;
              w.group.userData.seatApproachTime =
                (w.group.userData.seatApproachTime || 0) + dt;
              if (!motionAnchor)
                w.group.userData.seatMotionAnchor = w.group.position.clone();
              else if (moved > 0.045) {
                motionAnchor.copy(w.group.position);
                w.group.userData.seatNoMotion = 0;
              } else
                w.group.userData.seatNoMotion =
                  (w.group.userData.seatNoMotion || 0) + dt;
              if (distance < best - 0.025) {
                w.group.userData.seatApproachBestDistance = distance;
                w.group.userData.seatApproachStallTime = 0;
              } else
                w.group.userData.seatApproachStallTime =
                  (w.group.userData.seatApproachStallTime || 0) + dt;
              if (distance < 0.09) {
                finishLobbySit(w);
                return;
              }
              if (
                (w.group.userData.seatNoMotion || 0) > 2 ||
                (distance < 1.55 &&
                  (w.group.userData.seatApproachStallTime || 0) > 2)
              ) {
                const previousSeat = w.seatId;
                delete w.group.userData.seatGoal;
                delete w.group.userData.seatApproach;
                delete w.group.userData.seatApproachTime;
                delete w.group.userData.seatApproachStallTime;
                delete w.group.userData.seatApproachBestDistance;
                delete w.group.userData.seatMotionAnchor;
                delete w.group.userData.seatNoMotion;
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                delete w.group.userData.detourGoal;
                delete w.group.userData.yieldGoal;
                if (previousSeat !== undefined)
                  w.group.userData.avoidSeatId = previousSeat;
                w.group.userData.pendingSeatAfterScan = true;
                w.group.userData.seatRetryCooldown = 0.35;
                w.group.userData.leavingSeat = true;
                w.group.userData.allowSeatAccess = true;
                const release = seatExitPoint(w) || chooseReleasePoint(w);
                if (release) w.group.userData.detourGoal = release;
                w.pause = 0;
              }
            }
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              w.group.userData.visitPhase === "postClinicWait" &&
              !w.group.userData.consultPath &&
              !w.group.userData.lifecyclePath &&
              !w.group.userData.seatGoal &&
              !w.group.userData.pendingSeatAfterScan &&
              !w.group.userData.leavingSeat
            ) {
              // First 6–12 second phone sit after consultation, before the
              // required public lobby QR scan.
              reserveSeatAfterScan(w);
            }
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              w.group.userData.consultState === "inbound" &&
              w.group.userData.consultPath &&
              !w.group.userData.waitingForClinicNurse
            ) {
              const anchor = w.group.userData.calledProgressAnchor as
                  | THREE.Vector3
                  | undefined,
                moved = anchor ? w.group.position.distanceTo(anchor) : 0;
              w.group.userData.calledElapsed =
                (w.group.userData.calledElapsed || 0) + dt;
              if (!anchor)
                w.group.userData.calledProgressAnchor =
                  w.group.position.clone();
              else if (moved > 0.055) {
                anchor.copy(w.group.position);
                w.group.userData.calledNoProgress = 0;
              } else
                w.group.userData.calledNoProgress =
                  (w.group.userData.calledNoProgress || 0) + dt;
              if ((w.group.userData.calledNoProgress || 0) > 1.2) {
                const room = (w.group.userData.consultRoom || 1) - 1,
                  nearSeat = occupiesAssignedLobbySeat(w);
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                delete w.group.userData.detourGoal;
                delete w.group.userData.yieldGoal;
                if (nearSeat) {
                  w.group.userData.leavingSeat = true;
                  w.group.userData.allowSeatAccess = true;
                  const exit = seatExitPoint(w);
                  if (exit) w.group.userData.detourGoal = exit;
                } else {
                  delete w.group.userData.leavingSeat;
                  delete w.group.userData.allowSeatAccess;
                  const rebuilt = inboundClinicPathFromCurrent(w, room),
                    escape = escapeStep(w, rebuilt[0]);
                  // Keep every recovery waypoint inside the owned consultation
                  // path. A generic detourGoal is intentionally ignored during
                  // exclusive clinic transit and used to leave patients visibly
                  // stopped despite repeated "recovery" attempts.
                  w.group.userData.consultPath = escape
                    ? [escape, ...rebuilt]
                    : rebuilt;
                }
                w.group.userData.calledNoProgress = 0;
                w.group.userData.calledProgressAnchor =
                  w.group.position.clone();
                w.group.userData.navAvoidPeople = true;
                w.pause = 0;
              }
            }
            if (
              w.role === "patient" &&
              !hasExclusivePatientTransit(w) &&
              w.action === "walk" &&
              (w.group.userData.consultState === "leaving" ||
                w.group.userData.consultState === "toExam") &&
              w.group.userData.consultPath
            ) {
              const anchor = w.group.userData.clinicMotionAnchor as
                  | THREE.Vector3
                  | undefined,
                moved = anchor ? w.group.position.distanceTo(anchor) : 0;
              if (!anchor)
                w.group.userData.clinicMotionAnchor = w.group.position.clone();
              else if (moved > 0.055) {
                anchor.copy(w.group.position);
                w.group.userData.clinicNoProgress = 0;
              } else
                w.group.userData.clinicNoProgress =
                  (w.group.userData.clinicNoProgress || 0) + dt;
              if ((w.group.userData.clinicNoProgress || 0) > 1.2) {
                const room = (w.group.userData.consultRoom || 1) - 1,
                  toExam = w.group.userData.consultState === "toExam";
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                delete w.group.userData.detourGoal;
                delete w.group.userData.yieldGoal;
                if (toExam)
                  w.group.userData.consultPath = [
                    clinicPatientSeatControls[room].clone(),
                    clinicExamApproaches[room].clone(),
                    clinicBedWallPoints[room].clone(),
                    clinicBedSidePoints[room].clone(),
                  ];
                else
                  // Every patient scans at the same desk-side control point before
                  // leaving, including patients who used the bed. Rebuilding from
                  // the old bed origin sent them backwards through the room.
                  w.group.userData.consultPath = [
                    clinicPatientSeatApproaches[room].clone(),
                    clinicDoorInsidePoints[room].clone(),
                    clinicDoorCenterPoints[room].clone(),
                    doorOutside[room].clone(),
                  ];
                w.group.userData.clinicMotionAnchor = w.group.position.clone();
                w.group.userData.clinicNoProgress = 0;
                w.group.userData.navAvoidPeople = true;
                w.pause = 0;
              }
            }
            const doorTransitActive = isActiveDoorTransit(w),
              revolvingDoorTransitActive = !!(
                w.group.userData.revolvingDoorTransit &&
                w.group.userData.revolvingDoorMode
              ),
              insideDoorLane =
                doorTransitActive && inAssignedDoorPortal(w, w.group.position),
              insideRevolvingDoorLane =
                revolvingDoorTransitActive &&
                inAutomaticDoorTransitLane(w, w.group.position);
            if (
              w.action === "walk" &&
              w !== receptionNurse &&
              !insideDoorLane &&
              !insideRevolvingDoorLane &&
              (!boundaryClear(w, w.group.position) ||
                navBlocked(w, w.group.position, 0.34, seatObstacleAccess(w)))
            ) {
              const lastSafe = w.group.userData.lastSafePosition as
                | THREE.Vector3
                | undefined;
              if (lastSafe) {
                const back = lastSafe.clone().sub(w.group.position),
                  distance = back.length();
                if (distance > 0.025) {
                  back.normalize();
                  w.group.position.addScaledVector(
                    back,
                    Math.min(distance, w.speed * dt * 0.72),
                  );
                  faceSmooth(w.group, lastSafe, 0.2);
                  const recoveryGait =
                    t * w.group.userData.gaitRate + w.group.userData.gaitPhase;
                  w.legs[0].rotation.x = Math.sin(recoveryGait) * 0.3;
                  w.legs[1].rotation.x = -Math.sin(recoveryGait) * 0.3;
                  return;
                }
              }
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
              w.group.userData.navAvoidPeople = true;
            }
            if (doorTransitActive || revolvingDoorTransitActive) {
              delete w.group.userData.detourGoal;
              delete w.group.userData.yieldGoal;
              w.group.userData.idleTime = 0;
              w.group.userData.blockedTime = 0;
              if (revolvingDoorTransitActive) {
                // The reserved compartment owns this route.  Generic obstacle
                // recovery previously pulled the walker back to lastSafePosition
                // on every frame because the drum itself is an obstacle.
                w.speed = revolvingDoorTransitSpeed;
                w.pause = 0;
              }
              if (doorTransitActive)
                w.group.userData.consultTransitTime =
                  (w.group.userData.consultTransitTime || 0) + dt;
            } else w.group.userData.consultTransitTime = 0;
            if (
              doorTransitActive &&
              w.role === "patient" &&
              w.group.userData.consultState === "inbound" &&
              w.group.userData.consultTransitTime > 4
            ) {
              const room = assignedDoorIndex(w);
              w.group.userData.consultPath =
                inboundClinicPathFromCurrent(w, room);
              w.group.userData.consultTransitTime = 0;
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
              w.pause = 0;
            }
            const waitingCounterQueuePosition =
                w.role === "patient" ? counterQueuePosition(w) : -1,
              intentionallyWaitingForCounter = !!(
                w.role === "patient" &&
                w.group.userData.counterQueueWaiting &&
                waitingCounterQueuePosition > 0 &&
                w.group.position.distanceTo(counterQueueHoldingGoal(w)) < 0.38
              ),
              progressAnchor = w.group.userData.progressAnchor as
              | THREE.Vector3
              | undefined;
            if (!progressAnchor) {
              w.group.userData.progressAnchor = w.group.position.clone();
              w.group.userData.idleTime = 0;
            } else if (
              w.action === "walk" &&
              w !== receptionNurse &&
              !intentionallyWaitingForCounter
            ) {
              const progressed = w.group.position.distanceTo(progressAnchor);
              if (progressed > 0.075) {
                progressAnchor.copy(w.group.position);
                w.group.userData.idleTime = 0;
                w.group.userData.stallProgress =
                  (w.group.userData.stallProgress || 0) + progressed;
                if (w.group.userData.stallProgress > 0.8) {
                  w.group.userData.stallRecoveries = 0;
                  w.group.userData.stallProgress = 0;
                }
              } else if (
                !doorTransitActive &&
                !revolvingDoorTransitActive
              )
                w.group.userData.idleTime =
                  (w.group.userData.idleTime || 0) + dt;
              if (
                !doorTransitActive &&
                !revolvingDoorTransitActive &&
                !hasExclusivePatientTransit(w) &&
                w.group.userData.idleTime >= 1.2 &&
                t - (w.group.userData.lastRecoveryAt || -10) > 0.32
              ) {
                rerouteStalledWalker(w, i);
                w.group.userData.stallProgress = 0;
                w.group.userData.lastRecoveryAt = t;
              }
            } else {
              progressAnchor.copy(w.group.position);
              w.group.userData.idleTime = 0;
            }
            // The reception nurse faces the lobby while typing; positive arm pitch keeps both hands above the front work surface.
            if (w === receptionNurse) {
              const pickupGuest = patients.find(
                  (p) => p.action === "medicinePickup",
                ),
                handoffPharmacist = pharmacyStaff.find(
                  (p) => p.group.userData.handingBag,
                ),
                guest =
                  pickupGuest ||
                  patients.find((p) => p.action === "counterTalk");
              counterHandoffBag.visible = false;
              w.group.position.set(
                Math.sin(t * 0.45) * 0.16,
                Math.sin(t * 2.2) * 0.012,
                receptionNurseZ,
              );
              if (guest) {
                faceFlat(w.group, guest.group.position);
                const activelyHandingMedicine =
                  !!pickupGuest &&
                  pickupGuest.actionTime >= 0.35 &&
                  pickupGuest.actionTime < 1.85;
                w.arms[0].rotation.x = activelyHandingMedicine
                  ? 1.06
                  : 0.88 + Math.sin(t * 3.8) * 0.12;
                w.arms[0].rotation.z = activelyHandingMedicine ? -0.3 : -0.48;
                w.arms[1].rotation.x = activelyHandingMedicine
                  ? 1.06
                  : 0.68 + Math.sin(t * 3.8 + Math.PI) * 0.1;
                w.arms[1].rotation.z = activelyHandingMedicine ? 0.3 : 0;
                if (
                  pickupGuest &&
                  pickupGuest.actionTime >= 0.35 &&
                  pickupGuest.actionTime < 1.85
                ) {
                  const q = THREE.MathUtils.smoothstep(
                      (pickupGuest.actionTime - 0.35) / 1.5,
                      0,
                      1,
                    ),
                    start = new THREE.Vector3(
                      w.group.position.x,
                      1.64,
                      -3.28,
                    ),
                    finish = pickupGuest.group.position
                      .clone()
                      .add(new THREE.Vector3(0, 1.2, -0.28));
                  counterHandoffBag.visible = true;
                  counterHandoffBag.position.lerpVectors(start, finish, q);
                  counterHandoffBag.position.y += Math.sin(q * Math.PI) * 0.26;
                  // The nurse presents the bag face-up over the counter. It stays
                  // horizontal until both of the patient's hands have received it.
                  counterHandoffBag.rotation.set(
                    -Math.PI / 2,
                    w.group.rotation.y,
                    Math.sin(q * Math.PI) * 0.045,
                  );
                }
              } else if (handoffPharmacist) {
                faceFlat(w.group, handoffPharmacist.group.position);
                w.arms[0].rotation.x = 0.78;
                w.arms[0].rotation.z = -0.42;
                w.arms[1].rotation.x = 0.66;
                w.headRig.rotation.y = Math.sin(t * 3) * 0.05;
              } else {
                w.arms[0].rotation.x = 1.08 + Math.sin(t * 7) * 0.16;
                w.arms[1].rotation.x = 1.08 + Math.sin(t * 7 + Math.PI) * 0.16;
                w.group.rotation.y = Math.PI + Math.sin(t * 0.55) * 0.1;
              }
              return;
            }
            // A knock only calls a doctor out when no patient is actually inside that
            // clinic. A merely inbound patient is turned back by the availability
            // guard below once the doctor begins walking toward the door.
            if (w.role === "doctor" && w.group.userData.knockExit && w.room) {
              if (clinicHasPatient(w.room)) delete w.group.userData.knockExit;
              else if (
                w.action === "clinicSit" ||
                w.action === "readChart" ||
                (w.action === "wave" &&
                  w.group.userData.waveResume === "clinicSit") ||
                w.group.position.distanceTo(clinicDoctorSeats[w.room - 1]) <
                  3.25
              ) {
                startDoctorKnockExit(w);
                return;
              }
            }
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              w.group.userData.pendingSeatAfterScan &&
              !w.group.userData.consultPath &&
              !w.group.userData.seatGoal &&
              !w.group.userData.leavingSeat &&
              !w.group.userData.detourGoal &&
              w.group.userData.seatRetryCooldown <= 0
            ) {
              if (!reserveSeatAfterScan(w) && !w.group.userData.qrQueueGoal)
                w.group.userData.qrQueueGoal =
                  qrQueuePoints[
                    (i + Math.floor(t / 3)) % qrQueuePoints.length
                  ].clone();
            }
            // Payment is a dedicated, serialized patient step. The first patient
            // waiting claims the machine and walks directly to its screen; no
            // lobby roaming or counter queue can interrupt this route.
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              w.group.userData.visitPhase === "paymentQueue" &&
              !w.group.userData.lifecyclePath &&
              !w.group.userData.consultPath &&
              (paymentKioskOwner === null ||
                paymentKioskOwner === w.group.uuid)
            ) {
              paymentKioskOwner = w.group.uuid;
              paymentSuccessUntil = 0;
              w.group.userData.visitPhase = "payment";
              w.group.userData.lifecyclePath = [kioskApproachPoint.clone()];
              w.group.userData.navAvoidPeople = true;
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
              delete w.group.userData.detourGoal;
              delete w.group.userData.yieldGoal;
              w.pause = 0;
            }
            // Check-in and medicine pickup share the public counter but are serialized,
            // so every patient visibly speaks to the nurse from the lobby side.
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              w.group.userData.counterScanPending &&
              !w.group.userData.lifecyclePath &&
              w.group.position.distanceTo(counterQrApproachPoint) < 0.1
            ) {
              w.group.position.copy(counterQrApproachPoint);
              w.action = "counterScan";
              w.actionTime = 0;
              w.pause = 0;
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
            }
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              w.group.userData.counterClaimed &&
              // Entering the service footprint is sufficient. Requiring the
              // final path array to be empty let a patient stand visibly at the
              // counter forever when navigation retained one tiny endpoint.
              w.group.position.distanceTo(counterPublicPoint) < 0.16
            ) {
              delete w.group.userData.lifecyclePath;
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
              delete w.group.userData.detourGoal;
              delete w.group.userData.yieldGoal;
              if (w.group.userData.visitPhase === "checkin") {
                w.action = "counterTalk";
                w.actionTime = 0;
                w.pause = 0;
              } else if (w.group.userData.visitPhase === "pickupQueue") {
                w.group.userData.visitPhase = "pickup";
                w.action = "medicinePickup";
                w.actionTime = 0;
                w.pause = 0;
              }
            }
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              (w.group.userData.visitPhase === "checkin" ||
                w.group.userData.visitPhase === "pickupQueue") &&
              !w.group.userData.counterClaimed &&
              !w.group.userData.consultPath
            ) {
              const queuePosition = counterQueuePosition(w);
              if (queuePosition > 0 && !w.group.userData.pickupSeatExit) {
                const holdingGoal = counterQueueHoldingGoal(w),
                  holdingDistance = w.group.position.distanceTo(holdingGoal),
                  existingQueuePath = w.group.userData.lifecyclePath as
                    | THREE.Vector3[]
                    | undefined;
                if (holdingDistance > 0.08) {
                  delete w.group.userData.counterQueueWaiting;
                  if (
                    !existingQueuePath?.length ||
                    existingQueuePath[existingQueuePath.length - 1].distanceTo(
                      holdingGoal,
                    ) > 0.08
                  ) {
                    w.group.userData.lifecyclePath = [holdingGoal.clone()];
                    w.group.userData.navAvoidPeople = true;
                    delete w.group.userData.navPath;
                    delete w.group.userData.navTarget;
                    delete w.group.userData.detourGoal;
                    delete w.group.userData.yieldGoal;
                    w.pause = 0;
                  }
                } else {
                  w.group.position.copy(holdingGoal);
                  faceSmooth(w.group, counterPublicPoint, 0.26);
                  w.group.userData.counterQueueWaiting = true;
                  w.group.userData.idleTime = 0;
                  w.group.userData.progressAnchor = w.group.position.clone();
                  delete w.group.userData.lifecyclePath;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                  delete w.group.userData.detourGoal;
                  delete w.group.userData.yieldGoal;
                  w.pause = 0.18;
                  return;
                }
              } else delete w.group.userData.counterQueueWaiting;
            }
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              (w.group.userData.visitPhase === "checkin" ||
                w.group.userData.visitPhase === "pickupQueue") &&
              !w.group.userData.consultPath &&
              !w.group.userData.counterClaimed &&
              counterQueuePosition(w) === 0 &&
              !counterIsBusy(w)
            ) {
              // Becoming first in line invalidates any old holding-point path.
              // Claim the counter immediately and replace that stale route so
              // the head patient can never freeze everybody behind them.
              w.group.userData.counterClaimed = true;
              delete w.group.userData.counterQueueWaiting;
              delete w.group.userData.pickupAtQueue;
              w.group.userData.lifecyclePath = [counterPublicPoint.clone()];
              w.group.userData.navAvoidPeople = true;
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
              delete w.group.userData.detourGoal;
              delete w.group.userData.yieldGoal;
              w.action = "walk";
              w.actionTime = 0;
              w.pause = 0;
            }
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              (w.group.userData.visitPhase === "checkin" ||
                w.group.userData.visitPhase === "pickupQueue") &&
              w.group.userData.counterClaimed
            ) {
              const counterPath = w.group.userData.lifecyclePath as
                  | THREE.Vector3[]
                  | undefined,
                onFinalCounterSegment =
                  counterPath?.length === 1 &&
                  counterPath[0].distanceTo(counterPublicPoint) < 0.08,
                counterDistance =
                  w.group.position.distanceTo(counterPublicPoint);
              if (onFinalCounterSegment && counterDistance < 1.05) {
                // The last metre in front of reception is a serialized handoff
                // lane. Finish it with a small visible forward walk instead of
                // letting generic crowd avoidance repeatedly replan around the
                // counter target and leave the patient standing there forever.
                const direction = counterPublicPoint
                    .clone()
                    .sub(w.group.position),
                  step = Math.min(direction.length(), w.speed * dt * 0.82);
                direction.y = 0;
                if (direction.lengthSq() > 0.0001) {
                  direction.normalize();
                  const candidate = w.group.position
                    .clone()
                    .addScaledVector(direction, step);
                  if (peopleStepClear(candidate, w, 0.42)) {
                    w.group.position.copy(candidate);
                    w.group.userData.lastSafePosition = candidate.clone();
                    faceSmooth(
                      w.group,
                      w.group.position.clone().add(direction),
                      w.group.userData.turnRate,
                    );
                    const gait =
                      t * w.group.userData.gaitRate +
                      w.group.userData.gaitPhase;
                    w.legs[0].rotation.x = Math.sin(gait) * 0.34;
                    w.legs[1].rotation.x = -Math.sin(gait) * 0.34;
                    w.arms[0].rotation.x = -Math.sin(gait) * 0.22;
                    w.arms[1].rotation.x = Math.sin(gait) * 0.22;
                  }
                }
                if (w.group.position.distanceTo(counterPublicPoint) < 0.06) {
                  w.group.position.copy(counterPublicPoint);
                  delete w.group.userData.lifecyclePath;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                  if (w.group.userData.visitPhase === "pickupQueue") {
                    w.group.userData.visitPhase = "pickup";
                    w.action = "medicinePickup";
                  } else w.action = "counterTalk";
                  w.actionTime = 0;
                  w.pause = 0;
                }
                return;
              }
            }
            // During the ordinary waiting loop, patients may use any available QR
            // stand in the lobby. Post-consultation scans use the locked branch below.
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              w.group.userData.visitPhase === "queue" &&
              !w.group.userData.consultPath &&
              !w.group.userData.lifecyclePath &&
              !w.group.userData.seatGoal &&
              !w.group.userData.pendingSeatAfterScan &&
              !w.group.userData.leavingSeat &&
              w.group.userData.queueCycleCooldown <= 0
            ) {
              if (!w.group.userData.qrGoal) {
                if (!claimLobbyQrStation(w) && !w.group.userData.qrQueueGoal)
                  w.group.userData.qrQueueGoal =
                    qrQueuePoints[
                      (i + Math.floor(t / 2.4)) % qrQueuePoints.length
                    ].clone();
              }
              const queueQr = w.group.userData.qrGoal as
                  | THREE.Vector3
                  | undefined,
                scanPipeline =
                  lobbySeatPipelineCount() +
                  patients.filter((p) => p.action === "lobbyScan").length;
              if (
                queueQr &&
                w.group.position.distanceTo(queueQr) < 0.3 &&
                scanPipeline < 7
              ) {
                w.action = "lobbyScan";
                w.actionTime = 0;
                w.pause = 0;
              }
            }
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              w.group.userData.visitPhase === "postLobbyScan" &&
              !w.group.userData.consultPath &&
              !w.group.userData.lifecyclePath &&
              !w.group.userData.seatGoal &&
              !w.group.userData.pendingSeatAfterScan &&
              !w.group.userData.leavingSeat
            ) {
              if (!w.group.userData.qrGoal) {
                if (!claimLobbyQrStation(w) && !w.group.userData.qrQueueGoal)
                  w.group.userData.qrQueueGoal =
                    qrQueuePoints[
                      (i + Math.floor(t / 2.15)) % qrQueuePoints.length
                    ].clone();
              }
              const postQr = w.group.userData.qrGoal as
                  | THREE.Vector3
                  | undefined,
                scanPipeline =
                  lobbySeatPipelineCount() +
                  patients.filter((p) => p.action === "lobbyScan").length;
              if (
                postQr &&
                w.group.position.distanceTo(postQr) < 0.3 &&
                scanPipeline < 7
              ) {
                w.action = "lobbyScan";
                w.actionTime = 0;
                w.pause = 0;
              }
            }
            const reachedQrQueue =
              w.role === "patient" &&
              w.action === "walk" &&
              (w.group.userData.visitPhase === "queue" ||
                w.group.userData.visitPhase === "postLobbyScan")
                ? (w.group.userData.qrQueueGoal as THREE.Vector3 | undefined)
                : undefined;
            if (
              reachedQrQueue &&
              w.group.position.distanceTo(reachedQrQueue) < 0.3
            ) {
              delete w.group.userData.qrQueueGoal;
              claimLobbyQrStation(w);
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
              w.pause = 0;
            }
            // An inbound patient may cross a clinic doorway only while that room's
            // doctor is actually seated inside. If availability changes, the patient
            // turns around at the lobby-side door point instead of entering alone.
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              w.group.userData.consultState === "inbound" &&
              w.group.userData.consultPath
            ) {
              const doctor = doctors.find(
                  (d) => d.group.uuid === w.group.userData.consultDoctor,
                ),
                available =
                  doctor &&
                  (doctor.action === "clinicSit" ||
                    (doctor.action === "wave" &&
                      doctor.group.userData.waveResume === "clinicSit"));
              if (!available) {
                const room = (w.group.userData.consultRoom || 1) - 1;
                setCallScreen(room + 1);
                clearCalledPatientTask(w);
                w.group.userData.visitPhase = "queue";
                w.group.userData.consultPath = [doorOutside[room].clone()];
                w.group.userData.consultState = "leaving";
                delete w.group.userData.consultDoctor;
                delete w.group.userData.calledScreenRoom;
                delete w.group.userData.calledProgressAnchor;
                delete w.group.userData.calledNoProgress;
                delete w.group.userData.calledElapsed;
                w.pause = 0;
              }
            }
            if (
              w.role === "patient" &&
              w.action === "walk" &&
              w.group.userData.visitPhase === "clinicScan" &&
              !w.group.userData.consultPath
            ) {
              const room = (w.group.userData.consultRoom || 1) - 1;
              if (
                w.group.position.distanceTo(clinicPatientSeatControls[room]) >
                0.32
              ) {
                w.group.userData.consultState = "clinicScan";
                w.group.userData.consultPath = [
                  clinicPatientSeatControls[room].clone(),
                ];
                w.group.userData.navAvoidPeople = true;
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
              } else {
                w.action = "clinicScan";
                w.actionTime = 0;
                w.pause = 0;
              }
            }
            if (
              w.action === "walk" &&
              w.role !== "doctor" &&
              !hasExclusivePatientTransit(w) &&
              !w.group.userData.consultPath &&
              !w.group.userData.clinicStaffPath &&
              !w.group.userData.seatGoal &&
              !w.group.userData.yieldGoal &&
              doors.some(
                (d) => w.group.position.distanceTo(d.pivot.position) < 2.55,
              )
            ) {
              w.group.userData.yieldGoal = chooseReleasePoint(w);
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
              w.group.userData.navAvoidPeople = true;
            }
            // Knocked doctors finish the entire doorway crossing before greeting. The
            // old proximity trigger could freeze a waving doctor inside the frame.
            if (
              w.role === "doctor" &&
              w.action === "walk" &&
              w.readCooldown <= 0 &&
              w.pause <= 0 &&
              w.group.userData.doctorPathMode === "interior" &&
              !doors.some(
                (d) => w.group.position.distanceTo(d.pivot.position) < 2.5,
              ) &&
              Math.random() < dt * 0.08
            ) {
              w.action = "readChart";
              w.actionTime = 0;
              w.group.userData.returnToClinicAfterRead = true;
              w.readCooldown = 10 + Math.random() * 7;
            }
            if (w.action !== "walk") {
              const seatedWave =
                w.action === "wave" &&
                w.group.userData.waveResume === "clinicSit";
              w.actionTime += dt;
              if (
                w.action !== "sit" &&
                w.action !== "clinicSit" &&
                w.action !== "consultSit" &&
                !seatedWave
              )
                w.legs.forEach((l) => (l.rotation.x = 0));
              if (w.action === "wave") {
                if (seatedWave)
                  poseSeated(w, clinicDoctorYaws[(w.room || 1) - 1]);
                else poseStanding(w);
                faceFlat(w.group, camera.position);
                if (w.group.userData.eyeAssistant) {
                  // Keep the arm mesh origin anchored at the shoulder. Only its
                  // tip sweeps through a clear 60–90° greeting arc, avoiding the
                  // previous shoulder-scratching silhouette.
                  w.arms[0].rotation.set(0, 0, 0);
                  w.arms[1].rotation.x = 0;
                  w.arms[1].rotation.y = 0;
                  w.arms[1].rotation.z = THREE.MathUtils.degToRad(
                    75 + Math.sin(t * 5.4) * 15,
                  );
                  w.headRig.rotation.y = Math.sin(t * 3.2) * 0.05;
                } else {
                  w.arms[0].rotation.x = 0.86;
                  w.arms[0].rotation.z = 0.34;
                  w.arms[1].rotation.x = Math.sin(t * 8) * 0.28;
                  w.arms[1].rotation.z = 2.35 + Math.sin(t * 8) * 0.16;
                  w.headRig.rotation.y = Math.sin(t * 4) * 0.08;
                }
                if (w.actionTime > 2.25) {
                  const greetedDoor = !!w.group.userData.doorGreeting,
                    requestedResume =
                      w.group.userData.waveResume === "clinicSit"
                        ? "clinicSit"
                        : w.group.userData.waveResume === "socialTalk"
                          ? "socialTalk"
                          : "walk",
                    pausedTalkPartner = walkers.find(
                      (candidate) =>
                        candidate.group.uuid ===
                        w.group.userData.waveTalkPartner,
                    ),
                    canResumeTalk = !!(
                      requestedResume === "socialTalk" &&
                      pausedTalkPartner?.action === "socialTalk" &&
                      pausedTalkPartner.group.userData.talkPausedByEye ===
                        w.group.uuid
                    ),
                    resume =
                      requestedResume === "socialTalk" && !canResumeTalk
                        ? "walk"
                        : requestedResume;
                  resetUpperPose(w);
                  if (greetedDoor && w.role === "doctor") {
                    w.group.userData.doctorPath = [
                      w.route[4],
                      w.route[3],
                      w.route[2],
                      w.route[1],
                      w.route[0],
                    ].map((p) => p.clone());
                    w.group.userData.doctorPathMode = "knockReturn";
                    w.action = "walk";
                    w.actionTime = 0;
                  } else {
                    w.action = resume;
                    w.actionTime =
                      resume === "clinicSit"
                        ? w.group.userData.waveResumeTime || 0
                        : resume === "socialTalk"
                          ? w.group.userData.waveResumeTime || 0
                        : 0;
                  }
                  if (
                    w.group.userData.eyeAssistant &&
                    w.group.userData.waveNeedsRepath &&
                    w.action === "walk"
                  )
                    resumeClickedCharacterTask(w);
                  if (pausedTalkPartner)
                    delete pausedTalkPartner.group.userData.talkPausedByEye;
                  delete w.group.userData.waveResume;
                  delete w.group.userData.waveResumeTime;
                  delete w.group.userData.waveTalkPartner;
                  delete w.group.userData.waveNeedsRepath;
                  delete w.group.userData.doorGreeting;
                  w.pause = 0.15;
                }
              } else if (w.action === "readChart") {
                w.arms[0].rotation.x = 1.08;
                w.arms[0].rotation.z = 0.42;
                w.arms[1].rotation.x = 1.08;
                w.arms[1].rotation.z = -0.42;
                w.headRig.rotation.x = 0.2 + Math.sin(t * 5) * 0.11;
                w.headRig.rotation.z = Math.sin(t * 2.2) * 0.035;
                if (w.chart) {
                  w.chart.visible = true;
                  w.chart.rotation.x = -0.5 + Math.sin(t * 3) * 0.04;
                }
                if (w.actionTime > 2.05 + (i % 3) * 0.18) {
                  resetUpperPose(w);
                  w.action = "walk";
                  w.actionTime = 0;
                  w.pause = 0.08;
                  if (
                    w.role === "doctor" &&
                    w.group.userData.returnToClinicAfterRead
                  ) {
                    w.group.userData.doctorPath = [w.route[1], w.route[0]].map(
                      (p) => p.clone(),
                    );
                    w.group.userData.doctorPathMode = "return";
                    delete w.group.userData.returnToClinicAfterRead;
                  }
                }
              } else if (w.action === "socialTalk") {
                const partner = walkers.find(
                  (o) => o.group.uuid === w.group.userData.talkPartner,
                ),
                  enteredNoStopZone = !!(
                    partner && !conversationPairIsClear(w, partner)
                  ),
                  pausedByEyeGreeting = !!(
                    partner?.action === "wave" &&
                    partner.group.userData.eyeAssistant &&
                    partner.group.userData.waveResume === "socialTalk" &&
                    partner.group.userData.waveTalkPartner === w.group.uuid &&
                    w.group.userData.talkPausedByEye === partner.group.uuid
                  );
                if (
                  !partner ||
                  enteredNoStopZone ||
                  (partner.action !== "socialTalk" && !pausedByEyeGreeting)
                ) {
                  w.action = "walk";
                  w.actionTime = 0;
                  delete w.group.userData.talkPartner;
                  delete w.group.userData.talkDuration;
                  delete w.group.userData.talkPausedByEye;
                  w.pause = 0.08;
                } else if (pausedByEyeGreeting) {
                  // Freeze the conversation timer and both conversational poses
                  // while the eye helper briefly turns to greet the camera.
                  w.actionTime = Math.max(0, w.actionTime - dt);
                  resetUpperPose(w);
                  faceFlat(w.group, partner.group.position);
                } else {
                  faceFlat(w.group, partner.group.position);
                  const phase = t * 3.1 + i * 0.73;
                  w.arms[0].rotation.x = 0.38 + Math.sin(phase) * 0.28;
                  w.arms[0].rotation.z =
                    w.role === "nurse" || w.role === "assistant" ? 0.42 : 0.25;
                  w.arms[1].rotation.x =
                    0.32 + Math.sin(phase + Math.PI) * 0.22;
                  w.arms[1].rotation.z =
                    w.role === "nurse" || w.role === "assistant"
                      ? -0.28
                      : -0.18;
                  w.headRig.rotation.x = 0.06 + Math.sin(t * 3.4 + i) * 0.085;
                  w.headRig.rotation.y = Math.sin(t * 2.2 + i) * 0.07;
                  w.group.rotation.z = Math.sin(t * 2 + i) * 0.018;
                  if (w.actionTime > (w.group.userData.talkDuration || 6.5)) {
                    w.action = "walk";
                    w.actionTime = 0;
                    w.pause = 0.12;
                    w.arms.forEach((a) => a.rotation.set(0, 0, 0));
                    w.headRig.rotation.set(0, 0, 0);
                    delete w.group.userData.talkPartner;
                    delete w.group.userData.talkDuration;
                    if (partner.action === "socialTalk") {
                      partner.action = "walk";
                      partner.actionTime = 0;
                      partner.pause = 0.12;
                      partner.arms.forEach((a) => a.rotation.set(0, 0, 0));
                      partner.headRig.rotation.set(0, 0, 0);
                      delete partner.group.userData.talkPartner;
                      delete partner.group.userData.talkDuration;
                    }
                  }
                }
              } else if (w.action === "sit") {
                poseSeated(w, w.seatYaw ?? 0);
                const usingPhone =
                  w.role === "patient" && w.group.userData.hasScanned;
                if (usingPhone && w.phone) {
                  holdPhoneAtFace(w, t * 2.4 + i);
                  w.headRig.rotation.x = 0.06 + Math.sin(t * 2.25 + i) * 0.035;
                } else {
                  w.arms[0].rotation.x = 0.55;
                  w.arms[1].rotation.x = 0.55;
                  w.headRig.rotation.x = Math.sin(t * 2.1 + i) * 0.035;
                }
                if (
                  w.actionTime >=
                  Math.min(12, w.group.userData.sitDuration || 9)
                ) {
                  if (w.group.userData.visitPhase === "queue")
                    continueWaitingCycle(w);
                  else if (
                    w.group.userData.visitPhase === "postClinicWait"
                  )
                    beginPostConsultLobbyScan(w);
                  else if (w.group.userData.visitPhase === "postWait")
                    beginMedicinePickup(w, i);
                  else releaseLobbySitter(w);
                }
              } else if (w.action === "clinicSit") {
                const room = (w.room || 1) - 1;
                poseSeated(w, clinicDoctorYaws[room]);
                const roomNurse = clinicNurses[room],
                  guest = patients.find(
                    (p) => p.group.uuid === w.group.userData.consultPatient,
                  ),
                  busy =
                    !!guest &&
                    (guest.action === "clinicChairSit" ||
                      guest.action === "consultSit" ||
                      guest.action === "postExamTalk" ||
                      guest.action === "postScanTalk" ||
                      guest.action === "clinicScan" ||
                      guest.action === "bedSit" ||
                      guest.action === "examBed" ||
                      guest.action === "bedExit" ||
                      guest.group.userData.visitPhase === "clinicScan" ||
                      !!guest.group.userData.consultPath),
                  typing = !busy && w.group.userData.clinicTask === "computer";
                if (typing) {
                  if (w.chart) w.chart.visible = false;
                  w.arms[0].rotation.x = 0.82 + Math.sin(t * 8 + i) * 0.12;
                  w.arms[0].rotation.z = 0.16;
                  w.arms[1].rotation.x =
                    0.82 + Math.sin(t * 8 + i + Math.PI) * 0.12;
                  w.arms[1].rotation.z = -0.16;
                  w.headRig.rotation.x = 0.1 + Math.sin(t * 2.3 + i) * 0.035;
                } else {
                  if (w.chart) {
                    w.chart.visible = true;
                    w.chart.rotation.x = -0.5 + Math.sin(t * 2.6) * 0.025;
                  }
                  w.arms[0].rotation.x = 1.04;
                  w.arms[0].rotation.z = 0.4;
                  w.arms[1].rotation.x = 1.04;
                  w.arms[1].rotation.z = -0.4;
                  w.headRig.rotation.x = 0.12 + Math.sin(t * 4.4 + i) * 0.07;
                  w.headRig.rotation.z = Math.sin(t * 2.1 + i) * 0.035;
                }
                if (w.group.userData.consultQueued && !busy) {
                  delete w.group.userData.consultQueued;
                  delete w.group.userData.consultPatient;
                  w.actionTime = 0;
                }
                const occupied = patients.some(
                    (p) =>
                      p.group.userData.consultRoom === w.room &&
                      (p.action === "clinicChairSit" ||
                        p.action === "consultSit" ||
                        p.action === "postExamTalk" ||
                        p.action === "postScanTalk" ||
                        p.action === "clinicScan" ||
                        p.action === "bedSit" ||
                        p.action === "examBed" ||
                        p.action === "bedExit" ||
                        p.group.userData.consultState === "inbound" ||
                        p.group.userData.consultState === "toExam" ||
                        p.group.userData.consultState === "postExamSeat"),
                  ),
                  awayCount = patients.filter(
                    (p) =>
                      p.group.visible &&
                      (p.action === "clinicChairSit" ||
                        p.action === "consultSit" ||
                        p.action === "postExamTalk" ||
                        p.action === "postScanTalk" ||
                        p.action === "clinicScan" ||
                        p.action === "bedSit" ||
                        p.action === "examBed" ||
                        p.action === "bedExit" ||
                        p.group.userData.consultState === "inbound" ||
                        p.group.userData.consultState === "toExam" ||
                        p.group.userData.consultState === "postExamSeat" ||
                        p.group.userData.consultState === "leaving"),
                  ).length;
                if (
                  !w.group.userData.consultQueued &&
                  !occupied &&
                  roomNurse?.group.userData.roomReady &&
                  awayCount < 4 &&
                  lobbyPatientCount() > 5
                ) {
                  const eligible = patients.filter(
                    (p) =>
                      p.group.visible &&
                      p.group.userData.activePatient &&
                      p.group.userData.visitPhase === "queue" &&
                      p.group.userData.consultRoom === w.room &&
                      p.group.userData.consultCooldown <= 0 &&
                      !p.group.userData.consultPath &&
                      !p.group.userData.lifecyclePath,
                  );
                  eligible.sort(
                    (a, b) =>
                      (a.action === "sit" ? 1 : 0) -
                        (b.action === "sit" ? 1 : 0) ||
                      (b.group.userData.queueReady ? 1 : 0) -
                        (a.group.userData.queueReady ? 1 : 0) ||
                      (a.group.userData.lastSitOrder || 0) -
                        (b.group.userData.lastSitOrder || 0),
                  );
                  // Keep the waiting room populated: call a patient who is
                  // already standing first. A seated patient is interruptible,
                  // but only when more than the required five remain seated.
                  const p =
                    eligible.find((candidate) => candidate.action !== "sit") ||
                    (lobbySeatedPatientCount() > 5 ? eligible[0] : undefined);
                  if (p) {
                    const calledRoom = w.room || room + 1;
                    setCallScreen(
                      calledRoom,
                      String(p.group.userData.queueNumber || "00"),
                    );
                    window.dispatchEvent(
                      new CustomEvent("medify:clinic-call", {
                        detail: {
                          room: calledRoom,
                          queueNumber: String(
                            p.group.userData.queueNumber || "00",
                          ),
                        },
                      }),
                    );
                    p.group.userData.baseCalledSpeed = p.speed;
                    p.speed = Math.max(1.24, p.speed * 1.65);
                    // Establish call priority before interrupting a sitting or
                    // seat-approaching patient so their release lane uses the
                    // non-blocking called-patient reservation rules immediately.
                    p.group.userData.visitPhase = "consult";
                    p.group.userData.consultState = "inbound";
                    interruptPatientForCall(p);
                    p.group.userData.calledScreenRoom = calledRoom;
                    p.group.userData.calledTaskActive = true;
                    p.group.userData.calledTaskRoom = calledRoom;
                    p.group.userData.calledTransitPriority =
                      ++calledTransitSequence;
                    p.group.userData.consultPath =
                      inboundClinicPathFromCurrent(p, room);
                    p.group.userData.consultTransitTime = 0;
                    p.group.userData.consultDoctor = w.group.uuid;
                    p.group.userData.calledProgressAnchor =
                      p.group.position.clone();
                    p.group.userData.calledNoProgress = 0;
                    p.group.userData.calledElapsed = 0;
                    delete p.group.userData.queueReady;
                    delete p.group.userData.queueCycleCooldown;
                    w.group.userData.consultPatient = p.group.uuid;
                    w.group.userData.consultQueued = true;
                    if (roomNurse) {
                      roomNurse.group.userData.roomReady = false;
                      roomNurse.group.userData.servicePatient = p.group.uuid;
                      roomNurse.group.userData.clinicStaffPath = [
                        clinicDoorInsidePoints[room].clone(),
                        clinicDoorCenterPoints[room].clone(),
                        doorOutside[room].clone(),
                        clinicNurseDoorPoints[room].clone(),
                      ];
                      roomNurse.group.userData.clinicStaffPathMode = "doorWait";
                      roomNurse.speed = 1.34;
                      roomNurse.action = "clinicNurseRise";
                      roomNurse.actionTime = 0;
                      roomNurse.pause = 0;
                      delete roomNurse.group.userData.navPath;
                      delete roomNurse.group.userData.navTarget;
                    }
                  }
                }
                if (
                  w.actionTime > 5.5 + (room % 3) * 0.7 &&
                  !busy &&
                  !w.group.userData.consultQueued
                ) {
                  w.actionTime = 0;
                  w.group.userData.clinicTask =
                    w.group.userData.clinicTask === "computer"
                      ? "chart"
                      : "computer";
                  if (Math.random() < 0.46) {
                    poseStanding(w);
                    w.group.userData.doctorPath = [w.route[1], w.route[2]].map(
                      (p) => p.clone(),
                    );
                    w.group.userData.doctorPathMode = "interior";
                    w.action = "walk";
                    w.pause = 0.08;
                  }
                }
              } else if (w.action === "clinicNurseRise") {
                const room = (w.room || 1) - 1,
                  seat = clinicNurseSeats[room],
                  exit = clinicNurseSeatExitPoints[room],
                  progress = THREE.MathUtils.smoothstep(
                    w.actionTime / 0.62,
                    0,
                    1,
                  ),
                  targetYaw = Math.atan2(
                    -(exit.x - seat.x),
                    -(exit.z - seat.z),
                  ),
                  yawDiff = Math.atan2(
                    Math.sin(targetYaw - clinicNurseYaws[room]),
                    Math.cos(targetYaw - clinicNurseYaws[room]),
                  );
                resetUpperPose(w);
                w.group.position.lerpVectors(seat, exit, progress);
                w.group.position.y = THREE.MathUtils.lerp(0.14, 0, progress);
                w.group.scale.set(1, THREE.MathUtils.lerp(0.88, 1, progress), 1);
                w.group.rotation.set(
                  0,
                  clinicNurseYaws[room] + yawDiff * progress,
                  0,
                );
                w.legs.forEach((l, k) => {
                  l.position.lerpVectors(
                    new THREE.Vector3(k ? 0.14 : -0.14, 0.69, -0.3),
                    new THREE.Vector3(k ? 0.13 : -0.13, 0.31, 0),
                    progress,
                  );
                  l.rotation.x = THREE.MathUtils.lerp(
                    -Math.PI / 2,
                    0,
                    progress,
                  );
                });
                if (w.actionTime > 0.64) {
                  w.group.position.copy(exit);
                  poseStanding(w);
                  w.action = "walk";
                  w.actionTime = 0;
                  w.pause = 0;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                }
              } else if (w.action === "clinicNurseSeatEntry") {
                const room = (w.room || 1) - 1,
                  exit = clinicNurseSeatExitPoints[room],
                  seat = clinicNurseSeats[room],
                  progress = THREE.MathUtils.smoothstep(
                    w.actionTime / 0.66,
                    0,
                    1,
                  ),
                  startYaw =
                    w.group.userData.clinicSeatEntryYaw ?? w.group.rotation.y,
                  yawDiff = Math.atan2(
                    Math.sin(clinicNurseYaws[room] - startYaw),
                    Math.cos(clinicNurseYaws[room] - startYaw),
                  );
                resetUpperPose(w);
                w.group.position.lerpVectors(exit, seat, progress);
                w.group.position.y = THREE.MathUtils.lerp(0, 0.14, progress);
                w.group.scale.set(1, THREE.MathUtils.lerp(1, 0.88, progress), 1);
                w.group.rotation.set(0, startYaw + yawDiff * progress, 0);
                w.legs.forEach((l, k) => {
                  l.position.lerpVectors(
                    new THREE.Vector3(k ? 0.13 : -0.13, 0.31, 0),
                    new THREE.Vector3(k ? 0.14 : -0.14, 0.69, -0.3),
                    progress,
                  );
                  l.rotation.x = THREE.MathUtils.lerp(
                    0,
                    -Math.PI / 2,
                    progress,
                  );
                });
                if (w.actionTime > 0.68) {
                  const completionMode =
                    w.group.userData.clinicSeatCompletionMode;
                  delete w.group.userData.clinicSeatCompletionMode;
                  delete w.group.userData.clinicSeatEntryYaw;
                  w.group.position.copy(seat);
                  w.speed = w.group.userData.baseClinicSpeed || 0.76;
                  w.action = "clinicNurseSit";
                  w.actionTime = 0;
                  w.pause = 0;
                  if (completionMode === "returnReady") {
                    w.group.userData.roomReady = true;
                    delete w.group.userData.needsBedTidy;
                    delete w.group.userData.servicePatient;
                  }
                  poseSeated(w, clinicNurseYaws[room]);
                }
              } else if (w.action === "clinicNurseSit") {
                const room = (w.room || 1) - 1,
                  serviceGuest = patients.find(
                    (p) => p.group.uuid === w.group.userData.servicePatient,
                  );
                w.group.position.copy(clinicNurseSeats[room]);
                poseSeated(w, clinicNurseYaws[room]);
                // Inside the clinic the nurse works at the desk rather than
                // tracking the patient's position with their head.
                w.headRig.rotation.y = 0;
                w.headRig.rotation.x = 0.09 + Math.sin(t * 1.9 + i) * 0.035;
                w.arms[0].rotation.x = 0.46 + Math.sin(t * 3.2 + i) * 0.09;
                w.arms[1].rotation.x =
                  0.42 + Math.sin(t * 3.2 + i + Math.PI) * 0.08;
                if (
                  w.group.userData.needsBedTidy &&
                  (!serviceGuest ||
                    serviceGuest.group.position.distanceTo(clinicBedPoints[room]) >
                      1.65)
                ) {
                  poseStanding(w);
                  w.group.userData.clinicStaffPath = [
                    clinicDoorInsidePoints[room].clone(),
                    clinicNurseExamStandPoints[room].clone(),
                  ];
                  w.group.userData.clinicStaffPathMode = "examStand";
                  w.speed = 1.2;
                  w.action = "clinicNurseRise";
                  w.actionTime = 0;
                  w.pause = 0;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                }
              } else if (w.action === "clinicNurseDoor") {
                const room = (w.room || 1) - 1,
                  guest = patients.find(
                    (p) => p.group.uuid === w.group.userData.servicePatient,
                );
                w.group.position.copy(clinicNurseDoorPoints[room]);
                poseStanding(w);
                // The call display remains directly behind the nurse.  The nurse
                // watches the arriving patient, then follows them through the door.
                faceFlat(
                  w.group,
                  guest?.group.position || doorOutside[room],
                );
                w.arms[0].rotation.x = 0.52 + Math.sin(t * 3.4 + i) * 0.14;
                w.arms[0].rotation.z = 0.28;
                w.headRig.rotation.y = Math.sin(t * 2.4 + i) * 0.07;
                const guestDistance = guest
                  ? guest.group.position.distanceTo(w.group.position)
                  : Infinity;
                const guestDoorDepth = guest
                  ? guest.group.position
                      .clone()
                      .sub(clinicDoorPoints[room])
                      .dot(clinicOuts[room])
                  : -Infinity;
                if (guest && guest.action === "walk" && guestDistance < 2.05) {
                  // Fast-called patients ease down before reaching the nurse so
                  // neither body enters the narrow doorway at the same instant.
                  guest.speed = Math.min(guest.speed, 1.08);
                  guest.group.userData.nurseEscortSpeed = true;
                }
                const guestReadyForEscort =
                  !!guest &&
                  ((guest.action === "walk" && guestDistance <= 1.02) ||
                    // Recovery guard: if an earlier frame already moved the
                    // patient across the threshold, the nurse must follow them
                    // inside instead of waiting forever at the lobby side.
                    guestDoorDepth > -0.28);
                if (guestReadyForEscort) {
                  // Once the patient is one metre away, the nurse turns first and
                  // leads through the doorway. The patient follows on the same
                  // centreline, one body length behind.
                  w.group.userData.clinicStaffPath = [
                    clinicDoorCenterPoints[room].clone(),
                    clinicDoorInsidePoints[room].clone(),
                    clinicNurseSeatExitPoints[room].clone(),
                  ];
                  w.group.userData.clinicStaffPathMode = "leadIn";
                  w.speed = 1.18;
                  w.action = "walk";
                  w.actionTime = 0;
                  w.pause = 0;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                } else if (!guest) {
                  w.group.userData.clinicStaffPath = [
                    doorOutside[room].clone(),
                    clinicDoorCenterPoints[room].clone(),
                    clinicDoorInsidePoints[room].clone(),
                    clinicNurseSeatExitPoints[room].clone(),
                  ];
                  w.group.userData.clinicStaffPathMode = "returnReady";
                  w.speed = 1.16;
                  w.action = "walk";
                  w.actionTime = 0;
                  w.pause = 0;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                }
              } else if (w.action === "clinicNurseExamStand") {
                const room = (w.room || 1) - 1,
                  guest = patients.find(
                    (p) => p.group.uuid === w.group.userData.servicePatient,
                );
                w.group.position.copy(clinicNurseExamStandPoints[room]);
                poseStanding(w);
                // At the wall the nurse faces the work area and records notes;
                // they do not continuously rotate to follow the patient.
                faceFlat(w.group, clinicTabletPoints[room]);
                if (w.chart) {
                  w.chart.visible = true;
                  w.chart.position.set(0, 0.91, -0.39);
                  w.chart.rotation.x =
                    -0.47 + Math.sin(t * 2.3 + i) * 0.018;
                }
                // One hand supports the chart while the other makes short,
                // asynchronous writing strokes; the nurse glances between the
                // patient and the notes while waiting beside the wall.
                w.arms[0].rotation.x = 0.91;
                w.arms[0].rotation.z = 0.34;
                w.arms[1].rotation.x =
                  1.02 + Math.sin(t * 6.2 + i * 0.77) * 0.13;
                w.arms[1].rotation.z =
                  -0.32 + Math.sin(t * 6.2 + i * 0.77) * 0.045;
                w.headRig.rotation.y = Math.sin(t * 1.8 + i) * 0.045;
                w.headRig.rotation.x = 0.14 + Math.sin(t * 2.2 + i) * 0.05;
                const patientClearOfBed =
                  !!guest &&
                  (guest.action === "postExamTalk" ||
                    guest.action === "clinicScan" ||
                    guest.group.userData.consultState === "leaving");
                if (w.group.userData.needsBedTidy && patientClearOfBed) {
                  w.group.userData.clinicStaffPath = [
                    clinicBedWallPoints[room].clone(),
                    clinicNurseBedTidyHeadPoints[room].clone(),
                  ];
                  w.group.userData.clinicStaffPathMode = "bedTidy";
                  w.speed = 1.08;
                  w.action = "walk";
                  w.actionTime = 0;
                  w.pause = 0;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                } else if (!guest) {
                  w.group.userData.clinicStaffPath = [
                    clinicBedWallPoints[room].clone(),
                    clinicNurseSeatExitPoints[room].clone(),
                  ];
                  w.group.userData.clinicStaffPathMode = "returnReady";
                  w.speed = 1.08;
                  w.action = "walk";
                  w.actionTime = 0;
                  w.pause = 0;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                }
              } else if (w.action === "clinicNurseTidy") {
                const room = (w.room || 1) - 1,
                  head = clinicNurseBedTidyHeadPoints[room],
                  foot = clinicNurseBedTidyFootPoints[room],
                  progress = THREE.MathUtils.smoothstep(
                    w.actionTime / 3.5,
                    0,
                    1,
                  );
                if (w.chart) w.chart.visible = false;
                w.group.position.lerpVectors(head, foot, progress);
                poseStanding(w);
                // The nurse travels from the head to the foot along the open
                // bedside lane, but keeps their torso and hands facing the
                // mattress for the whole tidying pass.
                faceFlat(w.group, clinicBedPoints[room]);
                w.arms[0].rotation.x = 0.82 + Math.sin(t * 6.2 + i) * 0.22;
                w.arms[0].rotation.z = 0.34;
                w.arms[1].rotation.x =
                  0.72 + Math.sin(t * 6.2 + i + Math.PI) * 0.2;
                w.arms[1].rotation.z = -0.28;
                w.headRig.rotation.x = 0.12 + Math.sin(t * 3 + i) * 0.05;
                const gait = t * 5.4 + i * 0.7;
                w.legs[0].rotation.x = Math.sin(gait) * 0.2;
                w.legs[1].rotation.x = -Math.sin(gait) * 0.2;
                if (w.actionTime > 3.5) {
                  w.group.userData.clinicStaffPath = [
                    clinicBedWallPoints[room].clone(),
                    clinicNurseSeatExitPoints[room].clone(),
                  ];
                  w.group.userData.clinicStaffPathMode = "returnReady";
                  w.speed = 1.08;
                  w.action = "walk";
                  w.actionTime = 0;
                  w.pause = 0;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                }
              } else if (w.action === "clinicChairSit") {
                clearCalledPatientTask(w);
                delete w.group.userData.calledProgressAnchor;
                delete w.group.userData.calledNoProgress;
                delete w.group.userData.calledElapsed;
                delete w.group.userData.leavingSeat;
                delete w.group.userData.allowSeatAccess;
                const room = (w.group.userData.consultRoom || 1) - 1,
                  approach = clinicPatientSeatApproaches[room],
                  stand = clinicPatientSeatControls[room],
                  seat = clinicPatientSeats[room],
                  walkProgress = THREE.MathUtils.smoothstep(
                    w.actionTime / 0.58,
                    0,
                    1,
                  ),
                  turnProgress = THREE.MathUtils.smoothstep(
                    (w.actionTime - 0.58) / 0.34,
                    0,
                    1,
                  ),
                  sitProgress = THREE.MathUtils.smoothstep(
                    (w.actionTime - 0.92) / 0.64,
                    0,
                    1,
                  ),
                  targetYaw = clinicPatientYaws[room];
                if (w.actionTime < 0.58) {
                  w.group.position.lerpVectors(approach, stand, walkProgress);
                  faceSmooth(w.group, stand, 0.34);
                  const gait =
                    t * w.group.userData.gaitRate + w.group.userData.gaitPhase;
                  w.legs[0].rotation.x = Math.sin(gait) * 0.4;
                  w.legs[1].rotation.x = -Math.sin(gait) * 0.4;
                  w.arms[0].rotation.x = -Math.sin(gait) * 0.25;
                  w.arms[1].rotation.x = Math.sin(gait) * 0.25;
                } else {
                  const yawDiff = Math.atan2(
                    Math.sin(targetYaw - w.group.rotation.y),
                    Math.cos(targetYaw - w.group.rotation.y),
                  );
                  w.group.rotation.y += yawDiff * (0.18 + 0.38 * turnProgress);
                  w.group.position.lerpVectors(stand, seat, sitProgress);
                  w.group.position.y = 0.14 * sitProgress;
                  w.group.scale.set(
                    1,
                    THREE.MathUtils.lerp(1, 0.88, sitProgress),
                    1,
                  );
                  w.legs.forEach((l, k) => {
                    l.position.lerp(
                      new THREE.Vector3(k ? 0.14 : -0.14, 0.69, -0.3),
                      sitProgress,
                    );
                    l.rotation.x = THREE.MathUtils.lerp(
                      0,
                      -Math.PI / 2,
                      sitProgress,
                    );
                  });
                }
                if (w.actionTime > 1.56) {
                  w.group.position.copy(seat);
                  w.action = w.group.userData.postExamSeat
                    ? "postExamTalk"
                    : "consultSit";
                  w.actionTime = 0;
                  poseSeated(w, targetYaw);
                  delete w.group.userData.postExamSeat;
                }
              } else if (w.action === "consultSit") {
                const room = (w.group.userData.consultRoom || 1) - 1;
                w.group.position.copy(clinicPatientSeats[room]);
                poseSeated(w, clinicPatientYaws[room]);
                w.arms[0].rotation.x = 0.45 + Math.sin(t * 2.8 + i) * 0.16;
                w.arms[1].rotation.x = 0.38;
                w.headRig.rotation.x = Math.sin(t * 3.1 + i) * 0.065;
                const doctor = doctors[room],
                  roomNurse = clinicNurses[room],
                  nurseReady =
                    roomNurse?.action === "clinicNurseSit" &&
                    roomNurse.group.userData.servicePatient === w.group.uuid;
                if (doctor) faceFlat(w.group, doctor.group.position);
                // Consultation time starts only after the accompanying nurse has
                // completed the return-to-seat animation.  Previously the patient
                // timer ran while the slower nurse was still crossing the room.
                if (!nurseReady) w.actionTime = 0;
                else if (w.actionTime > 6.2 + room * 0.22) {
                  poseStanding(w);
                  w.action = "walk";
                  w.actionTime = 0;
                  w.group.userData.clinicMotionAnchor =
                    w.group.position.clone();
                  w.group.userData.clinicNoProgress = 0;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                  delete w.group.userData.detourGoal;
                  delete w.group.userData.yieldGoal;
                  if (Math.random() < 0.5 && doctor) {
                    w.group.userData.visitPhase = "exam";
                    w.group.userData.consultState = "toExam";
                    w.group.userData.clinicExitOrigin = "chair";
                    w.group.userData.consultPath = [
                      clinicPatientSeatControls[room].clone(),
                      clinicExamApproaches[room].clone(),
                      clinicBedWallPoints[room].clone(),
                      clinicBedSidePoints[room].clone(),
                    ];
                    if (roomNurse) {
                      roomNurse.group.userData.clinicStaffPath = [
                        clinicDoorInsidePoints[room].clone(),
                        clinicNurseExamStandPoints[room].clone(),
                      ];
                      roomNurse.group.userData.clinicStaffPathMode =
                        "examStand";
                      roomNurse.speed = 1.2;
                      roomNurse.action = "clinicNurseRise";
                      roomNurse.actionTime = 0;
                      roomNurse.pause = 0;
                      delete roomNurse.group.userData.navPath;
                      delete roomNurse.group.userData.navTarget;
                    }
                    poseStanding(doctor);
                    doctor.group.userData.doctorPath = [
                      clinicDoctorExamApproaches[room].clone(),
                      clinicExamDoctorPoints[room].clone(),
                    ];
                    doctor.group.userData.doctorPathMode = "examCare";
                    delete doctor.group.userData.examFinishedWaiting;
                    doctor.action = "walk";
                    doctor.actionTime = 0;
                    doctor.pause = 0.04;
                    delete doctor.group.userData.navPath;
                    delete doctor.group.userData.navTarget;
                  } else {
                    w.group.userData.visitPhase = "clinicScan";
                    w.group.userData.clinicExitOrigin = "chair";
                    w.group.userData.consultState = "clinicScan";
                    w.group.userData.consultPath = [
                      clinicPatientSeatControls[room].clone(),
                    ];
                    w.pause = 0.05;
                  }
                }
              } else if (w.action === "postExamTalk") {
                const room = (w.group.userData.consultRoom || 1) - 1,
                  doctor = doctors[room],
                  doctorReady = doctor?.action === "clinicSit";
                w.group.position.copy(clinicPatientSeats[room]);
                poseSeated(w, clinicPatientYaws[room]);
                if (doctor) faceFlat(w.group, doctor.group.position);
                w.arms[0].rotation.x = 0.48 + Math.sin(t * 3.2 + i) * 0.14;
                w.arms[1].rotation.x = 0.38;
                w.headRig.rotation.x = Math.sin(t * 3 + i) * 0.06;
                if (!doctorReady) w.actionTime = 0;
                else if (w.actionTime > 3) {
                  w.action = "clinicScan";
                  w.actionTime = 0;
                  w.group.userData.visitPhase = "clinicScan";
                  w.group.userData.consultState = "clinicScan";
                  w.pause = 0;
                }
              } else if (w.action === "bedSit") {
                const room = (w.group.userData.consultRoom || 1) - 1,
                  floorSide = clinicBedSidePoints[room].clone(),
                  edgeSeat = clinicBedEdgeSeatPoints[room].clone(),
                  lyingTarget = clinicBedPoints[room]
                    .clone()
                    .addScaledVector(clinicOuts[room], -0.72);
                floorSide.y = 0;
                edgeSeat.y = 0.58;
                lyingTarget.y = 1.06;
                resetUpperPose(w);
                if (w.actionTime < 0.72) {
                  const progress = THREE.MathUtils.smoothstep(
                    w.actionTime / 0.72,
                    0,
                    1,
                  );
                  w.group.position.lerpVectors(floorSide, edgeSeat, progress);
                  w.group.rotation.set(0, clinicBedSitYaws[room], 0);
                  w.group.scale.setScalar(THREE.MathUtils.lerp(1, 0.92, progress));
                  w.legs.forEach((l, k) => {
                    l.position.lerpVectors(
                      new THREE.Vector3(k ? 0.13 : -0.13, 0.31, 0),
                      new THREE.Vector3(k ? 0.13 : -0.13, 0.52, -0.28),
                      progress,
                    );
                    l.rotation.set(
                      THREE.MathUtils.lerp(0, -Math.PI / 2, progress),
                      0,
                      0,
                    );
                  });
                } else if (w.actionTime < 1.08) {
                  poseBedSit(w, room);
                  w.headRig.rotation.x = 0.05 + Math.sin(t * 2.5 + i) * 0.025;
                } else {
                  const progress = THREE.MathUtils.smoothstep(
                      (w.actionTime - 1.08) / 1.02,
                      0,
                      1,
                    );
                  bedPoseY.copy(clinicOuts[room]).normalize();
                  bedPoseX.copy(bedPoseY).cross(bedPoseZ).normalize();
                  bedPoseMatrix.makeBasis(bedPoseX, bedPoseY, bedPoseZ);
                  const startQ = new THREE.Quaternion().setFromEuler(
                      new THREE.Euler(0, clinicBedSitYaws[room], 0),
                    ),
                    targetQ = new THREE.Quaternion().setFromRotationMatrix(
                      bedPoseMatrix,
                    );
                  if (startQ.dot(targetQ) < 0)
                    targetQ.set(-targetQ.x, -targetQ.y, -targetQ.z, -targetQ.w);
                  w.group.position.lerpVectors(edgeSeat, lyingTarget, progress);
                  w.group.quaternion.slerpQuaternions(startQ, targetQ, progress);
                  w.group.scale.setScalar(
                    THREE.MathUtils.lerp(0.92, 0.88, progress),
                  );
                  // Let the body settle onto the mattress before extending
                  // the knees.  This avoids combining a full leg swing with
                  // the body's 90-degree roll, which looked like the legs
                  // flipped over during the lie-down animation.
                  const legUnfold = THREE.MathUtils.smoothstep(
                    (progress - 0.56) / 0.44,
                    0,
                    1,
                  );
                  w.legs.forEach((l, k) => {
                    l.position.lerpVectors(
                      new THREE.Vector3(k ? 0.13 : -0.13, 0.52, -0.28),
                      new THREE.Vector3(k ? 0.13 : -0.13, 0.31, 0),
                      legUnfold,
                    );
                    l.rotation.set(
                      THREE.MathUtils.lerp(-Math.PI / 2, 0, legUnfold),
                      0,
                      0,
                    );
                  });
                }
                if (w.actionTime > 2.12) {
                  w.action = "examBed";
                  w.actionTime = 0;
                  poseExamBed(w, room);
                }
              } else if (w.action === "examBed") {
                const room = (w.group.userData.consultRoom || 1) - 1;
                poseExamBed(w, room);
                w.headRig.rotation.x = Math.sin(t * 1.8 + i) * 0.025;
                w.arms[0].rotation.z = 0.12 + Math.sin(t * 2.2 + i) * 0.035;
                if (w.group.userData.examCareComplete) {
                  delete w.group.userData.examCareComplete;
                  // Do not stand directly from the lying coordinate.  The patient
                  // first returns to the bed edge, and only after the doctor has
                  // finished operating the instrument.
                  w.action = "bedExit";
                  w.actionTime = 0;
                  w.pause = 0;
                }
              } else if (w.action === "bedExit") {
                const room = (w.group.userData.consultRoom || 1) - 1,
                  lying = clinicBedPoints[room]
                    .clone()
                    .addScaledVector(clinicOuts[room], -0.72),
                  edgeSeat = clinicBedEdgeSeatPoints[room].clone(),
                  floorSide = clinicBedSidePoints[room].clone();
                lying.y = 1.06;
                edgeSeat.y = 0.58;
                floorSide.y = 0;
                bedPoseY.copy(clinicOuts[room]).normalize();
                bedPoseX.copy(bedPoseY).cross(bedPoseZ).normalize();
                bedPoseMatrix.makeBasis(bedPoseX, bedPoseY, bedPoseZ);
                const lyingQ = new THREE.Quaternion().setFromRotationMatrix(
                    bedPoseMatrix,
                  ),
                  seatedQ = new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(0, clinicBedSitYaws[room], 0),
                  );
                if (lyingQ.dot(seatedQ) < 0)
                  seatedQ.set(-seatedQ.x, -seatedQ.y, -seatedQ.z, -seatedQ.w);
                resetUpperPose(w);
                if (w.actionTime < 1.05) {
                  const progress = THREE.MathUtils.smoothstep(
                    w.actionTime / 1.05,
                    0,
                    1,
                  );
                  w.group.position.lerpVectors(lying, edgeSeat, progress);
                  w.group.quaternion.slerpQuaternions(
                    lyingQ,
                    seatedQ,
                    progress,
                  );
                  w.group.scale.setScalar(
                    THREE.MathUtils.lerp(0.88, 0.92, progress),
                  );
                  w.legs.forEach((l, k) => {
                    l.position.lerpVectors(
                      new THREE.Vector3(k ? 0.13 : -0.13, 0.31, 0),
                      new THREE.Vector3(k ? 0.13 : -0.13, 0.52, -0.28),
                      progress,
                    );
                    l.rotation.x = THREE.MathUtils.lerp(
                      0,
                      -Math.PI / 2,
                      progress,
                    );
                  });
                } else {
                  const progress = THREE.MathUtils.smoothstep(
                    (w.actionTime - 1.05) / 0.62,
                    0,
                    1,
                  );
                  w.group.position.lerpVectors(edgeSeat, floorSide, progress);
                  w.group.rotation.set(0, clinicBedSitYaws[room], 0);
                  w.group.scale.setScalar(THREE.MathUtils.lerp(0.92, 1, progress));
                  w.legs.forEach((l, k) => {
                    l.position.lerpVectors(
                      new THREE.Vector3(k ? 0.13 : -0.13, 0.52, -0.28),
                      new THREE.Vector3(k ? 0.13 : -0.13, 0.31, 0),
                      progress,
                    );
                    l.rotation.x = THREE.MathUtils.lerp(
                      -Math.PI / 2,
                      0,
                      progress,
                    );
                  });
                }
                if (w.actionTime > 1.68) {
                  w.group.position.copy(floorSide);
                  poseStanding(w);
                  w.action = "walk";
                  w.actionTime = 0;
                  w.group.userData.visitPhase = "exam";
                  w.group.userData.clinicExitOrigin = "bed";
                  w.group.userData.clinicMotionAnchor =
                    w.group.position.clone();
                  w.group.userData.clinicNoProgress = 0;
                  w.group.userData.consultPath = [
                    clinicBedExitPoints[room].clone(),
                    clinicExamApproaches[room].clone(),
                    clinicPatientSeatApproaches[room].clone(),
                  ];
                  w.group.userData.consultState = "postExamSeat";
                  w.pause = 0.025;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                  delete w.group.userData.detourGoal;
                  delete w.group.userData.yieldGoal;
                  const roomNurse = clinicNurses[room];
                  if (roomNurse) {
                    roomNurse.group.userData.needsBedTidy = true;
                    roomNurse.group.userData.roomReady = false;
                  }
                }
              } else if (w.action === "examCare") {
                const room = (w.room || 1) - 1,
                  assignedPatient = patients.find(
                    (p) =>
                      p.group.visible &&
                      p.group.userData.consultRoom === room + 1 &&
                      p.group.userData.consultDoctor === w.group.uuid &&
                      (p.action === "bedSit" || p.action === "examBed"),
                  ),
                  examPatient = patients.find(
                    (p) =>
                      p.group.visible &&
                      p.group.userData.consultRoom === room + 1 &&
                      p.group.userData.consultDoctor === w.group.uuid &&
                      p.action === "examBed",
                  );
                w.group.position.copy(clinicExamDoctorPoints[room]);
                poseStanding(w);
                if (w.chart) w.chart.visible = false;
                // The timed operation begins only after the patient is fully on
                // the bed. While waiting, the doctor watches the patient with
                // relaxed hands instead of prematurely operating the device.
                if (!examPatient) {
                  faceFlat(
                    w.group,
                    assignedPatient?.group.position || clinicBedPoints[room],
                  );
                  w.arms[0].rotation.x = 0.12;
                  w.arms[0].rotation.z = 0.08;
                  w.arms[1].rotation.x = 0.12;
                  w.arms[1].rotation.z = -0.08;
                  w.headRig.rotation.x =
                    0.04 + Math.sin(t * 1.9 + i) * 0.035;
                  w.actionTime = 0;
                } else {
                  // Once the patient is lying down, turn to the true angle
                  // bisector between the instrument and bed and begin operating.
                  faceFlat(w.group, clinicDoctorExamFacingPoints[room]);
                  w.arms[0].rotation.x =
                    1.02 + Math.sin(t * 5.2 + i) * 0.16;
                  w.arms[0].rotation.z = 0.22;
                  w.arms[1].rotation.x =
                    0.94 + Math.sin(t * 4.6 + i + 1) * 0.14;
                  w.arms[1].rotation.z = -0.2;
                  w.headRig.rotation.x =
                    0.08 + Math.sin(t * 2.4 + i) * 0.055;
                }
                if (
                  examPatient &&
                  w.actionTime >
                  (w.group.userData.examDuration || 5.5)
                ) {
                  examPatient.group.userData.examCareComplete = true;
                  delete w.group.userData.examDuration;
                  // Return to the desk immediately. Because doctors update
                  // before patients, the patient receives the completion flag
                  // in this same frame and starts getting off the bed at once.
                  poseStanding(w);
                  w.group.userData.doctorPath = [
                    clinicDoctorRetreatPoints[room].clone(),
                    clinicDoctorSeats[room].clone(),
                  ];
                  w.group.userData.doctorPathMode = "return";
                  w.action = "walk";
                  w.actionTime = 0;
                  w.pause = 0;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                }
              } else if (w.action === "clinicScan") {
                const room = (w.group.userData.consultRoom || 1) - 1,
                  usedBed = w.group.userData.clinicExitOrigin === "bed";
                if (usedBed) {
                  w.group.position.copy(clinicPatientSeats[room]);
                  poseSeated(w, clinicPatientYaws[room]);
                } else {
                  w.group.position.copy(clinicPatientSeatControls[room]);
                  poseStanding(w);
                }
                // Bed-exam patients scan while remaining seated. Patients who
                // did not use the bed retain the existing desk-side scan.
                faceFlat(w.group, clinicTabletPoints[room]);
                holdPhoneAtFace(w, t * 3.15 + i, true);
                if (w.scanBadge) w.scanBadge.visible = true;
                if (w.actionTime > 1.35) {
                  if (w.scanBadge) w.scanBadge.visible = false;
                  resetUpperPose(w);
                  if (usedBed) {
                    w.action = "postScanTalk";
                    w.actionTime = 0;
                    poseSeated(w, clinicPatientYaws[room]);
                  } else beginClinicDeparture(w, room, false);
                }
              } else if (w.action === "postScanTalk") {
                const room = (w.group.userData.consultRoom || 1) - 1,
                  doctor = doctors[room];
                w.group.position.copy(clinicPatientSeats[room]);
                poseSeated(w, clinicPatientYaws[room]);
                if (doctor) faceFlat(w.group, doctor.group.position);
                w.arms[0].rotation.x = 0.42;
                w.arms[1].rotation.x =
                  0.5 + Math.sin(t * 3.1 + i) * 0.13;
                w.headRig.rotation.x = Math.sin(t * 3.2 + i) * 0.055;
                if (w.actionTime > 2) beginClinicDeparture(w, room, true);
              } else if (w.action === "kioskPayment") {
                poseStanding(w);
                faceFlat(w.group, kioskPosition);
                const tap = Math.sin(t * 6.8 + i) * 0.08;
                w.arms[0].rotation.x = 0.82 + tap;
                w.arms[0].rotation.z = 0.2;
                w.arms[1].rotation.x = 0.46 - tap * 0.35;
                w.arms[1].rotation.z = -0.08;
                w.headRig.rotation.x =
                  0.08 + Math.sin(t * 2.8 + i) * 0.035;
                if (w.actionTime >= 4.2) {
                  paymentSuccessUntil = t + 1.8;
                  paymentKioskOwner = null;
                  resetUpperPose(w);
                  beginMedicinePickup(w, i);
                }
              } else if (w.action === "medicinePickup") {
                poseStanding(w);
                faceFlat(w.group, counterNursePoint);
                const receivingBag = w.actionTime < 1.85;
                if (w.medicineBag) {
                  w.medicineBag.visible = !receivingBag;
                  // Once the handoff is complete, the patient's own bag returns
                  // upright and hangs naturally from one hand.
                  w.medicineBag.position.set(0, -0.075, -0.012);
                  w.medicineBag.rotation.set(0, 0, 0);
                }
                if (receivingBag) {
                  // Both hands rise together and meet beneath the face-up bag.
                  w.arms[0].rotation.x = 1.04;
                  w.arms[0].rotation.z = 0.28;
                  w.arms[1].rotation.x = 1.04;
                  w.arms[1].rotation.z = -0.28;
                } else {
                  // After receiving it, the left hand lowers into a one-hand,
                  // vertical carrying pose while the other arm relaxes.
                  w.arms[0].rotation.x =
                    0.54 + Math.sin(t * 3.2 + i) * 0.05;
                  w.arms[0].rotation.z = 0.24;
                  w.arms[1].rotation.x = 0.08;
                  w.arms[1].rotation.z = 0;
                }
                w.headRig.rotation.x = 0.05 + Math.sin(t * 2.6 + i) * 0.045;
                if (w.actionTime > 3) {
                  if (w.medicineBag) w.medicineBag.visible = true;
                  beginPatientDeparture(w, i);
                  // Re-elect the next visible queue head immediately. This is
                  // intentionally done in the same frame as the medicine
                  // handoff so no stale pickup owner can block the whole line.
                  syncCounterServiceQueue();
                }
              } else if (w.action === "counterTalk") {
                faceFlat(w.group, counterNursePoint);
                faceFlat(receptionNurse.group, w.group.position);
                const talkPhase = t * 3.2 + i * 0.61;
                receptionNurse.arms[0].rotation.x =
                  0.68 + Math.sin(talkPhase) * 0.18;
                receptionNurse.arms[0].rotation.z = -0.5;
                receptionNurse.headRig.rotation.x =
                  0.05 + Math.sin(t * 2.5) * 0.055;
                w.arms[0].rotation.x = 0.48 + Math.sin(talkPhase + 1) * 0.2;
                w.arms[0].rotation.z = 0.24;
                w.arms[1].rotation.x =
                  0.32 + Math.sin(talkPhase + Math.PI) * 0.14;
                w.headRig.rotation.x = 0.06 + Math.sin(t * 2.8 + i) * 0.06;
                if (w.actionTime > 3) {
                  resetUpperPose(w);
                  w.action = "walk";
                  w.actionTime = 0;
                  w.pause = 0;
                  // Reporting is complete before the separate QR scan. Release
                  // the counter now so the next queued patient can move forward.
                  releaseCounterService(w);
                  restoreCounterScanRoute(w);
                }
              } else if (w.action === "counterScan") {
                faceFlat(w.group, qrStand.position);
                holdPhoneAtFace(w, t * 3 + i, true);
                if (w.scanBadge) w.scanBadge.visible = true;
                if (w.actionTime > 1.35) {
                  if (w.scanBadge) w.scanBadge.visible = false;
                  w.group.userData.counterDone = true;
                  w.group.userData.counterRescanCooldown =
                    16 + Math.random() * 8;
                  completePatientScan(w);
                  delete w.group.userData.counterRescan;
                  delete w.group.userData.counterClaimed;
                  delete w.group.userData.counterScanPending;
                  resetUpperPose(w);
                  w.action = "walk";
                  w.actionTime = 0;
                  w.pause = 0.12;
                }
              } else if (w.action === "lobbyScan") {
                const station =
                  lobbyQrStations[w.group.userData.qrStation ?? 0];
                if (station) {
                  faceFlat(w.group, station.stand);
                  holdPhoneAtFace(w, t * 3.1 + i, true);
                  if (w.scanBadge) w.scanBadge.visible = true;
                  if (w.actionTime > 1.25) {
                    if (w.scanBadge) w.scanBadge.visible = false;
                    completePatientScan(w);
                    delete w.group.userData.qrGoal;
                    delete w.group.userData.qrQueueGoal;
                    delete w.group.userData.qrStation;
                    resetUpperPose(w);
                    w.action = "walk";
                    w.actionTime = 0;
                    w.pause = 0.08;
                  }
                } else {
                  delete w.group.userData.qrGoal;
                  delete w.group.userData.qrStation;
                  resetUpperPose(w);
                  w.action = "walk";
                }
              } else if (w.action === "doorScan") {
                const d = doors.find((v) => v.room === w.lastDoor);
                if (d) {
                  faceFlat(w.group, d.pivot.position);
                  holdPhoneAtFace(w, t * 3.2 + i, true);
                  if (w.scanBadge) w.scanBadge.visible = true;
                  if (w.actionTime > 1.2) {
                    if (w.scanBadge) w.scanBadge.visible = false;
                    w.group.userData.scanCooldown = 5 + Math.random() * 4;
                    completePatientScan(w);
                    resetUpperPose(w);
                    w.action = "walk";
                    w.actionTime = 0;
                    w.pause = 0.12;
                  }
                } else {
                  if (w.scanBadge) w.scanBadge.visible = false;
                  resetUpperPose(w);
                  w.action = "walk";
                }
              }
              return;
            }
            if (w.pause > 0) {
              w.pause -= dt;
              if (w.group.userData.blockRecoveryPause) {
                w.legs.forEach((leg) => (leg.rotation.x *= 0.48));
                if (w.pause <= 0)
                  delete w.group.userData.blockRecoveryPause;
              }
              return;
            }
            // A patient may not hand control to the next workflow target until the
            // owned chair-release lane has a free landing point.  If every landing
            // point is occupied, remain at the chair briefly and retry instead of
            // walking through furniture or into another character.
            if (
              w.group.userData.consultState === "inbound" &&
              w.group.userData.leavingSeat &&
              !w.group.userData.detourGoal &&
              !occupiesAssignedLobbySeat(w)
            ) {
              // A completed or stale seat-release flag must never mask the
              // already-owned clinic route. Continue visibly from the current
              // clear position instead of requesting another chair exit.
              seatExitReservations.delete(w.group.uuid);
              delete w.group.userData.leavingSeat;
              delete w.group.userData.allowSeatAccess;
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
              w.group.userData.calledProgressAnchor =
                w.group.position.clone();
              w.group.userData.calledNoProgress = 0;
              w.group.userData.navAvoidPeople = true;
            }
            if (
              w.group.userData.leavingSeat &&
              !w.group.userData.detourGoal
            ) {
              const exit = seatExitPoint(w);
              if (!exit) {
                w.pause = 0.055;
                return;
              }
              w.group.userData.detourGoal = exit;
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
            }
            // The door starts opening only when a doctor or consulting patient is close;
            // the person then waits just outside the swing radius until it is clear.
            const transitRoom = isActiveDoorTransit(w)
              ? w.role === "patient"
                ? w.group.userData.consultRoom
                : w.room
              : undefined;
            if (
              transitRoom &&
              !w.group.userData.detourGoal &&
              !w.group.userData.yieldGoal
            ) {
              const d = doors.find((v) => v.room === transitRoom)!,
                doorCenter = clinicDoorPoints[transitRoom - 1],
                doorDepth = w.group.position
                  .clone()
                  .sub(doorCenter)
                  .dot(clinicOuts[transitRoom - 1]),
                outwardTransit =
                  (w.role === "patient" &&
                    w.group.userData.consultState === "leaving") ||
                  (w.role === "doctor" &&
                    w.group.userData.doctorPathMode === "knockExit"),
                // Incoming walkers only need an open door until their full body
                // has crossed the inner threshold. After that, a closing door
                // must not pause their remaining route to the seat.
                stillNeedsOpenDoor = outwardTransit || doorDepth < 0.56;
              if (
                stillNeedsOpenDoor &&
                w.group.position.distanceTo(doorCenter) < 2.25 &&
                d.pivot.position.distanceTo(d.openPosition) > 0.12
              ) {
                w.pause = 0.035;
                return;
              }
            }
            const streetDepartureMode = isStreetDepartingPatient(w);
            if (streetDepartureMode) {
              if (!w.group.userData.streetDepartureMode) {
                w.group.userData.streetDepartureMode = true;
                delete w.group.userData.detourGoal;
                delete w.group.userData.yieldGoal;
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                delete w.group.userData.navAvoidPeople;
                delete w.group.userData.avoidanceSide;
                delete w.group.userData.avoidanceSideUntil;
                w.group.userData.blockedTime = 0;
                w.pause = 0;
              }
              const speedDifference = streetDepartureSpeed - w.speed;
              w.speed +=
                Math.sign(speedDifference) *
                Math.min(Math.abs(speedDifference), dt * 0.62);
            }
            const consultPath = w.group.userData.consultPath as
                | THREE.Vector3[]
                | undefined,
              lifecyclePath = w.group.userData.lifecyclePath as
                | THREE.Vector3[]
                | undefined,
              revolvingDoorMode = w.group.userData.revolvingDoorMode as
                | "entry"
                | "exit"
                | undefined,
              doctorPath = w.group.userData.doctorPath as
                | THREE.Vector3[]
                | undefined,
              clinicStaffPath = w.group.userData.clinicStaffPath as
                | THREE.Vector3[]
                | undefined,
              seatGoal = w.group.userData.seatGoal as THREE.Vector3 | undefined,
              qrGoal = w.group.userData.qrGoal as THREE.Vector3 | undefined,
              qrQueueGoal = w.group.userData.qrQueueGoal as
                | THREE.Vector3
                | undefined,
              recoveryGoal = w.group.userData.recoveryGoal as
                | THREE.Vector3
                | undefined,
              manualRecoveryActive = !!(
                recoveryGoal && w.group.userData.manualRecoveryGoal
              ),
              yieldGoal = w.group.userData.yieldGoal as
                | THREE.Vector3
                | undefined,
              detourGoal = w.group.userData.detourGoal as
                | THREE.Vector3
                | undefined,
              pickupGoal =
                w.role === "patient" &&
                w.group.userData.pickupFlowLocked &&
                !w.group.userData.counterClaimed
                  ? medicinePickupQueueGoal(w)
                  : undefined,
              calledInboundPriority = isCalledInboundPatient(w),
              exclusiveTransit = hasExclusivePatientTransit(w),
              departurePath =
                w.role === "patient" &&
                w.group.userData.visitPhase === "leaving"
                  ? lifecyclePath
                  : undefined,
              entryDoorHoldingTarget =
                revolvingDoorMode === "entry" &&
                !w.group.userData.revolvingDoorTransit &&
                !!lifecyclePath?.[0] &&
                lifecyclePath[0].distanceTo(revolvingDoorEntryQueue) < 0.08
                  ? revolvingDoorEntryHoldingTarget(w)
                  : undefined,
              exitDoorHoldingTarget =
                revolvingDoorMode === "exit" &&
                !w.group.userData.revolvingDoorTransit &&
                !!departurePath?.[0] &&
                departurePath[0].distanceTo(revolvingDoorExitQueue) < 0.08
                  ? revolvingDoorExitHoldingTarget(w)
                  : undefined,
              defaultTarget =
                w.role === "doctor" && w.room
                  ? clinicDoctorSeats[w.room - 1]
                  : w.route[w.waypoint],
              routeTarget =
                recoveryGoal ||
                entryDoorHoldingTarget ||
                exitDoorHoldingTarget ||
                departurePath?.[0] ||
                (exclusiveTransit && !w.group.userData.leavingSeat
                  ? consultPath?.[0]
                  : detourGoal || yieldGoal || consultPath?.[0]) ||
                lifecyclePath?.[0] ||
                doctorPath?.[0] ||
                clinicStaffPath?.[0] ||
                seatGoal ||
                qrGoal ||
                qrQueueGoal ||
                pickupGoal ||
                defaultTarget,
              clinicNurseSeatLaneLocked = !!(
                !manualRecoveryActive &&
                w.role === "nurse" &&
                w.room &&
                clinicStaffPath &&
                ((routeTarget.distanceTo(
                  clinicNurseSeatExitPoints[w.room - 1],
                ) < 0.08 &&
                  w.group.position.distanceTo(
                    clinicNurseSeats[w.room - 1],
                  ) < 1.38) ||
                  (routeTarget.distanceTo(clinicNurseSeats[w.room - 1]) <
                    0.08 &&
                    w.group.position.distanceTo(
                      clinicNurseSeatExitPoints[w.room - 1],
                    ) < 1.38))
              ),
              clinicExamLaneLocked = !!(
                !manualRecoveryActive &&
                w.role === "patient" &&
                (w.group.userData.consultState === "toExam" ||
                  w.group.userData.consultState === "postExamSeat" ||
                  w.group.userData.consultState === "clinicScan") &&
                consultPath?.length
              ),
              followedClinicPatient =
                w.role === "nurse" &&
                w.group.userData.clinicStaffPathMode === "followIn"
                  ? patients.find(
                      (p) =>
                        p.group.uuid === w.group.userData.servicePatient,
                    )
                  : undefined,
              ledClinicPatient =
                w.role === "nurse" &&
                w.group.userData.clinicStaffPathMode === "leadIn"
                  ? patients.find(
                      (p) =>
                        p.group.uuid === w.group.userData.servicePatient,
                    )
                  : undefined,
              escortingClinicNurse =
                w.role === "patient" &&
                w.group.userData.consultState === "inbound"
                  ? clinicNurses.find(
                      (n) =>
                        n.room === w.group.userData.consultRoom &&
                        n.group.userData.clinicStaffPathMode === "leadIn",
                    )
                  : undefined;
            const revolvingDoorQueueTarget =
                revolvingDoorMode === "entry"
                  ? revolvingDoorEntryQueue
                  : revolvingDoorExitQueue,
              atRevolvingDoorQueue = !!(
                revolvingDoorMode &&
                !w.group.userData.revolvingDoorTransit &&
                routeTarget.distanceTo(revolvingDoorQueueTarget) < 0.08
              );
            const activeDoorHoldingTarget =
              revolvingDoorMode === "entry"
                ? entryDoorHoldingTarget
                : exitDoorHoldingTarget;
            if (
              activeDoorHoldingTarget &&
              activeDoorHoldingTarget.distanceTo(revolvingDoorQueueTarget) >=
                0.08 &&
              w.group.position.distanceTo(activeDoorHoldingTarget) < 0.3
            ) {
              w.group.userData.revolvingDoorWaiting = true;
              faceSmooth(w.group, revolvingDoorCenter, 0.2);
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
              w.pause = 0.18;
              return;
            }
            if (
              w.group.userData.revolvingDoorWaiting &&
              (!activeDoorHoldingTarget ||
                w.group.position.distanceTo(activeDoorHoldingTarget) >= 0.34)
            )
              delete w.group.userData.revolvingDoorWaiting;
            if (
              atRevolvingDoorQueue &&
              w.group.position.distanceTo(revolvingDoorQueueTarget) < 0.34
            ) {
              const sameLaneTravelerTooClose = patients.some(
                (other) =>
                  other !== w &&
                  other.group.visible &&
                  other.group.userData.revolvingDoorMode === revolvingDoorMode &&
                  other.group.userData.revolvingDoorTransit &&
                  other.group.position.distanceTo(w.group.position) < 0.92,
              );
              if (!revolvingDoorAdmissionReady() || sameLaneTravelerTooClose) {
                // The two lanes are independent; patients wait only for the
                // glass leaves to finish opening, never for the opposite lane.
                w.group.userData.revolvingDoorWaiting = true;
                faceSmooth(w.group, revolvingDoorCenter, 0.2);
                w.pause = 0.18;
                return;
              }
              if (revolvingDoorMode === "entry")
                removeRevolvingDoorEntryWaiter(w.group.uuid);
              else if (revolvingDoorMode === "exit")
                removeRevolvingDoorExitWaiter(w.group.uuid);
              w.group.userData.revolvingDoorTransit = true;
              w.group.userData.revolvingDoorBaseSpeed = w.speed;
              w.group.userData.revolvingDoorTransitStartedAt = t;
              w.group.userData.revolvingDoorProgressAnchor =
                w.group.position.clone();
              w.group.userData.revolvingDoorNoProgress = 0;
              w.speed = revolvingDoorTransitSpeed;
              w.pause = 0;
              w.group.userData.blockedTime = 0;
              w.group.userData.idleTime = 0;
              w.group.userData.progressAnchor = w.group.position.clone();
              delete w.group.userData.detourGoal;
              delete w.group.userData.yieldGoal;
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
              delete w.group.userData.revolvingDoorWaiting;
            }
            const revolvingDoorLaneLocked = !!(
              revolvingDoorMode && w.group.userData.revolvingDoorTransit
            );
            if (
              revolvingDoorMode === "entry" &&
              w.group.userData.revolvingDoorTransit
            ) {
              const entryLeader = patients
                .filter(
                  (other) =>
                    other !== w &&
                    other.group.visible &&
                    other.group.userData.revolvingDoorMode === "entry" &&
                    other.group.userData.revolvingDoorTransit &&
                    other.group.position.z < w.group.position.z,
                )
                .sort(
                  (a, b) =>
                    b.group.position.z - a.group.position.z,
                )[0];
              if (
                entryLeader &&
                w.group.position.distanceTo(entryLeader.group.position) < 0.84
              ) {
                // Preserve a visible body gap inside the right-hand lane. This
                // is a controlled follow hold, not a navigation failure.
                w.group.userData.revolvingDoorFollowing = true;
                w.pause = 0.018;
                return;
              }
            }
            if (followedClinicPatient) {
              const followGap = w.group.position.distanceTo(
                followedClinicPatient.group.position,
              );
              w.speed = followGap > 1.45 ? 1.42 : followGap > 0.92 ? 1.2 : 0.86;
              // Hold one body length behind a patient who is still walking. Once
              // they start sitting, the nurse immediately peels off to their seat.
              if (followedClinicPatient.action === "walk" && followGap < 0.74) {
                w.pause = 0.018;
                return;
              }
            }
            if (ledClinicPatient) {
              const leadGap = w.group.position.distanceTo(
                ledClinicPatient.group.position,
              );
              // The nurse leads at walking pace and adjusts gently to keep about
              // one body length between both characters.
              w.speed = leadGap < 0.72 ? 1.3 : leadGap > 1.24 ? 0.98 : 1.16;
            }
            if (escortingClinicNurse) {
              const room = (w.group.userData.consultRoom || 1) - 1,
                patientDepth = w.group.position
                  .clone()
                  .sub(clinicDoorPoints[room])
                  .dot(clinicOuts[room]),
                nurseDepth = escortingClinicNurse.group.position
                  .clone()
                  .sub(clinicDoorPoints[room])
                  .dot(clinicOuts[room]),
                escortGap = w.group.position.distanceTo(
                  escortingClinicNurse.group.position,
                );
              w.speed = Math.min(w.speed, 1.1);
              if (nurseDepth > patientDepth && escortGap < 0.68) {
                w.pause = 0.018;
                return;
              }
            }
            if (streetDepartureMode) {
              const leader = navigationCrowd
                .filter(
                  (other) =>
                    other !== w &&
                    other.group.visible &&
                    isSameDirectionStreetTraffic(w, other) &&
                    other.group.position.x < w.group.position.x - 0.015 &&
                    Math.abs(other.group.position.z - w.group.position.z) < 0.72,
                )
                .sort(
                  (a, b) =>
                    b.group.position.x - a.group.position.x,
                )[0];
              if (
                leader &&
                w.group.position.distanceTo(leader.group.position) < 0.82
              ) {
                // Controlled same-speed following never enters blocked recovery,
                // path replanning, or lateral avoidance.
                w.group.userData.streetFollowing = true;
                w.group.userData.blockedTime = 0;
                w.legs.forEach((leg) => (leg.rotation.x *= 0.52));
                w.arms.forEach((arm) => (arm.rotation.x *= 0.52));
                w.pause = 0.018;
                return;
              }
              delete w.group.userData.streetFollowing;
            }
            w.group.userData.allowSeatAccess = !!(
              w.group.userData.leavingSeat || seatGoal
            );
            const targetKey = `${routeTarget.x.toFixed(2)}:${routeTarget.z.toFixed(2)}`;
            let navPath = w.group.userData.navPath as
              | THREE.Vector3[]
              | undefined;
            if (w.group.userData.navTarget !== targetKey || !navPath?.length) {
              navPath =
                clinicNurseSeatLaneLocked ||
                clinicExamLaneLocked ||
                revolvingDoorLaneLocked
                ? [routeTarget.clone()]
                : planPath(
                    w,
                    routeTarget,
                    !w.group.userData.leavingSeat &&
                      !!w.group.userData.navAvoidPeople &&
                      !calledInboundPriority,
                  );
              w.group.userData.navPath = navPath;
              w.group.userData.navTarget = targetKey;
              delete w.group.userData.navAvoidPeople;
            }
            if (!navPath?.length) {
              // Hold safely and request a fresh route instead of reverting to the
              // raw destination, which may sit behind a protected chair row.
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
              // A called patient's clinic route is authoritative. Transient people
              // remain protected by per-step collision checks, but must not keep
              // removing the exact checkpoint from every rebuilt path forever.
              if (calledInboundPriority)
                delete w.group.userData.navAvoidPeople;
              else w.group.userData.navAvoidPeople = true;
              w.group.userData.blockedTime =
                (w.group.userData.blockedTime || 0) + dt;
              w.group.userData.navReplanCooldown = Math.max(
                0.18,
                w.group.userData.navReplanCooldown || 0,
              );
              w.legs.forEach((leg) => (leg.rotation.x *= 0.56));
              w.pause = Math.max(w.pause, 0.06);
              return;
            }
            const target = navPath?.[0] || routeTarget,
              delta = target.clone().sub(w.group.position);
            delta.y = 0;
            // Patients advance workflow checkpoints only after walking within
            // seven centimetres.  The previous 18 cm snap was visible whenever
            // queue, kiosk or doorway recovery replaced a path endpoint.
            const arrivalThreshold = w.role === "patient" ? 0.07 : 0.18;
            if (delta.length() < arrivalThreshold) {
              if (navPath?.length) {
                navPath.shift();
                if (navPath.length) {
                  w.group.userData.idleTime = 0;
                  return;
                }
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
              }
              if (recoveryGoal) {
                delete w.group.userData.recoveryGoal;
                delete w.group.userData.manualRecoveryGoal;
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                delete w.group.userData.crowdStallReplanIssued;
                delete w.group.userData.crowdStallEscapeIssued;
                w.group.userData.blockedTime = 0;
                w.group.userData.navAvoidPeople = true;
                w.group.userData.progressAnchor = w.group.position.clone();
                w.pause = 0.015;
                return;
              }
              if (detourGoal) {
                delete w.group.userData.detourGoal;
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                w.group.userData.blockedTime = 0;
                w.group.userData.escapeAttempt = 0;
                if (w.group.userData.leavingSeat) {
                  seatExitReservations.delete(w.group.uuid);
                  delete w.group.userData.leavingSeat;
                  delete w.group.userData.allowSeatAccess;
                  w.group.userData.progressAnchor = w.group.position.clone();
                  w.group.userData.calledProgressAnchor =
                    w.group.position.clone();
                  w.group.userData.navAvoidPeople = true;
                }
                w.pause = 0.015;
                return;
              }
              if (yieldGoal) {
                delete w.group.userData.yieldGoal;
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                w.group.userData.blockedTime = 0;
                w.pause = 0.025 + Math.random() * 0.035;
                return;
              }
              if (consultPath) {
                if (
                  w.role === "patient" &&
                  w.group.userData.consultState === "inbound"
                ) {
                  const room = (w.group.userData.consultRoom || 1) - 1,
                    roomNurse = clinicNurses[room],
                    atLobbyDoorCheckpoint =
                      routeTarget.distanceTo(doorOutside[room]) < 0.08,
                    nurseReadyToLead =
                      roomNurse?.group.userData.clinicStaffPathMode === "leadIn";
                  // The patient owns the lobby-side checkpoint until the nurse
                  // reaches the door.  This keeps the pair synchronized and
                  // prevents a fast-called patient from entering alone.
                  if (atLobbyDoorCheckpoint && !nurseReadyToLead) {
                    w.group.userData.waitingForClinicNurse = true;
                    w.group.userData.clinicNurseWaitTime =
                      (w.group.userData.clinicNurseWaitTime || 0) + dt;
                    const lastNurseNudge =
                      w.group.userData.lastClinicNurseNudge || -10;
                    if (
                      roomNurse &&
                      w.group.userData.clinicNurseWaitTime > 0.9 &&
                      t - lastNurseNudge > 0.9
                    ) {
                      // Reassert the exact escort assignment if the nurse lost
                      // a navigation segment.  This is a visible walking
                      // recovery, never a position jump.
                      roomNurse.group.userData.roomReady = false;
                      roomNurse.group.userData.servicePatient = w.group.uuid;
                      if (roomNurse.action === "clinicNurseSit") {
                        roomNurse.group.userData.clinicStaffPath = [
                          clinicDoorInsidePoints[room].clone(),
                          clinicDoorCenterPoints[room].clone(),
                          doorOutside[room].clone(),
                          clinicNurseDoorPoints[room].clone(),
                        ];
                        roomNurse.group.userData.clinicStaffPathMode = "doorWait";
                        roomNurse.action = "clinicNurseRise";
                        roomNurse.actionTime = 0;
                      } else if (
                        roomNurse.action === "walk" &&
                        roomNurse.group.userData.clinicStaffPathMode !== "leadIn"
                      ) {
                        // Rebuild from the nurse's current side of the doorway.
                        // Keeping an old but blocked path here made the patient
                        // wait forever even though the escort assignment itself
                        // was still valid.
                        roomNurse.group.userData.clinicStaffPath =
                          clinicNurseDoorWaitPathFromCurrent(roomNurse, room);
                        roomNurse.group.userData.clinicStaffPathMode = "doorWait";
                      }
                      roomNurse.speed = 1.34;
                      roomNurse.pause = 0;
                      delete roomNurse.group.userData.navPath;
                      delete roomNurse.group.userData.navTarget;
                      w.group.userData.lastClinicNurseNudge = t;
                    }
                    w.group.position.copy(routeTarget);
                    delete w.group.userData.navPath;
                    delete w.group.userData.navTarget;
                    w.pause = 0.035;
                    return;
                  }
                  delete w.group.userData.waitingForClinicNurse;
                  delete w.group.userData.clinicNurseWaitTime;
                  delete w.group.userData.lastClinicNurseNudge;
                }
                w.group.position.copy(routeTarget);
                consultPath.shift();
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                if (consultPath.length) {
                  w.pause = 0.015;
                  w.stuck = 0;
                  return;
                }
                if (w.group.userData.consultState === "toExam") {
                  delete w.group.userData.consultPath;
                  w.action = "bedSit";
                  w.actionTime = 0;
                  w.pause = 0;
                  w.stuck = 0;
                  return;
                }
                if (w.group.userData.consultState === "inbound") {
                  delete w.group.userData.consultPath;
                  w.action = "clinicChairSit";
                  w.actionTime = 0;
                  w.pause = 0;
                  w.stuck = 0;
                  const room = (w.group.userData.consultRoom || 1) - 1;
                  w.group.position.copy(clinicPatientSeatApproaches[room]);
                  return;
                }
                if (w.group.userData.consultState === "postExamSeat") {
                  delete w.group.userData.consultPath;
                  w.group.userData.postExamSeat = true;
                  w.action = "clinicChairSit";
                  w.actionTime = 0;
                  w.pause = 0;
                  w.stuck = 0;
                  const room = (w.group.userData.consultRoom || 1) - 1;
                  w.group.position.copy(clinicPatientSeatApproaches[room]);
                  const doctor = doctors[room];
                  if (
                    doctor?.action === "examCare" &&
                    doctor.group.userData.examFinishedWaiting
                  ) {
                    delete doctor.group.userData.examFinishedWaiting;
                    poseStanding(doctor);
                    doctor.group.userData.doctorPath = [
                      clinicDoctorRetreatPoints[room].clone(),
                      clinicDoctorSeats[room].clone(),
                    ];
                    doctor.group.userData.doctorPathMode = "return";
                    doctor.action = "walk";
                    doctor.actionTime = 0;
                    doctor.pause = 0.04;
                    delete doctor.group.userData.navPath;
                    delete doctor.group.userData.navTarget;
                  }
                  return;
                }
                delete w.group.userData.consultPath;
                delete w.group.userData.consultState;
                delete w.group.userData.consultDoctor;
                w.pause = 0.12;
                w.stuck = 0;
                return;
              }
              if (lifecyclePath) {
                w.group.position.copy(routeTarget);
                lifecyclePath.shift();
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                if (w.group.userData.pickupSeatExit) {
                  // The patient has cleared the chair using the owned pickup
                  // corridor. From here the medicine queue remains the only goal.
                  seatExitReservations.delete(w.group.uuid);
                  delete w.group.userData.pickupSeatExit;
                  delete w.group.userData.allowSeatAccess;
                }
                if (
                  w.group.userData.visitPhase === "leaving" &&
                  w.group.userData.revolvingDoorTransit &&
                  routeTarget.distanceTo(
                    revolvingDoorExitPath[revolvingDoorExitPath.length - 1],
                  ) < 0.14
                ) {
                  // Release the compartment as soon as the patient reaches the
                  // pavement. The remaining full-street walk must not keep the
                  // revolving door locked for everyone behind them.
                  if (w.group.userData.revolvingDoorBaseSpeed !== undefined)
                    w.speed = w.group.userData.revolvingDoorBaseSpeed;
                  delete w.group.userData.revolvingDoorBaseSpeed;
                  w.group.userData.streetDepartureMode = true;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                  delete w.group.userData.navAvoidPeople;
                  delete w.group.userData.detourGoal;
                  delete w.group.userData.yieldGoal;
                  delete w.group.userData.revolvingDoorTransitStartedAt;
                  delete w.group.userData.revolvingDoorProgressAnchor;
                  delete w.group.userData.revolvingDoorNoProgress;
                  delete w.group.userData.revolvingDoorWaiting;
                  delete w.group.userData.revolvingDoorTransit;
                  delete w.group.userData.revolvingDoorMode;
                }
                if (lifecyclePath.length) {
                  // Do not stop at the small arc-control points inside a moving
                  // compartment.  They form one continuous one-way walk.
                  w.pause = w.group.userData.revolvingDoorTransit
                    ? 0
                    : 0.04 + Math.random() * 0.05;
                  return;
                }
                delete w.group.userData.lifecyclePath;
                if (w.group.userData.revolvingDoorBaseSpeed !== undefined)
                  w.speed = w.group.userData.revolvingDoorBaseSpeed;
                delete w.group.userData.revolvingDoorBaseSpeed;
                delete w.group.userData.revolvingDoorTransitStartedAt;
                delete w.group.userData.revolvingDoorProgressAnchor;
                delete w.group.userData.revolvingDoorNoProgress;
                delete w.group.userData.revolvingDoorWaiting;
                delete w.group.userData.revolvingDoorTransit;
                delete w.group.userData.revolvingDoorMode;
                if (w.group.userData.visitPhase === "leaving") {
                  completePatientDeparture(w);
                  return;
                }
                if (w.group.userData.visitPhase === "entering") {
                  removeRevolvingDoorEntryWaiter(w.group.uuid);
                  // Crossing the right-hand entrance lane completes admission.
                  // Enrol immediately instead of leaving a one-frame pre-scan
                  // state that could miss queue synchronization after a route
                  // recovery at the doorway.
                  w.group.userData.visitPhase = "checkin";
                  w.group.userData.scanCooldown = 0.6 + Math.random() * 1.6;
                  delete w.group.userData.counterQueueWaiting;
                  delete w.group.userData.counterClaimed;
                  if (!counterServiceQueue.includes(w.group.uuid)) {
                    counterServiceQueue.push(w.group.uuid);
                    w.group.userData.counterQueueOrder =
                      ++counterArrivalSequence;
                  }
                  w.pause = 0;
                  return;
                }
                if (w.group.userData.visitPhase === "payment") {
                  w.group.position.copy(kioskApproachPoint);
                  w.action = "kioskPayment";
                  w.actionTime = 0;
                  w.pause = 0;
                  return;
                }
                if (w.group.userData.visitPhase === "pickup") {
                  w.action = "medicinePickup";
                  w.actionTime = 0;
                  w.pause = 0;
                  w.group.position.copy(medicinePickupPoint);
                  return;
                }
              }
              if (
                pickupGoal &&
                !w.group.userData.counterClaimed &&
                routeTarget.distanceTo(pickupGoal) < 0.08
              ) {
                // Waiting at the medicine queue is an intentional stop, not
                // lobby roaming. Normal detours can move the patient away, but
                // the locked pickup goal is restored as soon as they clear.
                w.group.position.copy(pickupGoal);
                faceSmooth(w.group, counterPublicPoint, 0.26);
                w.group.userData.pickupAtQueue = true;
                w.group.userData.idleTime = 0;
                w.group.userData.progressAnchor = w.group.position.clone();
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                w.pause = 0.18;
                return;
              }
              if (doctorPath && w.role === "doctor") {
                w.group.position.copy(routeTarget);
                doctorPath.shift();
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                if (doctorPath.length) {
                  w.pause = 0.015;
                  return;
                }
                const mode = w.group.userData.doctorPathMode;
                delete w.group.userData.doctorPath;
                delete w.group.userData.doctorPathMode;
                if (mode === "examCare") {
                  w.action = "examCare";
                  w.actionTime = 0;
                  w.group.userData.examDuration = 5.5 + Math.random() * 0.7;
                  w.pause = 0;
                  return;
                }
                if (mode === "interior") {
                  w.action = "readChart";
                  w.actionTime = 0;
                  w.group.userData.returnToClinicAfterRead = true;
                  w.pause = 0;
                  return;
                }
                if (mode === "knockExit" && w.room) {
                  delete w.group.userData.greetOnExit;
                  w.group.userData.doorGreeting = w.room;
                  w.group.userData.waveResume = "walk";
                  w.action = "wave";
                  w.actionTime = 0;
                  w.pause = 0;
                  return;
                }
                if ((mode === "return" || mode === "knockReturn") && w.room) {
                  w.group.position.copy(clinicDoctorSeats[w.room - 1]);
                  w.action = "clinicSit";
                  w.actionTime = 0;
                  w.stuck = 0;
                  poseSeated(w, clinicDoctorYaws[w.room - 1]);
                  return;
                }
                w.pause = 0;
                return;
              }
              if (clinicStaffPath && w.role === "nurse" && w.room) {
                w.group.position.copy(routeTarget);
                clinicStaffPath.shift();
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                if (clinicStaffPath.length) {
                  w.pause = 0.015;
                  return;
                }
                const mode = w.group.userData.clinicStaffPathMode,
                  room = w.room - 1;
                delete w.group.userData.clinicStaffPath;
                delete w.group.userData.clinicStaffPathMode;
                if (mode === "doorWait") {
                  w.action = "clinicNurseDoor";
                  w.actionTime = 0;
                  w.pause = 0;
                  return;
                }
                if (mode === "bedTidy") {
                  w.action = "clinicNurseTidy";
                  w.actionTime = 0;
                  w.pause = 0;
                  return;
                }
                if (mode === "examStand") {
                  w.action = "clinicNurseExamStand";
                  w.actionTime = 0;
                  w.pause = 0;
                  return;
                }
                // Finish through one deterministic seat-entry animation instead
                // of handing the chair centre back to pathfinding.  That removes
                // the repeated in/out correction around the chair obstacle.
                w.group.position.copy(clinicNurseSeatExitPoints[room]);
                w.group.userData.clinicSeatCompletionMode = mode;
                w.group.userData.clinicSeatEntryYaw = w.group.rotation.y;
                w.action = "clinicNurseSeatEntry";
                w.actionTime = 0;
                w.pause = 0;
                return;
              }
              if (qrGoal && w.role === "patient") {
                delete w.group.userData.qrGoal;
                delete w.group.userData.qrStation;
                w.group.userData.qrQueueGoal =
                  qrQueuePoints[(i + 1) % qrQueuePoints.length].clone();
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                w.pause = 0.04;
                return;
              }
              if (qrQueueGoal && w.role === "patient") {
                delete w.group.userData.qrQueueGoal;
                w.group.userData.qrQueueIndex =
                  ((w.group.userData.qrQueueIndex || 0) + 1 + i) %
                  qrQueuePoints.length;
                const claimed = w.group.userData.pendingSeatAfterScan
                  ? reserveSeatAfterScan(w)
                  : w.group.userData.visitPhase === "preScan"
                    ? claimLobbyQrStation(w)
                    : false;
                if (!claimed)
                  w.group.userData.qrQueueGoal =
                    qrQueuePoints[w.group.userData.qrQueueIndex].clone();
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                w.pause = 0.04;
                return;
              }
              if (seatGoal && w.role === "patient") {
                finishLobbySit(w);
                return;
              }
              if (
                w.role === "doctor" &&
                w.room &&
                routeTarget.distanceTo(clinicDoctorSeats[w.room - 1]) < 0.05
              ) {
                w.group.position.copy(clinicDoctorSeats[w.room - 1]);
                w.action = "clinicSit";
                w.actionTime = 0;
                w.stuck = 0;
                poseSeated(w, clinicDoctorYaws[w.room - 1]);
                return;
              }
              w.waypoint = (w.waypoint + 1) % w.route.length;
              delete w.group.userData.navPath;
              delete w.group.userData.navTarget;
              w.pause = 0.08 + Math.random() * 0.22;
              w.stuck = 0;
              return;
            }
            delta.normalize();
            const desired = delta.clone(),
              calledPairBlocker = calledInboundPriority
                ? navigationCrowd
                    .filter(
                      (other) =>
                        other !== w &&
                        isCalledInboundPatient(other) &&
                        other.group.position.distanceTo(w.group.position) < 1.08,
                    )
                    .sort(
                      (a, b) =>
                        a.group.position.distanceTo(w.group.position) -
                        b.group.position.distanceTo(w.group.position),
                    )[0]
                : undefined,
              calledPairGap = calledPairBlocker
                ? w.group.position.distanceTo(calledPairBlocker.group.position)
                : Infinity,
              calledPairToward = calledPairBlocker
                ? calledPairBlocker.group.position
                    .clone()
                    .sub(w.group.position)
                    .setY(0)
                    .normalize()
                : new THREE.Vector3(),
              calledPairOtherForward = calledPairBlocker
                ? new THREE.Vector3(
                    -Math.sin(calledPairBlocker.group.rotation.y),
                    0,
                    -Math.cos(calledPairBlocker.group.rotation.y),
                  )
                : new THREE.Vector3(),
              calledPairHeadOn = !!(
                calledPairBlocker &&
                desired.dot(calledPairToward) > 0.18 &&
                calledPairOtherForward.dot(desired) < -0.12
              ),
              selfCalledPriority = Number(
                w.group.userData.calledTransitPriority || Number.MAX_SAFE_INTEGER,
              ),
              otherCalledPriority = Number(
                calledPairBlocker?.group.userData.calledTransitPriority ||
                  Number.MAX_SAFE_INTEGER,
              ),
              yieldsToCalledPatient = !!(
                calledPairBlocker &&
                (calledPairGap < 0.62 || calledPairHeadOn) &&
                (selfCalledPriority > otherCalledPriority ||
                  (selfCalledPriority === otherCalledPriority &&
                    w.group.id > calledPairBlocker.group.id))
              ),
              calledYieldPrimary = yieldsToCalledPatient
                ? w.group.position
                    .clone()
                    .sub(calledPairBlocker!.group.position)
                    .setY(0)
                : undefined,
              avoidanceSide =
                (w.group.userData.avoidanceSideUntil || 0) > t
                  ? Number(w.group.userData.avoidanceSide || 1)
                  : 0,
              portalLocked =
                !manualRecoveryActive &&
                !!transitRoom &&
                inAssignedDoorPortal(w, w.group.position),
              releaseLaneLocked = !!(
                !manualRecoveryActive && w.group.userData.leavingSeat
              ),
              seatEntryLaneLocked = !!(
                !manualRecoveryActive &&
                seatGoal &&
                w.group.position.distanceTo(seatGoal) < 1.08
              ),
              collisionLaneLocked =
                portalLocked ||
                revolvingDoorLaneLocked ||
                releaseLaneLocked ||
                seatEntryLaneLocked ||
                clinicNurseSeatLaneLocked ||
                clinicExamLaneLocked,
              peopleBypassLaneLocked =
                portalLocked ||
                revolvingDoorLaneLocked ||
                clinicNurseSeatLaneLocked ||
                clinicExamLaneLocked,
              repel = new THREE.Vector3();
            if (!collisionLaneLocked)
              navigationCrowd.forEach((o) => {
                if (
                  o === w ||
                  !o.group.visible ||
                  counterHeadPassThroughPair(w, o) ||
                  bypassGenericStreetAvoidance(w, o)
                )
                  return;
                const away = w.group.position.clone().sub(o.group.position);
                away.y = 0;
                const d = away.length();
                if (d <= 0.001) {
                  const seed = (w.group.id * 17 + o.group.id * 31) * 0.37;
                  away.set(Math.cos(seed), 0, Math.sin(seed));
                  repel.addScaledVector(away, 1.2);
                } else if (d < 1.25)
                  repel.addScaledVector(away.normalize(), (1.25 - d) / 1.25);
              });
            const headOnWalker = collisionLaneLocked
                ? undefined
                : navigationCrowd.find((o) => {
                    if (
                      o === w ||
                      !o.group.visible ||
                      counterHeadPassThroughPair(w, o) ||
                      bypassGenericStreetAvoidance(w, o) ||
                      o.action !== "walk" ||
                      o.pause > 0
                    )
                      return false;
                    const toward = o.group.position.clone().sub(w.group.position);
                    toward.y = 0;
                    const distance = toward.length();
                    if (distance < 0.02 || distance > 1.45) return false;
                    toward.normalize();
                    const otherForward = new THREE.Vector3(
                      -Math.sin(o.group.rotation.y),
                      0,
                      -Math.cos(o.group.rotation.y),
                    );
                    return (
                      desired.dot(toward) > 0.34 &&
                      otherForward.dot(toward) < -0.18
                    );
                  }),
              passRight = headOnWalker
                ? new THREE.Vector3(-desired.z, 0, desired.x).multiplyScalar(
                    0.92 * (avoidanceSide || 1),
                  )
                : new THREE.Vector3(),
              primary = calledYieldPrimary
                ? calledYieldPrimary
                    .normalize()
                    .add(
                      new THREE.Vector3(-desired.z, 0, desired.x).multiplyScalar(
                        w.group.id % 2 === 0 ? 0.42 : -0.42,
                      ),
                    )
                    .normalize()
                : manualRecoveryActive
                ? desired
                : collisionLaneLocked
                ? desired
                : desired
                    .clone()
                    .addScaledVector(repel, headOnWalker ? 0.38 : 0.72)
                    .add(passRight)
                    .normalize(),
              angles = yieldsToCalledPatient
                ? [0, 0.3, -0.3, 0.62, -0.62, 0.94, -0.94]
                : manualRecoveryActive
                ? [0, 0.18, -0.18, 0.36, -0.36, 0.56, -0.56]
                : portalLocked ||
                revolvingDoorLaneLocked ||
                clinicNurseSeatLaneLocked ||
                clinicExamLaneLocked
                ? [0]
                : seatEntryLaneLocked
                  ? [0, 0.16, -0.16, 0.3, -0.3]
                  : releaseLaneLocked
                  ? [0, 0.18, -0.18, 0.36, -0.36]
                  : headOnWalker
                    ? avoidanceSide
                      ? [
                          0,
                          0.22 * avoidanceSide,
                          0.48 * avoidanceSide,
                          0.82 * avoidanceSide,
                          -0.22 * avoidanceSide,
                          -0.48 * avoidanceSide,
                        ]
                      : [0, 0.22, -0.22, 0.48, -0.48, 0.82, -0.82]
                    : avoidanceSide
                      ? [
                          0,
                          0.34 * avoidanceSide,
                          0.68 * avoidanceSide,
                          1.05 * avoidanceSide,
                          -0.34 * avoidanceSide,
                          -0.68 * avoidanceSide,
                          1.55 * avoidanceSide,
                        ]
                      : [
                          0,
                          0.34,
                          -0.34,
                          0.68,
                          -0.68,
                          1.05,
                          -1.05,
                          1.55,
                          -1.55,
                        ],
              step = w.speed * dt;
            let steer: THREE.Vector3 | undefined,
              candidate: THREE.Vector3 | undefined;
            for (const angle of angles) {
              const dir = primary
                  .clone()
                  .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle),
                p = w.group.position.clone().addScaledVector(dir, step),
                dedicatedDoorStep = portalLocked && inAssignedDoorCore(w, p),
                dedicatedRevolvingDoorStep =
                  revolvingDoorLaneLocked &&
                  inAutomaticDoorTransitLane(w, p),
                dedicatedNurseSeatStep =
                  clinicNurseSeatLaneLocked && boundaryClear(w, p),
                dedicatedLobbySeatStep =
                  seatEntryLaneLocked &&
                  boundaryClear(w, p) &&
                  !navBlocked(w, p, 0.3, seatObstacleAccess(w)) &&
                  peopleStepClear(p, w, 0.34),
                dedicatedExamStep =
                  clinicExamLaneLocked &&
                  boundaryClear(w, p) &&
                  !navBlocked(w, p, 0.28, seatObstacleAccess(w));
              if (
                dedicatedDoorStep ||
                dedicatedRevolvingDoorStep ||
                dedicatedNurseSeatStep ||
                dedicatedLobbySeatStep ||
                dedicatedExamStep ||
                (boundaryClear(w, p) &&
                  !navBlocked(w, p, 0.32, seatObstacleAccess(w)) &&
                  (peopleBypassLaneLocked ||
                    (manualRecoveryActive
                      ? manualRecoveryPeopleStepClear(p, w)
                      : peopleStepClear(
                          p,
                          w,
                          releaseLaneLocked ? 0.34 : 0.53,
                        ))))
              ) {
                steer = dir;
                candidate = p;
                break;
              }
            }
            if (!candidate || !steer) {
              w.group.userData.blockedTime =
                (w.group.userData.blockedTime || 0) + dt;
              w.legs.forEach((leg) => (leg.rotation.x *= 0.56));
              const sideStillLocked =
                (w.group.userData.avoidanceSideUntil || 0) > t;
              // A real obstruction must persist before recovery starts. Stop first,
              // then commit to the clearer side long enough to avoid frame-by-frame
              // left/right reversals.
              if (
                w.group.userData.blockedTime > 0.3 &&
                !sideStillLocked &&
                !w.group.userData.detourGoal
              ) {
                w.group.userData.avoidanceSide = chooseRecoverySide(
                  w,
                  routeTarget,
                );
                w.group.userData.avoidanceSideUntil =
                  t + 0.6 + Math.random() * 0.3;
                w.group.userData.blockRecoveryPause = true;
                w.pause = Math.max(w.pause, 0.15 + Math.random() * 0.15);
                return;
              }
              if (!exclusiveTransit) {
                if (
                  w.group.userData.blockedTime > 0.3 &&
                  !w.group.userData.detourGoal
                ) {
                  const escape = escapeStep(
                    w,
                    routeTarget,
                    Number(w.group.userData.avoidanceSide || 1),
                  );
                  if (escape) {
                    w.group.userData.detourGoal = escape;
                    w.group.userData.escapeAttempt =
                      (w.group.userData.escapeAttempt || 0) + 1;
                    delete w.group.userData.navPath;
                    delete w.group.userData.navTarget;
                    w.group.userData.navAvoidPeople = true;
                    w.group.userData.blockedTime = 0;
                    w.group.userData.navReplanCooldown = Math.max(
                      0.35,
                      w.group.userData.navReplanCooldown || 0,
                    );
                    faceSmooth(w.group, escape, 0.18);
                  }
                }
                if (
                  w.group.userData.blockedTime > 0.9 &&
                  w.group.userData.detourGoal &&
                  !sideStillLocked
                ) {
                  delete w.group.userData.detourGoal;
                  w.group.userData.escapeAttempt =
                    (w.group.userData.escapeAttempt || 0) + 1;
                  delete w.group.userData.navPath;
                  delete w.group.userData.navTarget;
                  w.group.userData.navAvoidPeople = true;
                  w.group.userData.blockedTime = 0;
                  delete w.group.userData.avoidanceSideUntil;
                }
              }
              if (
                w.group.userData.blockedTime > 0.42 &&
                w.group.userData.navReplanCooldown <= 0
              ) {
                delete w.group.userData.navPath;
                delete w.group.userData.navTarget;
                if (calledInboundPriority)
                  delete w.group.userData.navAvoidPeople;
                else w.group.userData.navAvoidPeople = true;
                w.group.userData.navReplanCooldown = 0.38;
              }
              return;
            }
            w.group.userData.blockedTime = 0;
            w.group.position.copy(candidate);
            w.group.userData.lastSafePosition = candidate.clone();
            faceSmooth(
              w.group,
              w.group.position.clone().add(steer),
              w.group.userData.turnRate,
            );
            const gait =
              t * w.group.userData.gaitRate + w.group.userData.gaitPhase;
            w.legs[0].rotation.x = Math.sin(gait) * 0.42;
            w.legs[1].rotation.x = -Math.sin(gait) * 0.42;
            if (w.role === "doctor") {
              w.arms[0].rotation.x = 0.58;
              w.arms[0].rotation.z = 0.18;
              w.arms[1].rotation.x = Math.sin(gait) * 0.22;
            } else if (
              w.role === "patient" &&
              w.medicineBag?.visible
            ) {
              // Keep the carried bag vertical: the carrying arm stays relaxed
              // while the free arm continues the normal walking swing.
              w.arms[0].rotation.x = 0.06;
              w.arms[0].rotation.z = 0.08;
              w.arms[1].rotation.x = Math.sin(gait) * 0.26;
              w.medicineBag.rotation.set(0, 0, 0);
            } else if (
              w.role === "nurse" &&
              w.room &&
              w.group.userData.clinicStaffPathMode === "doorWait" &&
              w.group.position.distanceTo(clinicDoorPoints[w.room - 1]) < 1.5
            ) {
              w.arms[0].rotation.x = 1.08;
              w.arms[0].rotation.z = 0.26;
              w.arms[1].rotation.x = Math.sin(gait) * 0.18;
            } else if (
              w.role === "patient" &&
              w.group.userData.consultState === "leaving" &&
              w.group.position.distanceTo(
                clinicDoorPoints[(w.group.userData.consultRoom || 1) - 1],
              ) < 1.5
            ) {
              w.arms[0].rotation.x = 1.02;
              w.arms[0].rotation.z = 0.24;
              w.arms[1].rotation.x = Math.sin(gait) * 0.18;
            } else {
              w.arms[0].rotation.x = -Math.sin(gait) * 0.3;
              w.arms[1].rotation.x = Math.sin(gait) * 0.3;
            }
            w.stuck = 0;
          } catch (error) {
            const safe = w.group.userData.lastSafePosition as
                | THREE.Vector3
                | undefined,
              retryScanSeat =
                !!w.group.userData.postScanSit ||
                !!w.group.userData.pendingSeatAfterScan;
            poseStanding(w);
            w.action = "walk";
            w.actionTime = 0;
            w.pause = 0;
            w.stuck = 0;
            w.group.userData.blockedTime = 0;
            w.group.userData.idleTime = 0;
            delete w.group.userData.navPath;
            delete w.group.userData.navTarget;
            delete w.group.userData.seatGoal;
            delete w.group.userData.yieldGoal;
            delete w.group.userData.postScanSit;
            if (retryScanSeat) {
              w.group.userData.pendingSeatAfterScan = true;
              w.group.userData.seatRetryCooldown = 0.3;
            }
            if (safe && !hasExclusivePatientTransit(w))
              w.group.userData.detourGoal = safe.clone();
            w.group.userData.navAvoidPeople = true;
            if (t - (w.group.userData.lastActorErrorAt || -10) > 3) {
              console.error("Recovered character navigation", w.role, i, error);
              w.group.userData.lastActorErrorAt = t;
            }
          }
        });
        patients.forEach((p, index) => {
          if (p.group.userData.activePatient) return;
          detachPatientMonitor(p);
          p.group.userData.respawnTimer = Math.max(
            0,
            (p.group.userData.respawnTimer || 0) - dt,
          );
          if (
            p.group.userData.respawnTimer <= 0 &&
            admissionPatientCount() < 12
          )
            spawnNewPatient(p, index);
        });
        // Maintain the requested five-to-seven *actually seated* patients.
        // Keeping one or two additional scan/approach intents ready prevents
        // normal 6–12 second rotations and clinic calls from draining the room.
        const seatedLobbyPatients = lobbySeatedPatientCount(),
          lobbySeatTarget = 7;
        if (
          (seatedLobbyPatients < 5 ||
            lobbySeatIntentCount() < lobbySeatTarget) &&
          t - lastSeatFillAt > (seatedLobbyPatients < 5 ? 0.12 : 0.28)
        ) {
          const candidate = patients
            .filter(
              (p) =>
                p.group.visible &&
                p.group.userData.activePatient &&
                p.action === "walk" &&
                p.group.userData.visitPhase === "queue" &&
                !p.group.userData.consultPath &&
                !p.group.userData.lifecyclePath &&
                !p.group.userData.seatGoal &&
                !p.group.userData.leavingSeat &&
                !p.group.userData.qrGoal &&
                !p.group.userData.qrQueueGoal &&
                p.group.userData.queueCycleCooldown <= 0,
            )
            .sort(
              (a, b) =>
                (a.group.userData.lastSitOrder || 0) -
                (b.group.userData.lastSitOrder || 0),
            )[0];
          if (candidate) {
            if (!claimLobbyQrStation(candidate))
              candidate.group.userData.qrQueueGoal =
                qrQueuePoints[
                  (patients.indexOf(candidate) + Math.floor(t / 2.4)) %
                    qrQueuePoints.length
                ].clone();
            lastSeatFillAt = t;
          }
        }
        const livePatientCount = hospitalPatientCount();
        if (livePatientCount !== lastReportedPatientCount) {
          lastReportedPatientCount = livePatientCount;
          onPatientCount(livePatientCount);
        }
        // Seating is driven only by the canonical waiting checkpoints. No unrelated
        // patient is assigned a chair, so every seated interval is a fresh 6–12
        // second wait that can be interrupted immediately by a clinic call.
        // A final gentle separation pass prevents two characters from occupying the same space.
        const movers = [...doctors, ...nurses, ...patients];
        for (let a = 0; a < movers.length; a++)
          for (let b = a + 1; b < movers.length; b++) {
            const wa = movers[a],
              wb = movers[b];
            if (
              !wa.group.visible ||
              !wb.group.visible ||
              counterHeadPassThroughPair(wa, wb) ||
              (isStreetDepartingPatient(wa) &&
                isStreetDepartingPatient(wb)) ||
              hasExclusivePatientTransit(wa) ||
              hasExclusivePatientTransit(wb) ||
              !!wa.group.userData.doctorPath ||
              !!wb.group.userData.doctorPath ||
              wa.action === "sit" ||
              wb.action === "sit" ||
              wa.action === "clinicSit" ||
              wb.action === "clinicSit" ||
              wa.action === "clinicChairSit" ||
              wb.action === "clinicChairSit" ||
              wa.action === "consultSit" ||
              wb.action === "consultSit" ||
              wa.action === "postExamTalk" ||
              wb.action === "postExamTalk" ||
              wa.action === "postScanTalk" ||
              wb.action === "postScanTalk" ||
              wa.action === "clinicScan" ||
              wb.action === "clinicScan" ||
              wa.action === "bedSit" ||
              wb.action === "bedSit" ||
              wa.action === "examBed" ||
              wb.action === "examBed" ||
              wa.action === "bedExit" ||
              wb.action === "bedExit" ||
              wa.action === "examCare" ||
              wb.action === "examCare" ||
              wa.action === "medicinePickup" ||
              wb.action === "medicinePickup"
            )
              continue;
            const gap = wa.group.position.clone().sub(wb.group.position);
            gap.y = 0;
            let dist = gap.length();
            const safeGap =
              wa.group.userData.eyeAssistant || wb.group.userData.eyeAssistant
                ? 0.7
                : 0.5;
            if (dist < safeGap) {
              if (dist < 0.01) {
                gap.set(Math.cos(a + b), 0, Math.sin(a - b)).normalize();
                dist = 0;
              } else gap.normalize();
              const push = (safeGap + 0.02 - dist) * 0.22 + 0.003,
                pa = wa.group.position.clone().addScaledVector(gap, push),
                pb = wb.group.position.clone().addScaledVector(gap, -push);
              if (
                boundaryClear(wa, pa) &&
                !navBlocked(wa, pa, 0.28, seatObstacleAccess(wa))
              ) {
                wa.group.position.copy(pa);
                wa.group.userData.lastSafePosition = pa.clone();
                if (wa.action === "walk") {
                  delete wa.group.userData.navPath;
                  delete wa.group.userData.navTarget;
                  wa.group.userData.navAvoidPeople = true;
                  wa.group.userData.blockedTime = 0;
                }
              }
              if (
                boundaryClear(wb, pb) &&
                !navBlocked(wb, pb, 0.28, seatObstacleAccess(wb))
              ) {
                wb.group.position.copy(pb);
                wb.group.userData.lastSafePosition = pb.clone();
                if (wb.action === "walk") {
                  delete wb.group.userData.navPath;
                  delete wb.group.userData.navTarget;
                  wb.group.userData.navAvoidPeople = true;
                  wb.group.userData.blockedTime = 0;
                }
              }
            }
          }
        // Guard the rendered patient track against any remaining workflow or
        // recovery jump. Newly spawned (previously hidden) patients establish a
        // fresh anchor; visible walking patients may advance only by a plausible
        // frame-sized step. This catches future direct coordinate corrections
        // without interfering with deliberate sit/bed pose animations.
        patients.forEach((patient) => {
          const visible = !!(
              patient.group.visible && patient.group.userData.activePatient
            ),
            wasVisible = !!patient.group.userData.renderWasVisible,
            anchor = patient.group.userData.renderPositionAnchor as
              | THREE.Vector3
              | undefined;
          if (!visible) {
            patient.group.userData.renderWasVisible = false;
            delete patient.group.userData.renderPositionAnchor;
            return;
          }
          if (!wasVisible || !anchor) {
            patient.group.userData.renderWasVisible = true;
            patient.group.userData.renderPositionAnchor =
              patient.group.position.clone();
            return;
          }
          if (patient.action === "walk") {
            const displacement = patient.group.position
                .clone()
                .sub(anchor),
              distance = displacement.length(),
              maxVisibleStep = Math.max(0.05, patient.speed * dt * 1.55);
            if (distance > maxVisibleStep) {
              displacement.multiplyScalar(maxVisibleStep / distance);
              patient.group.position.copy(anchor).add(displacement);
            }
          }
          anchor.copy(patient.group.position);
          patient.group.userData.renderWasVisible = true;
        });
        nurses.forEach((n) => {
          if (
            n.action !== "walk" ||
            n.pause > 0 ||
            n.group.userData.talkCooldown > 0 ||
            inConversationNoStopZone(n.group.position)
          )
            return;
          const p = patients.find(
            (p) =>
              p.group.visible &&
              p.group.userData.activePatient &&
              p.action === "walk" &&
              !p.group.userData.consultPath &&
              !p.group.userData.lifecyclePath &&
              !p.group.userData.seatGoal &&
              !p.group.userData.pendingSeatAfterScan &&
              !p.group.userData.pickupFlowLocked &&
              p.group.userData.visitPhase !== "leaving" &&
              p.group.userData.talkCooldown <= 0 &&
              conversationPairIsClear(n, p) &&
              p.group.position.distanceTo(n.group.position) < 1.12,
          );
          if (p) {
            const duration = 5 + Math.random() * 3;
            n.action = "socialTalk";
            p.action = "socialTalk";
            n.actionTime = 0;
            p.actionTime = 0;
            n.pause = 0;
            p.pause = 0;
            n.group.userData.talkPartner = p.group.uuid;
            p.group.userData.talkPartner = n.group.uuid;
            n.group.userData.talkDuration = duration;
            p.group.userData.talkDuration = duration;
            n.group.userData.talkCooldown = duration + 7 + Math.random() * 5;
            p.group.userData.talkCooldown = duration + 7 + Math.random() * 5;
            delete n.group.userData.navPath;
            delete n.group.userData.navTarget;
            delete p.group.userData.navPath;
            delete p.group.userData.navTarget;
            faceFlat(n.group, p.group.position);
            faceFlat(p.group, n.group.position);
          }
        });
        // Measure real displacement rather than merely counting actors whose state
        // says "walk". The latter was the root of the one-minute freeze: blocked
        // actors still counted as active and therefore disabled the old watchdog.
        let movingNow = 0;
        movers.forEach((w) => {
          if (!w.group.visible) return;
          const anchor = w.group.userData.motionAnchor as
            | THREE.Vector3
            | undefined;
          if (!anchor) w.group.userData.motionAnchor = w.group.position.clone();
          else {
            if (
              w.action === "walk" &&
              w.group.position.distanceTo(anchor) > 0.0035
            )
              movingNow++;
            anchor.copy(w.group.position);
          }
        });
        lowMotionTime =
          movingNow < 3
            ? lowMotionTime + dt
            : Math.max(0, lowMotionTime - dt * 2.5);
        if (lowMotionTime > 1.25) {
          [...nurses, ...patients, ...doctors]
            .filter(
              (w) =>
                w.group.visible &&
                w.action === "walk" &&
                !isActiveDoorTransit(w) &&
                !hasExclusivePatientTransit(w) &&
                (w.group.userData.idleTime || 0) > 0.45,
            )
            .sort(
              (a, b) =>
                (b.group.userData.idleTime || 0) -
                (a.group.userData.idleTime || 0),
            )
            .slice(0, 7)
            .forEach((w) => rerouteStalledWalker(w, walkers.indexOf(w)));
          const doctor = doctors.find(
            (d) =>
              d.action === "clinicSit" &&
              d.actionTime > 4 &&
              !d.group.userData.consultQueued &&
              !patients.some(
                (p) =>
                  p.group.userData.consultRoom === d.room &&
                  (p.action === "clinicChairSit" ||
                    p.action === "consultSit" ||
                    p.action === "postExamTalk" ||
                    p.action === "postScanTalk" ||
                    p.action === "clinicScan" ||
                    p.action === "bedSit" ||
                    p.action === "examBed" ||
                    p.action === "bedExit" ||
                    p.group.userData.consultState === "inbound" ||
                    p.group.userData.consultState === "toExam" ||
                    p.group.userData.consultState === "postExamSeat"),
              ),
          );
          if (doctor) {
            poseStanding(doctor);
            doctor.group.userData.doctorPath = [
              doctor.route[1],
              doctor.route[2],
            ].map((p) => p.clone());
            doctor.group.userData.doctorPathMode = "interior";
            doctor.action = "walk";
            doctor.actionTime = 0;
            doctor.pause = 0;
            delete doctor.group.userData.navPath;
            delete doctor.group.userData.navTarget;
          }
          lowMotionTime = 0;
        }
        }
        const cameraTransition = cameraTransitionRef.current;
        if (cameraTransition) {
          const progress = THREE.MathUtils.clamp(
              (performance.now() - cameraTransition.startedAt) /
                cameraTransition.duration,
              0,
              1,
            ),
            eased =
              progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
          camera.position.lerpVectors(
            cameraTransition.fromPosition,
            cameraTransition.toPosition,
            eased,
          );
          controls.target.lerpVectors(
            cameraTransition.fromTarget,
            cameraTransition.toTarget,
            eased,
          );
          if (progress >= 1) {
            cameraTransitionRef.current = null;
            controls.enabled = true;
          }
        }
        updateFocusedPatient(t, dt);
        controls.update();
        renderer.render(scene, camera);
        if (!firstFrameReported) {
          firstFrameReported = true;
          // Reveal the interface only after the first complete 3D frame has
          // been handed to the browser for painting.
          readyRaf = window.requestAnimationFrame(onReady);
        }
      } catch (error) {
        const now = performance.now();
        if (now - lastRenderErrorAt > 2000) {
          console.error("Medify animation recovered from a frame error", error);
          lastRenderErrorAt = now;
        }
      }
    };
    render();
    const resize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.fov = mobileView() ? 42 : 35;
      controls.maxDistance = mobileView() ? 74.4 : 48;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(readyRaf);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("click", click);
      renderer.domElement.removeEventListener("pointermove", move);
      if (touchDevice) {
        renderer.domElement.removeEventListener(
          "touchstart",
          beginTwoFingerRotate,
        );
        renderer.domElement.removeEventListener(
          "touchmove",
          rotateWithTwoFingers,
        );
        renderer.domElement.removeEventListener("touchend", endTwoFingerRotate);
        renderer.domElement.removeEventListener(
          "touchcancel",
          endTwoFingerRotate,
        );
      }
      controls.dispose();
      renderer.dispose();
      cameraRef.current = null;
      controlsRef.current = null;
      cameraTransitionRef.current = null;
      clearPatientFocusRef.current = null;
      applyFloorRef.current = null;
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((v) => v.dispose());
        }
      });
      host.replaceChildren();
    };
  }, [onReady, onTalk, onPatientFocus, onKnock, onPatientCount, onElevatorOpen]);
  useEffect(() => {
    if (patientFocusClearRequest > 0) clearPatientFocusRef.current?.();
  }, [patientFocusClearRequest]);
  useEffect(() => {
    const camera = cameraRef.current,
      controls = controlsRef.current,
      host = mount.current;
    if (!camera || !controls || !host) return;
    const mobile = host.clientWidth <= 760,
      floorY = (activeFloor - 1) * 5.35,
      previousFloor = previousActiveFloorRef.current,
      floorChanged = previousFloor !== activeFloor;
    const panoramaTarget = new THREE.Vector3(
      0,
      activeFloor > 1 ? floorY + 1.35 : 1,
      activeFloor > 1 ? -0.25 : -0.6,
    );
    const panoramaPosition = panoramaTarget
      .clone()
      .add(
        new THREE.Vector3(0.46, 0.72, 0.52)
          .normalize()
          .multiplyScalar(controls.maxDistance),
      );
    const presets: Record<
      CameraView,
      { position: THREE.Vector3; target: THREE.Vector3 }
    > = {
      panorama: {
        position: panoramaPosition,
        target: panoramaTarget,
      },
      clinics: {
        position: new THREE.Vector3(
          11.5,
          mobile ? 26 : 22,
          mobile ? 22 : 16,
        ),
        target: new THREE.Vector3(11.5, 1.2, -2.4),
      },
      reception: {
        position: new THREE.Vector3(
          0,
          mobile ? 12 : 10,
          mobile ? 22 : 16.5,
        ),
        target: new THREE.Vector3(0, 1.35, -4.1),
      },
      pharmacy: {
        position: new THREE.Vector3(
          mobile ? 16 : 12,
          mobile ? 12 : 9.5,
          mobile ? -28 : -23,
        ),
        target: new THREE.Vector3(0, 1.25, -7.5),
      },
      operating: {
        position: new THREE.Vector3(
          mobile ? -1.5 : -4.2,
          floorY + (mobile ? 16.5 : 11.8),
          mobile ? 11.5 : 4.6,
        ),
        target: new THREE.Vector3(-11.65, floorY + 1.2, -5.8),
      },
      exam: {
        position: new THREE.Vector3(
          mobile ? 10.5 : 8.5,
          floorY + (mobile ? 21 : 17.5),
          mobile ? 22 : 17,
        ),
        target: new THREE.Vector3(15.2, floorY + 1.25, 0.8),
      },
      waiting: {
        position: new THREE.Vector3(
          0,
          floorY + (mobile ? 12.5 : 9.5),
          mobile ? 20 : 14,
        ),
        target: new THREE.Vector3(0, floorY + 1.25, 1.45),
      },
      ward1: {
        position: new THREE.Vector3(
          mobile ? -1.5 : -4.2,
          floorY + (mobile ? 16.5 : 11.8),
          mobile ? 11.5 : 4.6,
        ),
        target: new THREE.Vector3(-11.65, floorY + 1.2, -5.8),
      },
      ward2: {
        position: new THREE.Vector3(
          mobile ? 2.5 : 4.8,
          floorY + (mobile ? 16.5 : 11.8),
          mobile ? 11.5 : 4.6,
        ),
        target: new THREE.Vector3(11.65, floorY + 1.2, -5.8),
      },
      ward3: {
        position: new THREE.Vector3(
          mobile ? 10.5 : 8.5,
          floorY + (mobile ? 21 : 17.5),
          mobile ? 22 : 17,
        ),
        target: new THREE.Vector3(15.2, floorY + 1.25, 0.8),
      },
      nurseStation: {
        position: new THREE.Vector3(
          0,
          floorY + (mobile ? 14.5 : 10.4),
          mobile ? 8.5 : 3.8,
        ),
        target: new THREE.Vector3(0, floorY + 1.05, -6.15),
      },
      courtyard: {
        position: new THREE.Vector3(
          0,
          floorY + (mobile ? 14.5 : 10.8),
          mobile ? 17.5 : 13.2,
        ),
        target: new THREE.Vector3(0, floorY + 0.75, 3.35),
      },
      elevator: {
        position: new THREE.Vector3(
          mobile ? -4.5 : -5.2,
          floorY + (mobile ? 10.5 : 8.4),
          mobile ? 16.5 : 12.5,
        ),
        target: new THREE.Vector3(-12.92, floorY + 1.55, 3.91),
      },
    };
    const floorDelta = (activeFloor - previousFloor) * 5.35;
    const preset = floorChanged
      ? {
          position: camera.position
            .clone()
            .add(new THREE.Vector3(0, floorDelta, 0)),
          target: controls.target
            .clone()
            .add(new THREE.Vector3(0, floorDelta, 0)),
        }
      : presets[cameraView];
    const previousCameraView = previousCameraViewRef.current;
    const pharmacyTransition =
        cameraView === "pharmacy" || previousCameraView === "pharmacy",
      elevatorTransition = cameraView === "elevator";
    controls.enabled = false;
    controls.autoRotate = false;
    cameraTransitionRef.current = {
      fromPosition: camera.position.clone(),
      toPosition: preset.position,
      fromTarget: controls.target.clone(),
      toTarget: preset.target,
      startedAt: performance.now(),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 1
        : floorChanged
          ? 1
        : pharmacyTransition
          ? 1600
          : elevatorTransition
            ? 720
            : 980,
    };
    previousCameraViewRef.current = cameraView;
    previousActiveFloorRef.current = activeFloor;
  }, [activeFloor, cameraView, cameraViewRequest]);
  return (
    <div
      ref={mount}
      className="three-stage"
      aria-label="大型 Medify 等角視角 3D 醫院"
    />
  );
}
