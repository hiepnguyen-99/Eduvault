"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { File, FilePenLine, FilePlus2, Folder, LayoutGrid, List, LoaderCircle, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { DashboardData, Document, DocumentDetail, formatDate } from "@/lib/api";
import { useBackendData } from "@/lib/hooks";
import { PageHeader, Panel } from "@/components/ui";

type DocumentForm = {
  title: string;
  topic: string;
  doc_type: string;
  visibility: "public" | "private";
  folder_path: string;
  content: string;
};

const empty: DashboardData = { user:{code:"",name:"",role:"lecturer",department:""},stats:{documents:0,private:0,topics:0},documents:[],requests:[],backups:[],audit:[] };
const emptyForm: DocumentForm = { title:"", topic:"", doc_type:"Học liệu", visibility:"public", folder_path:"", content:"" };
const visibilityLabel = (value: string) => value === "public" ? "Công khai" : "Riêng tư";

export default function Repository() {
  const { request, user } = useAuth();
  const { data, loading, error, reload } = useBackendData("/api/dashboard", empty);
  const [selected,setSelected]=useState<Document|null>(null);
  const [query,setQuery]=useState("");
  const [uploadOpen,setUploadOpen]=useState(false);
  const [editorOpen,setEditorOpen]=useState(false);
  const [editing,setEditing]=useState<Document|null>(null);
  const [file,setFile]=useState<File|null>(null);
  const [metadata,setMetadata]=useState({title:"",topic:"",doc_type:"Học liệu",visibility:"public",folder_path:""});
  const [form,setForm]=useState<DocumentForm>(emptyForm);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const docs=useMemo(()=>data.documents.filter(x=>`${x.title} ${x.topic} ${x.doc_type}`.toLowerCase().includes(query.toLowerCase())),[data.documents,query]);
  const current=selected||docs[0]||null;
  const folders=[...new Set(data.documents.map(x=>x.folder_path||"Chưa phân loại"))];
  const canManage=(document:Document)=>user?.role==="admin"||document.owner_code===user?.code;

  function openCreate(){
    setEditing(null);setForm(emptyForm);setMessage("");setEditorOpen(true);
  }

  async function openEdit(document:Document){
    setBusy(true);setMessage("");
    try{
      const detail=await request<DocumentDetail>(`/api/documents/${document.id}`);
      setEditing(document);
      setForm({title:detail.title,topic:detail.topic,doc_type:detail.doc_type,visibility:detail.visibility,folder_path:detail.folder_path||"",content:detail.content});
      setEditorOpen(true);
    }catch(err){setMessage(err instanceof Error?err.message:"Không thể mở tài liệu để sửa.");}
    finally{setBusy(false);}
  }

  async function saveDocument(){
    setBusy(true);setMessage("");
    try{
      await request(editing?`/api/documents/${editing.id}`:"/api/documents",{method:editing?"PUT":"POST",body:JSON.stringify(form)});
      setEditorOpen(false);setEditing(null);await reload();
    }catch(err){setMessage(err instanceof Error?err.message:"Không thể lưu tài liệu.");}
    finally{setBusy(false);}
  }

  async function removeDocument(document:Document){
    if(!confirm(`Đưa "${document.title}" vào thùng rác?`))return;
    setBusy(true);setMessage("");
    try{
      await request(`/api/documents/${document.id}`,{method:"DELETE"});
      if(selected?.id===document.id)setSelected(null);
      await reload();
    }catch(err){setMessage(err instanceof Error?err.message:"Không thể xóa tài liệu.");}
    finally{setBusy(false);}
  }

  async function analyze(){
    if(!file)return;
    setBusy(true);setMessage("");
    try{
      const result=await request<{metadata:{title:string;topic:string;doc_type:string};folder_path:string;duplicate?:{title:string}}>("/api/documents/analyze-file",{method:"POST",headers:{"X-Filename":encodeURIComponent(file.name),"Content-Type":file.type||"application/octet-stream"},body:file});
      setMetadata(x=>({...x,...result.metadata,folder_path:result.folder_path}));
      if(result.duplicate)setMessage(`Cảnh báo trùng nội dung với: ${result.duplicate.title}`);
    }catch(err){setMessage(err instanceof Error?err.message:"Phân tích thất bại.");}
    finally{setBusy(false);}
  }

  async function uploadFile(){
    if(!file)return;
    setBusy(true);setMessage("");
    try{
      await request("/api/documents/upload",{method:"POST",headers:{"X-Filename":encodeURIComponent(file.name),"X-Title":encodeURIComponent(metadata.title),"X-Topic":encodeURIComponent(metadata.topic),"X-Doc-Type":encodeURIComponent(metadata.doc_type),"X-Visibility":metadata.visibility,"X-Folder-Path":encodeURIComponent(metadata.folder_path),"Content-Type":file.type||"application/octet-stream"},body:file});
      setUploadOpen(false);setFile(null);await reload();
    }catch(err){setMessage(err instanceof Error?err.message:"Tải lên thất bại.");}
    finally{setBusy(false);}
  }

  return <div><PageHeader eyebrow="Kho tri thức" title="Kho tài liệu" description={`${data.stats.documents} tài liệu đang được lưu trong hệ thống.`} actions={<><button className="btn-secondary" onClick={openCreate}><FilePlus2 size={15}/>Tạo tài liệu</button><button className="btn-primary" onClick={()=>{setMessage("");setUploadOpen(true)}}><Upload size={15}/>Tải tệp lên</button></>}/>
    {(error||message)&&<p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-800">{error||message}</p>}
    <div className="grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)_280px]">
      <Panel title="Cây thư mục"><div className="p-2 text-[12px]">{folders.slice(0,20).map(x=><div key={x} className="flex items-center gap-2 rounded-md px-2 py-2"><Folder size={15}/><span className="truncate">{x}</span></div>)}{!folders.length&&<p className="muted p-2">Chưa có thư mục.</p>}</div></Panel>
      <Panel title="Tất cả tài liệu" description={loading?"Đang tải...":`${docs.length} tài liệu`}><div className="flex flex-wrap gap-2 border-b border-[var(--border)] p-3"><div className="relative min-w-48 flex-1"><Search className="muted absolute left-3 top-2.5" size={15}/><input className="field pl-9" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm trong kho..."/></div><button className="icon-btn" aria-label="Dạng danh sách"><List size={15}/></button><button className="icon-btn" aria-label="Dạng lưới"><LayoutGrid size={15}/></button></div>
        <div className="table-shell"><table className="data-table"><thead><tr><th>Tên</th><th>Loại</th><th>Chủ sở hữu</th><th>Cập nhật</th><th>Quyền</th><th>Thao tác</th></tr></thead><tbody>{docs.map(d=><tr key={d.id} onClick={()=>setSelected(d)} className={current?.id===d.id?"bg-[var(--soft)]":""}><td><div className="flex items-center gap-2"><div className="h-8 w-8 rounded bg-red-50 text-red-600 grid place-items-center"><File size={15}/></div><div><Link href={`/documents/${d.id}`} className="font-bold hover:text-blue-600">{d.title}</Link><span className="muted block text-[10px]">{d.topic}</span></div></div></td><td>{d.doc_type}</td><td>{d.owner_code}</td><td>{formatDate(d.updated_at)}</td><td><span className={`badge ${d.visibility==="public"?"badge-green":"badge-amber"}`}>{visibilityLabel(d.visibility)}</span></td><td>{canManage(d)&&<div className="flex gap-1"><button className="icon-btn" aria-label="Sửa tài liệu" disabled={busy} onClick={e=>{e.stopPropagation();openEdit(d)}}><FilePenLine size={15}/></button><button className="icon-btn text-red-600" aria-label="Xóa tài liệu" disabled={busy} onClick={e=>{e.stopPropagation();removeDocument(d)}}><Trash2 size={15}/></button></div>}</td></tr>)}</tbody></table></div>
      </Panel>
      <Panel title="Thông tin tài liệu"><div className="p-4">{current?<><div className="rounded-xl bg-gradient-to-br from-blue-700 to-indigo-800 p-4 text-white"><Sparkles size={18}/><strong className="mt-3 block text-sm">{current.title}</strong><p className="mt-1 text-[11px] text-blue-100">{current.topic}</p></div><div className="mt-4 space-y-3">{[["Thư mục",current.folder_path||"Chưa phân loại"],["Loại",current.doc_type],["Chủ sở hữu",current.owner_code],["Phiên bản",`v${current.current_version}`]].map(x=><div key={x[0]}><span className="muted block text-[10px] uppercase font-bold">{x[0]}</span><span className="text-xs">{x[1]}</span></div>)}</div><Link href={`/documents/${current.id}`} className="btn-primary mt-5 w-full">Mở tài liệu</Link>{canManage(current)&&<div className="mt-2 grid grid-cols-2 gap-2"><button className="btn-secondary" onClick={()=>openEdit(current)}><FilePenLine size={14}/>Sửa</button><button className="btn-secondary text-red-600" onClick={()=>removeDocument(current)}><Trash2 size={14}/>Xóa</button></div>}</>:<p className="muted text-xs">Chưa có tài liệu.</p>}</div></Panel>
    </div>
    {editorOpen&&<Modal onClose={()=>setEditorOpen(false)}><p className="eyebrow">{editing?"Chỉnh sửa tài liệu":"Tạo tài liệu thủ công"}</p><h2 className="page-title mt-1">{editing?"Cập nhật tài liệu":"Thêm tài liệu mới"}</h2><DocumentFields form={form} setForm={setForm}/>{message&&<p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">{message}</p>}<div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={()=>setEditorOpen(false)}>Hủy</button><button disabled={busy||!form.title||!form.topic||!form.content} className="btn-primary" onClick={saveDocument}>{busy&&<LoaderCircle className="animate-spin" size={15}/>}Lưu tài liệu</button></div></Modal>}
    {uploadOpen&&<Modal onClose={()=>setUploadOpen(false)}><p className="eyebrow">Nhập tài liệu có hỗ trợ AI</p><h2 className="page-title mt-1">Tải tài liệu mới</h2><label className="mini-grid mt-5 block rounded-xl border-2 border-dashed border-blue-300 p-8 text-center"><Upload className="mx-auto text-blue-600"/><strong className="mt-3 block text-sm">{file?.name||"Chọn tệp để phân tích"}</strong><input type="file" className="hidden" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><input className="field" placeholder="Tên tài liệu" value={metadata.title} onChange={e=>setMetadata(x=>({...x,title:e.target.value}))}/><input className="field" placeholder="Chủ đề" value={metadata.topic} onChange={e=>setMetadata(x=>({...x,topic:e.target.value}))}/><input className="field" placeholder="Loại tài liệu" value={metadata.doc_type} onChange={e=>setMetadata(x=>({...x,doc_type:e.target.value}))}/><select className="field" value={metadata.visibility} onChange={e=>setMetadata(x=>({...x,visibility:e.target.value}))}><option value="public">Công khai</option><option value="private">Riêng tư</option></select><input className="field sm:col-span-2" placeholder="Thư mục lưu" value={metadata.folder_path} onChange={e=>setMetadata(x=>({...x,folder_path:e.target.value}))}/></div>{message&&<p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">{message}</p>}<div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={()=>setUploadOpen(false)}>Hủy</button><button disabled={!file||busy} className="btn-secondary" onClick={analyze}>{busy?<LoaderCircle className="animate-spin" size={15}/>:<Sparkles size={15}/>}AI phân tích</button><button disabled={!file||!metadata.title||!metadata.topic||busy} className="btn-primary" onClick={uploadFile}>Lưu tài liệu</button></div></Modal>}
  </div>;
}

function Modal({children,onClose}:{children:React.ReactNode;onClose:()=>void}){
  return <div className="fixed inset-0 z-50 bg-slate-950/60 grid place-items-center p-4" onClick={onClose}><div className="app-card w-full max-w-xl p-5" onClick={e=>e.stopPropagation()}>{children}</div></div>;
}

function DocumentFields({form,setForm}:{form:DocumentForm;setForm:React.Dispatch<React.SetStateAction<DocumentForm>>}){
  return <div className="mt-5 grid gap-3 sm:grid-cols-2"><input className="field" placeholder="Tên tài liệu" value={form.title} onChange={e=>setForm(x=>({...x,title:e.target.value}))}/><input className="field" placeholder="Chủ đề" value={form.topic} onChange={e=>setForm(x=>({...x,topic:e.target.value}))}/><input className="field" placeholder="Loại tài liệu" value={form.doc_type} onChange={e=>setForm(x=>({...x,doc_type:e.target.value}))}/><select className="field" value={form.visibility} onChange={e=>setForm(x=>({...x,visibility:e.target.value as DocumentForm["visibility"]}))}><option value="public">Công khai</option><option value="private">Riêng tư</option></select><input className="field sm:col-span-2" placeholder="Thư mục lưu (không bắt buộc)" value={form.folder_path} onChange={e=>setForm(x=>({...x,folder_path:e.target.value}))}/><textarea className="field min-h-48 sm:col-span-2" placeholder="Nội dung tài liệu" value={form.content} onChange={e=>setForm(x=>({...x,content:e.target.value}))}/></div>;
}
