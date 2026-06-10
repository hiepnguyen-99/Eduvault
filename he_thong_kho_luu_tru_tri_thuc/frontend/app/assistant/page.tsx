"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, FileText, LoaderCircle, MessageSquare, Plus, Send, Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Document } from "@/lib/api";
import { PageHeader, Panel } from "@/components/ui";

type Answer = { answer: string; citations: Document[]; scope: string };

export default function Assistant() {
  const { request } = useAuth();
  const [question,setQuestion]=useState("");
  const [history,setHistory]=useState<{question:string;result:Answer}[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const latest=history.at(-1);

  async function submit(e:React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true); setError("");
    try {
      const result=await request<Answer>("/api/search",{method:"POST",body:JSON.stringify({question})});
      setHistory(x=>[...x,{question,result}]); setQuestion("");
    } catch(err) { setError(err instanceof Error?err.message:"Không thể hỏi AI."); }
    finally { setLoading(false); }
  }

  return <div><PageHeader eyebrow="Trợ lý tri thức AI" title="Hỏi đáp trên kho tri thức" description="Câu trả lời được giới hạn theo quyền truy cập của bạn." actions={<button className="btn-primary" onClick={()=>setHistory([])}><Plus size={15}/>Cuộc hội thoại mới</button>}/>
    <div className="grid min-h-[680px] gap-4 xl:grid-cols-[230px_minmax(0,1fr)_300px]">
      <Panel title="Lịch sử"><div className="p-2">{history.map((x,i)=><div key={i} className="flex gap-2 rounded-lg p-2.5 text-xs"><MessageSquare size={14}/>{x.question}</div>)}{!history.length&&<p className="muted p-3 text-xs">Chưa có câu hỏi.</p>}</div></Panel>
      <Panel title="Trợ lý tri thức" description="Nguồn trả lời được lọc theo quyền truy cập">
        <div className="flex h-[610px] flex-col p-4"><div className="flex-1 space-y-4 overflow-y-auto"><div className="max-w-[85%] rounded-xl rounded-tl-sm bg-[var(--soft)] p-4 text-sm"><div className="mb-2 flex items-center gap-2 font-bold text-blue-600"><Bot size={16}/>EduVault AI</div>Hãy đặt câu hỏi về tài liệu công khai hoặc tài liệu do bạn sở hữu.</div>{history.map((x,i)=><div key={i} className="space-y-4"><div className="ml-auto max-w-[80%] rounded-xl rounded-tr-sm bg-blue-600 p-4 text-sm text-white">{x.question}</div><div className="max-w-[90%] rounded-xl rounded-tl-sm bg-[var(--soft)] p-4 text-sm whitespace-pre-wrap"><div className="mb-2 flex items-center gap-2 font-bold text-blue-600"><Sparkles size={16}/>Câu trả lời có căn cứ</div>{x.result.answer}</div></div>)}</div>{error&&<p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}<form onSubmit={submit} className="mt-4 flex gap-2"><input className="field" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Đặt câu hỏi về kho tri thức..."/><button disabled={loading} className="btn-primary" aria-label="Gửi">{loading?<LoaderCircle className="animate-spin" size={16}/>:<Send size={16}/>}</button></form></div>
      </Panel>
      <Panel title="Nguồn tham khảo"><div className="p-3 space-y-3">{latest?.result.citations.map(x=><div key={x.id} className="rounded-lg border border-[var(--border)] p-3"><div className="flex gap-2"><FileText className="text-blue-600" size={16}/><div><strong className="block text-xs">{x.title}</strong><span className="muted text-[10px]">{x.topic} · v{x.current_version}</span></div></div><Link href={`/documents/${x.id}`} className="mt-2 block text-[11px] font-bold text-blue-600">Mở tài liệu →</Link></div>)}{!latest&&<p className="muted text-xs">Nguồn sẽ xuất hiện sau khi AI trả lời.</p>}</div></Panel>
    </div>
  </div>
}
