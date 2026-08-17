"use client";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import AmbientSound from "./AmbientSound";
import type { CameraView, CharacterInteraction } from "./HospitalScene";
const HospitalScene=dynamic(()=>import("./HospitalScene"),{ssr:false});
type Role="doctor"|"nurse"|"patient"|"assistant";
const cameraViews:{key:CameraView;label:string;description:string}[]=[
  {key:"panorama",label:"全景",description:"瀏覽整個醫院"},
  {key:"clinics",label:"診間",description:"同時瀏覽 3、4、5 號診間"},
  {key:"reception",label:"櫃檯",description:"前往服務櫃檯視角"},
  {key:"pharmacy",label:"藥局",description:"前往藥局視角"},
];
const talk:{[K in Role]:{title:string;line:string}}={doctor:{title:"診間醫師",line:"Medify 的智慧醫療服務將重複性的問診過程簡化，且讓病患取得妥善審核過的衛教資訊。"},nurse:{title:"護理師",line:"報到後請先在候診區稍作等候，掃描候診區桌上的 QRcode 閱讀相關衛教資訊，輪到您診間叫號機會通知您前往。"},patient:{title:"候診病患",line:"目前正在依照院內流程移動。"},assistant:{title:"眼球小助手",line:"嗨！我是眼球小助手。需要我陪你確認報到、候診或看診流程嗎？"}};
type DialogContent=CharacterInteraction&{role:Role};
export default function Home(){const[dialog,setDialog]=useState<DialogContent|null>(null);const[toast,setToast]=useState("");const[patientCount,setPatientCount]=useState(12);const[cameraView,setCameraView]=useState<CameraView>("panorama");const[cameraViewRequest,setCameraViewRequest]=useState(0);const[patientFocusClearRequest,setPatientFocusClearRequest]=useState(0);const onTalk=useCallback((r:Role,interaction?:CharacterInteraction)=>setDialog({...(interaction??talk[r]),role:r}),[]);const onPatientFocus=useCallback((interaction:CharacterInteraction|null)=>setDialog(interaction?{...interaction,role:"patient"}:null),[]);const onKnock=useCallback((room:number)=>{setToast(`已敲響 ${room} 號診間`);window.setTimeout(()=>setToast(""),2200)},[]);const onPatientCount=useCallback((count:number)=>setPatientCount(count),[]);const closeDialog=useCallback(()=>{if(dialog?.role==="patient")setPatientFocusClearRequest((request)=>request+1);setDialog(null)},[dialog]);
return <main className="experience dollhouse">
  <HospitalScene onTalk={onTalk} onPatientFocus={onPatientFocus} patientFocusClearRequest={patientFocusClearRequest} onKnock={onKnock} onPatientCount={onPatientCount} cameraView={cameraView} cameraViewRequest={cameraViewRequest}/>
  <header className="topbar"><a className="brand" href="#"><img src="/logo-h.png" alt="Medify"/><span>3D HOSPITAL<br/><small>INTERACTIVE CLINIC</small></span></a></header>
  <AmbientSound/>
  <aside className="scene-intro"><p><i/>MEDIFY PATIENT EXPERIENCE</p><h1>Medify醫院<br/><em>互動候診大廳</em></h1><span>對話報到 · 手機掃描 QR Code · 診間互動</span></aside>
  <div className="legend"><b>場景角色</b><span><i className="doctor-dot"/>醫師 × 5</span><span><i className="nurse-dot"/>護理師 × 9</span><span><i className="pharmacist-dot"/>藥師 × 2</span><span><i className="assistant-dot"/>眼球小助手 × 1</span><span><i className="patient-dot"/>大廳病患 × {patientCount}</span></div>
  <nav className="camera-switcher" aria-label="醫院視角切換">
    {cameraViews.map((view)=><button key={view.key} type="button" className={cameraView===view.key?"active":""} aria-pressed={cameraView===view.key} aria-label={view.description} title={view.description} onClick={()=>{setCameraView(view.key);setCameraViewRequest((request)=>request+1)}}><b>{view.label}</b></button>)}
  </nav>
  {toast&&<div className="toast">✓ {toast}</div>}
  {dialog&&<div className="dialog" role="dialog" aria-label={dialog.title}><button onClick={closeDialog} aria-label="關閉對話">×</button><small>{dialog.eyebrow??"MEDIFY CONVERSATION"}</small><h2>{dialog.title}</h2><p>{dialog.line}</p>{dialog.detail&&<p className="dialog-detail">{dialog.detail}</p>}<span>{dialog.role==="patient"?"點擊其他病患可切換追蹤標記":"點擊 × 返回探索"}</span></div>}
  <footer><span>COLLISION-SAFE CHARACTER NAVIGATION</span><b>用心溝通，讓醫療更容易理解。</b></footer>
</main>}
