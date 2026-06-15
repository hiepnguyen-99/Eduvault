"use client";

import Link from "next/link";
import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { Bot, Download, ExternalLink, FileText, LoaderCircle, MessageSquare, Plus, Send, Sparkles, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { API_URL } from "@/lib/api";
import { PageHeader, Panel } from "@/components/ui";

type Citation = { id: string; title: string; topic: string; version: number; visibility: string };
type Answer = { answer: string; citations: Citation[]; scope: string };
type HistoryItem = { question: string; result: Answer; timestamp: number };

const STORAGE_KEY = "eduvault_chat_history";

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return <>{parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{part}</Fragment>;
  })}</>;
}

function FriendlyAnswer({ answer }: { answer: string }) {
  const lines = answer.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  function flushBullets() {
    if (!bullets.length) return;
    blocks.push(<ul key={`list-${blocks.length}`} className="space-y-2 pl-1">{bullets.map((item, index) => <li key={index} className="flex gap-2"><span className="mt-0.5 text-blue-600">•</span><span><InlineMarkdown text={item}/></span></li>)}</ul>);
    bullets = [];
  }

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) { flushBullets(); return; }
    if (line.startsWith("- ") || line.startsWith("• ")) { bullets.push(line.slice(2)); return; }
    flushBullets();
    if (line.startsWith("### ")) {
      blocks.push(<h3 key={index} className="pt-3 text-sm font-bold text-[var(--text)]"><InlineMarkdown text={line.slice(4)}/></h3>);
    } else {
      blocks.push(<p key={index} className="leading-6"><InlineMarkdown text={line}/></p>);
    }
  });
  flushBullets();
  return <div className="space-y-3">{blocks}</div>;
}

type DocPreview = {
  id: string;
  title: string;
  content: string;
  files: { id: string; original_name: string; mime_type: string; size: number }[];
};

