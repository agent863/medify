"use client";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type { CameraView } from "./HospitalScene";
const HospitalScene=dynamic(()=>import("./HospitalScene"),{ssr:false});
type Role="doctor"|"nurse"|"patient"|"assistant";
const cameraViews:{key:CameraView;label:string;description:string}[]=[
  {key:"panorama",label:"全景",description:"瀏覽整個醫院"},
  {key:"clinics",label:"診間",description:"同時瀏覽 3、4、5 號診間"},
  {key:"reception",label:"櫃檯",description:"前往服務櫃檯視角"},
  {key:"pharmacy",label:"藥局",description:"前往藥局視角"},
];
const talk:{[K in Role]:{title:string;line:string}}={doctor:{title:"林醫師",line:"您好，我正準備前往 3 號診間。需要我為您說明看診流程嗎？"},nurse:{title:"陳護理師",line:"報到後請先在候診區稍坐，輪到您時會顯示診間號碼。"},patient:{title:"候診病患",line:"這裡的動線很清楚，我正在等待 2 號診間叫號。"},assistant:{title:"眼球小助手",line:"嗨！我是眼球小助手。需要我陪你確認報到、候診或看診流程嗎？"}};
export default function Home(){const[dialog,setDialog]=useState<{title:string;line:string}|null>(null);const[toast,setToast]=useState("");const[patientCount,setPatientCount]=useState(12);const[cameraView,setCameraView]=useState<CameraView>("panorama");const[cameraViewRequest,setCameraViewRequest]=useState(0);const onTalk=useCallback((r:Role)=>setDialog(talk[r]),[]);const onKnock=useCallback((room:number)=>{setToast(`已敲響 ${room} 號診間`);window.setTimeout(()=>setToast(""),2200)},[]);const onPatientCount=useCallback((count:number)=>setPatientCount(count),[]);
return <main className="experience dollhouse">
  <HospitalScene onTalk={onTalk} onKnock={onKnock} onPatientCount={onPatientCount} cameraView={cameraView} cameraViewRequest={cameraViewRequest}/>
  <header className="topbar"><a className="brand" href="#"><img src="/logo-h.png" alt="Medify"/><span>3D HOSPITAL<br/><small>INTERACTIVE CLINIC</small></span></a></header>
  <aside className="scene-intro"><p><i/>MEDIFY PATIENT EXPERIENCE</p><h1>Medify醫院<br/><em>互動候診大廳</em></h1><span>對話報到 · 手機掃描 QR Code · 診間互動</span></aside>
  <div className="legend"><b>場景角色</b><span><i className="doctor-dot"/>醫師 × 5</span><span><i className="nurse-dot"/>護理師 × 4</span><span><i className="assistant-dot"/>眼球小助手 × 1</span><span><i className="patient-dot"/>大廳病患 × {patientCount}</span></div>
  <nav className="camera-switcher" aria-label="醫院視角切換">
    {cameraViews.map((view)=><button key={view.key} type="button" className={cameraView===view.key?"active":""} aria-pressed={cameraView===view.key} aria-label={view.description} title={view.description} onClick={()=>{setCameraView(view.key);setCameraViewRequest((request)=>request+1)}}><b>{view.label}</b></button>)}
  </nav>
  {toast&&<div className="toast">✓ {toast}</div>}
  {dialog&&<div className="dialog" role="dialog" aria-label={dialog.title}><button onClick={()=>setDialog(null)} aria-label="關閉對話">×</button><small>MEDIFY CONVERSATION</small><h2>{dialog.title}</h2><p>{dialog.line}</p><span>點擊 × 返回探索</span></div>}
  <footer><span>COLLISION-SAFE CHARACTER NAVIGATION</span><b>用心溝通，讓醫療更容易理解。</b></footer>
</main>}
