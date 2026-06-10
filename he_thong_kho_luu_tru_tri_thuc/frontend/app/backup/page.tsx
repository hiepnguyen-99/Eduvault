"use client";
import { CheckCircle2, Cloud, DatabaseBackup, HardDrive, RotateCcw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Backup as BackupType, DashboardData, formatDate } from "@/lib/api";
import { useBackendData } from "@/lib/hooks";
import { Metric, PageHeader, Panel } from "@/components/ui";

type Compliance={compliant:boolean;copies:number;media:number;offsite:number;required:{copies:number;media:number;offsite:number};storages:{id:string;name:string;provider:string;last_status:string}[]};
const emptyDash:DashboardData={user:{code:"",name:"",role:"lecturer",department:""},stats:{documents:0,private:0,topics:0},documents:[],requests:[],backups:[],audit:[]};
const emptyCompliance:Compliance={compliant:false,copies:0,media:0,offsite:0,required:{copies:3,media:2,offsite:1},storages:[]};
export default function Backup() {
  const {user,request}=useAuth(); const {data:dash,reload}=useBackendData("/api/dashboard",emptyDash); const {data:c}=useBackendData("/api/backups/compliance",emptyCompliance);
  async function create(){await request("/api/admin/backups",{method:"POST"});await reload();}
  async function restore(x:BackupType){if(confirm(`Khôi phục ${x.id}?`))await request(`/api/admin/backups/${x.id}/restore`,{method:"POST"});}
  return <div><PageHeader eyebrow="Sao lưu và phục hồi" title="Trung tâm sao lưu" description="Theo dõi các bản sao lưu theo nguyên tắc 3-2-1." actions={user?.role==="admin"?<button className="btn-primary" onClick={create}><DatabaseBackup size={15}/>Sao lưu ngay</button>:undefined}/>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Bản sao khả dụng" value={String(c.copies)} detail={`Yêu cầu ${c.required.copies}`} icon={<DatabaseBackup size={18}/>}/><Metric label="Loại phương tiện" value={String(c.media)} detail={`Yêu cầu ${c.required.media}`} icon={<HardDrive size={18}/>}/><Metric label="Bản sao ngoài hệ thống" value={String(c.offsite)} detail={`Yêu cầu ${c.required.offsite}`} icon={<Cloud size={18}/>}/><Metric label="Tuân thủ" value={c.compliant?"Đạt":"Chưa đạt"} detail="Chiến lược 3-2-1" icon={<ShieldCheck size={18}/>}/></div>
    <Panel title="Kho lưu trữ đang hoạt động" className="mt-5"><div className="grid gap-3 p-5 sm:grid-cols-3">{c.storages.map(x=><div key={x.id} className="rounded-xl border border-[var(--border)] p-4"><Cloud size={20}/><strong className="mt-3 block text-sm">{x.name}</strong><span className="muted text-xs">{x.provider}</span><span className="badge badge-green mt-3"><CheckCircle2 size={11}/>{x.last_status}</span></div>)}</div></Panel>
    <Panel title="Lịch sử sao lưu" className="mt-5"><div className="table-shell"><table className="data-table"><thead><tr><th>Mã backup</th><th>Trạng thái</th><th>Người tạo</th><th>Thời gian</th><th></th></tr></thead><tbody>{dash.backups.map(x=><tr key={x.id}><td><strong>{x.id}</strong></td><td><span className="badge badge-green">{x.status}</span></td><td>{x.created_by}</td><td>{formatDate(x.created_at)}</td><td>{user?.role==="admin"&&<button className="btn-secondary" onClick={()=>restore(x)}><RotateCcw size={13}/>Khôi phục</button>}</td></tr>)}</tbody></table></div></Panel>
  </div>
}