function DocModal({ doc, token, onClose }: { doc: DocPreview; token: string; onClose: () => void }) {
  async function download(assetId: string, name: string) {
    const r = await fetch(`${API_URL}/api/files/${assetId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/60 p-4 flex items-center justify-center" onClick={onClose}>
      <div className="app-card w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4">
          <div>
            <p className="eyebrow">Xem nội dung tài liệu</p>
            <h2 className="mt-0.5 text-base font-bold">{doc.title}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={`/documents/${doc.id}`} className="btn-secondary text-xs flex items-center gap-1"><ExternalLink size={13}/>Mở trang chi tiết</Link>
            <button className="icon-btn" onClick={onClose}><X size={17}/></button>
          </div>
        </div>

        {doc.files.length > 0 && (
          <div className="border-b border-[var(--border)] bg-[var(--soft)] px-4 py-3 flex flex-wrap gap-2">
            {doc.files.map(f => (
              <button key={f.id} onClick={() => download(f.id, f.original_name)} className="btn-secondary flex items-center gap-1.5 text-xs">
                <Download size={13}/>{f.original_name}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-auto p-5">
          {doc.content
            ? <pre className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--text)]">{doc.content}</pre>
            : <p className="muted text-xs">Tài liệu này chưa có nội dung văn bản được trích xuất.</p>
          }
        </div>
      </div>
    </div>
  );
}

function Sources({ citations, onPreview }: { citations: Citation[]; onPreview: (id: string, title: string) => void }) {
  if (!citations.length) return null;
  return (
    <div className="mt-5 border-t border-[var(--border)] pt-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-bold"><FileText className="text-blue-600" size={15}/>📄 Nguồn tham khảo</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {citations.map(item => (
          <div key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
            <strong className="block text-xs">{item.title}</strong>
            <span className="muted mt-1 block text-[10px]">{item.topic} · phiên bản {item.version}</span>
            <div className="mt-2 flex gap-2">
              <button onClick={() => onPreview(item.id, item.title)} className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline">
                <FileText size={11}/>Xem nội dung
              </button>
              <span className="text-[var(--border)]">·</span>
              <Link href={`/documents/${item.id}`} className="flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-blue-600">
                <ExternalLink size={11}/>Chi tiết
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Assistant() {
  const { request, token } = useAuth();
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<DocPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const historyLoaded = useRef(false);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch { /* ignore */ }
    historyLoaded.current = true;
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (!historyLoaded.current) return;
    try {
      // Keep last 50 conversations to avoid bloating localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-50)));
    } catch { /* ignore */ }
  }, [history]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await request<Answer>("/api/search", { method: "POST", body: JSON.stringify({ question }) });
      setHistory(items => [...items, { question, result, timestamp: Date.now() }]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể hỏi trợ lý.");
    } finally {
      setLoading(false);
    }
  }

  async function openPreview(id: string, title: string) {
    setPreviewLoading(true);
    try {
      const [detail, provenance] = await Promise.all([
        request<{ content: string }>(`/api/documents/${id}`),
        request<{ files: DocPreview["files"] }>(`/api/documents/${id}/provenance`),
      ]);
      setPreview({ id, title, content: detail.content, files: provenance.files || [] });
    } catch {
      setPreview({ id, title, content: "", files: [] });
    } finally {
      setPreviewLoading(false);
    }
  }

  function clearHistory() {
    if (!confirm("Xóa toàn bộ lịch sử hội thoại?")) return;
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Trợ lý tri thức AI"
        title="Hỏi đáp trên kho tri thức"
        description="Hỏi tự nhiên như đang trao đổi với một trợ lý hiểu tài liệu của bạn."
        actions={
          <div className="flex gap-2">
            {history.length > 0 && <button className="btn-secondary" onClick={clearHistory}>Xóa lịch sử</button>}
            <button className="btn-primary" onClick={() => { setHistory([]); localStorage.removeItem(STORAGE_KEY); }}><Plus size={15}/>Cuộc hội thoại mới</button>
          </div>
        }
      />
      <div className="grid min-h-[680px] gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <Panel title={`Lịch sử (${history.length})`}>
          <div className="p-2 max-h-[70vh] overflow-auto">
            {history.map((item, index) => (
              <button
                key={index}
                onClick={() => bottomRef.current?.scrollIntoView()}
                className="flex w-full gap-2 rounded-lg p-2.5 text-left text-xs hover:bg-[var(--soft)]"
              >
                <MessageSquare size={14} className="mt-0.5 shrink-0 text-blue-500"/>
                <div className="min-w-0">
                  <span className="block truncate">{item.question}</span>
                  <span className="muted text-[10px]">{new Date(item.timestamp).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </button>
            ))}
            {!history.length && <p className="muted p-3 text-xs">Chưa có câu hỏi.</p>}
          </div>
        </Panel>

        <Panel title="Trợ lý tri thức" description="Câu trả lời chỉ dùng những tài liệu bạn được phép xem">
          <div className="flex h-[610px] flex-col p-4">
            <div className="flex-1 space-y-5 overflow-y-auto pr-1">
              <div className="max-w-[88%] rounded-xl rounded-tl-sm bg-[var(--soft)] p-4 text-sm">
                <div className="mb-2 flex items-center gap-2 font-bold text-blue-600"><Bot size={16}/>EduVault AI</div>
                Chào bạn, mình có thể giúp <strong>tóm tắt tài liệu</strong>, giải thích nội dung khó hoặc gợi ý cách ôn tập. Bạn muốn tìm hiểu điều gì?
              </div>
              {history.map((item, index) => (
                <div key={index} className="space-y-4">
                  <div className="ml-auto max-w-[80%] rounded-xl rounded-tr-sm bg-blue-600 p-4 text-sm text-white">{item.question}</div>
                  <div className="max-w-[95%] rounded-xl rounded-tl-sm bg-[var(--soft)] p-5 text-sm">
                    <div className="mb-4 flex items-center gap-2 font-bold text-blue-600"><Sparkles size={16}/>Mình đã tìm thấy nội dung phù hợp</div>
                    <FriendlyAnswer answer={item.result.answer}/>
                    <Sources citations={item.result.citations} onPreview={openPreview}/>
                  </div>
                </div>
              ))}
              <div ref={bottomRef}/>
            </div>
            {previewLoading && (
              <div className="mb-2 flex items-center gap-2 rounded bg-blue-50 p-2 text-xs text-blue-700">
                <LoaderCircle size={13} className="animate-spin"/>Đang tải nội dung tài liệu...
              </div>
            )}
            {error && <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}
            <form onSubmit={submit} className="mt-4 flex gap-2">
              <input
                className="field"
                value={question}
                onChange={event => setQuestion(event.target.value)}
                placeholder="Ví dụ: Giải thích các bước xây dựng hệ thống RAG..."
              />
              <button disabled={loading} className="btn-primary" aria-label="Gửi">
                {loading ? <LoaderCircle className="animate-spin" size={16}/> : <Send size={16}/>}
              </button>
            </form>
          </div>
        </Panel>
      </div>

      {preview && <DocModal doc={preview} token={token || ""} onClose={() => setPreview(null)}/>}
    </div>
  );
}
