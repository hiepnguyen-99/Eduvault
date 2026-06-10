"use client";
import { Check, Clock3, RotateCcw } from "lucide-react";
import { useState } from "react";
import { DashboardData, Document, formatDate } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { useBackendData } from "@/lib/hooks";
import { PageHeader, Panel } from "@/components/ui";
type Version={id:string;version_no:number;created_by:string;created_at:string};
const empty:DashboardData={user:{code:"",name:"",role:"lecturer",department:""},stats:{documents:0,private:0,topics:0},documents:[],requests:[],backups:[],audit:[]};
export default function Versions() {
  const {request}=useAuth();const {data:d}=useBackendData("/api/dashboard",empty);const [selected,setSelected]=useState<Document|null>(null);const doc=selected||d.documents[0];const {data:versions,reload}=useBackendData<Version[]>(doc?`/api/documents/${doc.id}/versions`:"/api/documents/doc-de-cuong-ai/versions",[]);
  async function rollback(v:number){if(doc&&confirm(`Khôi phục ${doc.title} về v${v}?`)){await request(`/api/documents/${doc.id}/rollback/${v}`,{method:"POST"});await reload();}}
  return <div><PageHeader eyebrow="Quản lý phiên bản" title="Lịch sử phiên bản" description="Chọn tài liệu để xem và khôi phục các phiên bản trước."/>
    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><Panel title="Tài liệu"><div className="p-2">{d.documents.map(x=><button key={x.id} onClick={()=>setSelected(x)} className={`block w-full rounded-lg p-3 text-left text-xs ${doc?.id===x.id?"bg-[var(--soft)] text-blue-600":""}`}><strong>{x.title}</strong><span className="muted block">v{x.current_version} · {x.owner_code}</span></button>)}</div></Panel><Panel title={doc?.title||"Chưa có tài liệu"} description={`${versions.length} phiên bản`}><div className="p-5">{versions.map((v,i)=><div className="relative flex gap-4 pb-7 last:pb-0" key={v.id}>{i<versions.length-1&&<i className="absolute left-[15px] top-8 h-[calc(100%-20px)] w-px bg-[var(--border)]"/>}<div className={`relative z-10 h-8 w-8 rounded-full grid place-items-center ${i===0?"bg-blue-600 text-white":"bg-[var(--bg)] border border-[var(--border)]"}`}>{i===0?<Check size={14}/>:<Clock3 size={14}/>}</div><div className="flex-1"><div className="flex justify-between"><strong className="text-sm">Phiên bản v{v.version_no}</strong><span className="muted text-[10px]">{formatDate(v.created_at)}</span></div><span className="muted text-[10px]">Tạo bởi {v.created_by}</span>{i>0&&<button className="btn-secondary mt-2 block" onClick={()=>rollback(v.version_no)}><RotateCcw size={13}/>Khôi phục</button>}</div></div>)}</div></Panel></div>
  </div>
}
