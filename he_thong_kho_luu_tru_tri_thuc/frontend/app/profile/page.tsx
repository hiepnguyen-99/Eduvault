"use client";

import { Save, UserCog } from "lucide-react";
import { useMemo, useState } from "react";
import { PermissionGuard } from "@/components/permission-guard";
import { useAuth } from "@/components/auth-provider";
import { PageHeader, Panel } from "@/components/ui";
import { ProfileSpecializations } from "@/lib/api";
import { useBackendData } from "@/lib/hooks";
import { ROLE_LABELS, toAppRole } from "@/src/config/role-menu";

const emptyProfile:ProfileSpecializations={policy:null,available:[],selected_ids:[]};

function ProfileContent(){
  const {user,request}=useAuth();
  const {data:profile,reload}=useBackendData<ProfileSpecializations>("/api/profile/specializations",emptyProfile);
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [message,setMessage]=useState("");
  const selected=useMemo(()=>new Set(selectedIds.length?selectedIds:profile.selected_ids),[selectedIds,profile.selected_ids]);
  const roleLabel=user?ROLE_LABELS[toAppRole(user.role)]:"";

  function toggle(id:string){
    setSelectedIds(current=>{
      const next=new Set(current.length?current:profile.selected_ids);
      if(next.has(id))next.delete(id);else next.add(id);
      return [...next];
    });
  }

  async function save(){
    setMessage("");
    try{
      const result=await request<ProfileSpecializations&{message?:string}>("/api/profile/specializations",{method:"PUT",body:JSON.stringify({specialization_ids:[...selected]})});
      setSelectedIds(result.selected_ids);
      await reload();
      setMessage(result.message||"Cây thư mục của bạn đã được cập nhật theo policy hiện hành.");
    }catch(error){setMessage(error instanceof Error?error.message:"Không lưu được nhóm chuyên môn.");}
  }

  return <div>
    <PageHeader eyebrow="Hồ sơ" title="Hồ sơ cá nhân" description="Cập nhật nhóm chuyên môn để EduVault sinh Virtual Folder View phù hợp." actions={<button className="btn-primary" onClick={save}><Save size={15}/>Lưu hồ sơ</button>}/>
    {message&&<p className="mb-4 rounded bg-emerald-50 p-3 text-xs text-emerald-800">{message}</p>}
    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <Panel title="Thông tin phiên đăng nhập">
        <div className="space-y-3 p-5 text-sm">
          <div className="flex items-center gap-3"><UserCog className="text-blue-600"/><strong>{user?.name}</strong></div>
          {[["Mã tài khoản",user?.code],["Vai trò",roleLabel],["Đơn vị",user?.department]].map(item=><div key={item[0]} className="flex justify-between border-b border-[var(--border)] pb-2 text-xs"><span className="muted">{item[0]}</span><strong>{item[1]}</strong></div>)}
        </div>
      </Panel>
      <Panel title="Nhóm chuyên môn">
        <div className="space-y-3 p-5">
          {!profile.policy&&<p className="rounded bg-amber-50 p-3 text-xs text-amber-800">Hệ thống chưa có policy active. Vui lòng liên hệ Admin.</p>}
          {profile.available.map(spec=><label key={spec.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3 text-sm">
            <input type="checkbox" checked={selected.has(spec.id)} onChange={()=>toggle(spec.id)}/>
            <span><strong className="block">{spec.name}</strong><span className="muted text-[10px]">Virtual view sẽ lấy subtree tương ứng từ Master Folder Tree.</span></span>
          </label>)}
          {!profile.available.length&&profile.policy&&<p className="muted text-xs">Policy active chưa có nhóm chuyên môn.</p>}
        </div>
      </Panel>
    </div>
  </div>;
}

export default function ProfilePage() {
  return <PermissionGuard permission="profile.manage"><ProfileContent /></PermissionGuard>;
}
