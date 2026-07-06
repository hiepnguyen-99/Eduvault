"use client";

import Link from "next/link";
import { Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronDown, Download, ExternalLink, FileText, Flag, LoaderCircle, Maximize2, MessageSquare, Plus, Send, Sparkles, ThumbsDown, ThumbsUp, Trash2, X, Search, BookOpen, UploadCloud, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { API_URL } from "@/lib/api";

type Citation = { id: string; title: string; topic: string; version: number; visibility: string; chunk?: string; score?: number };
type Verification = { status: string; message: string };
type Answer = { answer: string; citations: Citation[]; scope: string; trace_id?: string; intent?: string; rewritten_query?: string; verification?: Verification };

const INTENT_META: Record<string, { title: string; emoji: string }> = {
  topic_search:           { title: "Tài liệu liên quan đến chủ đề",  emoji: "📚" },
  document_lookup:        { title: "Kết quả tìm kiếm tài liệu",       emoji: "🔍" },
  document_location:      { title: "Vị trí lưu trữ tài liệu",         emoji: "📂" },
  own_document_lookup:    { title: "Tài liệu của bạn",                 emoji: "🗂️" },
  upload_help:            { title: "Hướng dẫn tải lên",                emoji: "⬆️" },
  version_management:     { title: "Thông tin phiên bản",              emoji: "🔖" },
  knowledge_transfer:     { title: "Chuyển giao tri thức",             emoji: "🤝" },
  teaching_planner:       { title: "Bộ tài liệu giảng dạy",            emoji: "🧠" },
  knowledge_gap_analysis: { title: "Phân tích khoảng trống tri thức",  emoji: "📊" },
  user_management:        { title: "Quản lý người dùng",               emoji: "👤" },
  policy_management:      { title: "Cấu hình chính sách",              emoji: "⚙️" },
  analytics_query:        { title: "Báo cáo & thống kê",               emoji: "📈" },
  system_status:          { title: "Trạng thái hệ thống",              emoji: "🖥️" },
  onboarding_guide:       { title: "Hướng dẫn sử dụng",               emoji: "🎓" },
  question_answer:        { title: "Trả lời từ tài liệu",             emoji: "💬" },
  out_of_scope:           { title: "Ngoài phạm vi hỗ trợ",            emoji: "⚠️" },
};

function intentTitle(intent?: string, streaming?: boolean): string {
  if (streaming) return "";
  if (!intent) return "Mình đã tìm thấy nội dung phù hợp";
  const meta = INTENT_META[intent];
  return meta ? `${meta.emoji} ${meta.title}` : "Mình đã tìm thấy nội dung phù hợp";
}
type FeedbackRating = "up" | "wrong_source" | "missing_document";
type MessageItem = { question: string; result: Answer; status?: string; streaming?: boolean; feedback?: FeedbackRating };
type Conversation = { id: string; title: string; messages: MessageItem[]; updatedAt: number };
type AssistantMemory = { shortTerm: string[]; longTerm: string[]; updatedAt: number };
type StreamEvent =
  | { type: "status"; message: string }
  | { type: "delta"; text: string }
  | { type: "complete"; citations: Citation[]; scope: string; trace_id?: string; intent?: string; rewritten_query?: string; verification?: Verification }
  | { type: "error"; message: string };

type AssistantContext = {
  title?: string;
  lines?: string[];
};

async function fetchSearchStreamWithFallback(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const candidates = API_URL
    ? [API_URL]
    : ["", "http://127.0.0.1:8080", "http://127.0.0.1:8002"];

  let lastError: Error | null = null;
  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}${path}`, init);
      if (response.ok && response.body) {
        return response;
      }
      if (![502, 503, 504].includes(response.status)) {
        return response;
      }
      lastError = new Error(`Máy chủ trả về lỗi HTTP ${response.status}.`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Không thể kết nối tới máy chủ.");
    }
  }
  throw lastError ?? new Error("Không thể kết nối tới máy chủ.");
}

type AssistantChatProps = {
  variant?: "page" | "panel";
  context?: AssistantContext;
  onClose?: () => void;
  className?: string;
};

type DocPreview = { id: string; title: string; content: string; files: { id: string; original_name: string; mime_type: string; size: number }[] };

const STORAGE_KEY = "eduvault_conversations";
const MEMORY_KEY = "eduvault_assistant_memory";

function convStorageKey(code: string): string {
  return `${STORAGE_KEY}:v2:${code}`;
}

function memoryStorageKey(code: string): string {
  return `${MEMORY_KEY}:${code}`;
}

function newConv(): Conversation {
  return { id: crypto.randomUUID(), title: "Cuộc hội thoại mới", messages: [], updatedAt: Date.now() };
}

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
    blocks.push(<ul key={`list-${blocks.length}`} className="space-y-2 pl-1">{bullets.map((item, index) => <li key={index} className="flex gap-2"><span className="mt-0.5 text-[#C92027]">•</span><span><InlineMarkdown text={item}/></span></li>)}</ul>);
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

function buildContextQuestion(question: string, context?: AssistantContext, memory?: AssistantMemory) {
  const lines = (context?.lines || []).map(line => line.trim()).filter(Boolean);
  const shortTerm = (memory?.shortTerm || []).slice(-5);
  const longTerm = (memory?.longTerm || []).slice(-8);
  if (!lines.length && !shortTerm.length && !longTerm.length) return question;
  return [
    `Ngữ cảnh trang hiện tại: ${context?.title || "Kho tri thức"}`,
    ...lines,
    shortTerm.length ? `Bộ nhớ ngắn hạn:\n${shortTerm.map(item => `- ${item}`).join("\n")}` : "",
    longTerm.length ? `Bộ nhớ dài hạn:\n${longTerm.map(item => `- ${item}`).join("\n")}` : "",
    `Câu hỏi của người dùng: ${question}`,
  ].filter(Boolean).join("\n\n");
}

function buildCurrentPageContext(context?: AssistantContext) {
  const parts = [context?.title || "", ...(context?.lines || []).map(line => line.trim()).filter(Boolean)];
  const joined = parts.filter(Boolean).join(" | ").trim();
  return joined || undefined;
}

function Sources({
  citations,
  onPreview,
  onDownload,
  downloadingId,
}: {
  citations: Citation[];
  onPreview?: (id: string, title: string) => void;
  onDownload?: (id: string, title: string) => void;
  downloadingId?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;
  return <div className="mt-4 border-t border-[var(--border)] pt-3">
    <button onClick={() => setOpen(value => !value)} className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] transition-colors hover:text-[#C92027]">
      <FileText size={12}/>
      Nguồn tham khảo ({citations.length})
      <ChevronDown size={12} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}/>
    </button>
    {open && <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {citations.map(item => <div key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
        <strong className="block text-xs">{item.title}</strong>
        <span className="muted mt-1 block text-[10px]">{item.topic} · phiên bản {item.version}</span>
        <div className="mt-2 flex gap-2">
          {onDownload && <button onClick={() => onDownload(item.id, item.title)} disabled={downloadingId === item.id} className="flex items-center gap-1 text-[11px] font-bold text-[#102451] hover:underline disabled:cursor-wait disabled:opacity-70">{downloadingId === item.id ? <LoaderCircle size={11} className="animate-spin"/> : <Download size={11}/>}Tải xuống</button>}
          {onDownload && <span className="text-[var(--border)]">·</span>}
          {onPreview && <button onClick={() => onPreview(item.id, item.title)} className="flex items-center gap-1 text-[11px] font-bold text-[#102451] hover:underline"><FileText size={11}/>Xem nội dung</button>}
          {onPreview && <span className="text-[var(--border)]">·</span>}
          <Link href={`/documents/${item.id}#pdf`} className="flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-[#C92027]"><ExternalLink size={11}/>Chi tiết</Link>
        </div>
      </div>)}
    </div>}
  </div>;
}

function ReferenceSources({
  citations,
  onPreview,
  onDownload,
  downloadingId,
}: {
  citations: Citation[];
  onPreview?: (id: string, title: string) => void;
  onDownload?: (id: string, title: string) => void;
  downloadingId?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;
  return <div className="mt-4 border-t border-slate-200/80 pt-3">
    <button
      onClick={() => setOpen(value => !value)}
      className="flex w-full items-center justify-between rounded-2xl border border-[#b9caf4] bg-gradient-to-r from-[#f5f8ff] via-white to-[#eef4ff] px-3.5 py-2.5 text-left shadow-[0_8px_18px_rgba(59,91,181,0.08)] transition-all hover:border-[#93afea] hover:shadow-[0_10px_24px_rgba(59,91,181,0.12)]"
    >
      <span className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-[#c92027]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#fff1f2] text-[#d62839]">
          <FileText size={13}/>
        </span>
        <span className="truncate">Nguồn tham khảo ({citations.length})</span>
      </span>
      <ChevronDown size={14} className={`shrink-0 text-[#6f88c7] transition-transform duration-200 ${open ? "rotate-180" : ""}`}/>
    </button>
    {open && <div className="mt-3 grid gap-3">
      {citations.map(item => <div key={item.id} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <strong className="block text-[15px] font-bold leading-5 text-slate-800">{item.title}</strong>
            <span className="mt-2 inline-flex max-w-full items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              <span className="truncate">{item.topic} • phiên bản {item.version}</span>
            </span>
          </div>
          <span className="mt-0.5 hidden rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700 sm:inline-flex">
            Có nguồn
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {onDownload && <button onClick={() => onDownload(item.id, item.title)} disabled={downloadingId === item.id} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#102451] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#19356f] disabled:cursor-wait disabled:bg-[#7d8fb6]">
            {downloadingId === item.id ? <LoaderCircle size={13} className="animate-spin"/> : <Download size={13}/>}
            Tải xuống
          </button>}
          {onPreview && <button onClick={() => onPreview(item.id, item.title)} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-[12px] font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100">
            <FileText size={13}/>
            Xem nội dung
          </button>}
          <Link href={`/documents/${item.id}#pdf`} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#f2d1d4] bg-[#fff6f7] px-3.5 py-2 text-[12px] font-semibold text-[#c92027] transition-colors hover:border-[#e7a4ab] hover:bg-[#ffecee]">
            <ExternalLink size={13}/>
            Chi tiết
          </Link>
        </div>
      </div>)}
    </div>}
  </div>;
}

function FeedbackControls({ value, disabled, onSend }: { value?: FeedbackRating; disabled?: boolean; onSend: (rating: FeedbackRating) => void }) {
  const options: { rating: FeedbackRating; label: string; icon: ReactNode }[] = [
    { rating: "up", label: "Hữu ích", icon: <ThumbsUp size={12}/> },
    { rating: "wrong_source", label: "Sai nguồn", icon: <ThumbsDown size={12}/> },
    { rating: "missing_document", label: "Thiếu tài liệu", icon: <Flag size={12}/> },
  ];
  return <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
    <span className="text-[11px] font-semibold text-[var(--muted)]">Phản hồi</span>
    {options.map(item => <button key={item.rating} type="button" disabled={disabled || !!value} onClick={() => onSend(item.rating)} className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${value === item.rating ? "border-[#102451]/30 bg-[#102451]/10 text-[#102451]" : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-[#C92027]/40 hover:text-[#C92027]"} disabled:cursor-default disabled:opacity-70`}>
      {item.icon}
      {value === item.rating ? "Đã ghi nhận" : item.label}
    </button>)}
  </div>;
}

function DocModal({ doc, token, onClose }: { doc: DocPreview; token: string; onClose: () => void }) {
  async function download(assetId: string, name: string) {
    const response = await fetch(`${API_URL}/api/files/${assetId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: "include",
    });
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
    <div className="app-card flex max-h-[85vh] w-full max-w-2xl flex-col" onClick={event => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4">
        <div><p className="eyebrow">Xem nội dung tài liệu</p><h2 className="mt-0.5 text-base font-bold">{doc.title}</h2></div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/documents/${doc.id}#pdf`} className="btn-secondary flex items-center gap-1 text-xs"><ExternalLink size={13}/>Mở trang chi tiết</Link>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={17}/></button>
        </div>
      </div>
      {doc.files.length > 0 && <div className="flex flex-wrap gap-2 border-b border-[var(--border)] bg-[var(--soft)] px-4 py-3">
        {doc.files.map(file => <button key={file.id} onClick={() => download(file.id, file.original_name)} className="btn-secondary flex items-center gap-1.5 text-xs"><Download size={13}/>{file.original_name}</button>)}
      </div>}
      <div className="flex-1 overflow-auto p-5">
        {doc.content ? <pre className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--text)]">{doc.content}</pre> : <p className="muted text-xs">Tài liệu này chưa có nội dung văn bản được trích xuất.</p>}
      </div>
    </div>
  </div>;
}

export function AssistantChat({ variant = "page", context, onClose, className = "" }: AssistantChatProps) {
  const { token, user } = useAuth();
  const [question, setQuestion] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<DocPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState("");
  const [memory, setMemory] = useState<AssistantMemory>({ shortTerm: [], longTerm: [], updatedAt: Date.now() });
  const [serverMemory, setServerMemory] = useState<{short_term: string[]; long_term: string[]} | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loadedKey = useRef("");
  const storageKey = user ? convStorageKey(user.code) : "";
  const memoryKey = user ? memoryStorageKey(user.code) : "";
  const activeConv = conversations.find(c => c.id === activeId);
  const messages = activeConv?.messages ?? [];
  const isPanel = variant === "panel";
  const contextLines = useMemo(() => (context?.lines || []).filter(Boolean), [context?.lines]);

  useEffect(() => {
    if (!storageKey) return;
    let loaded: Conversation[] = [];
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) loaded = JSON.parse(saved);
    } catch { /* ignore invalid history */ }
    if (!loaded.length) loaded = [newConv()];
    setConversations(loaded);
    setActiveId(loaded[0].id);
    loadedKey.current = storageKey;
  }, [storageKey]);

  useEffect(() => {
    if (!memoryKey) return;
    let loaded: AssistantMemory = { shortTerm: [], longTerm: [], updatedAt: Date.now() };
    try {
      const saved = localStorage.getItem(memoryKey);
      if (saved) loaded = { ...loaded, ...JSON.parse(saved) };
    } catch { /* ignore invalid memory */ }
    setMemory({
      shortTerm: Array.isArray(loaded.shortTerm) ? loaded.shortTerm.slice(-8) : [],
      longTerm: Array.isArray(loaded.longTerm) ? loaded.longTerm.slice(-16) : [],
      updatedAt: loaded.updatedAt || Date.now(),
    });
  }, [memoryKey]);

  useEffect(() => {
    if (!memoryKey) return;
    try {
      localStorage.setItem(memoryKey, JSON.stringify(memory));
    } catch { /* ignore quota errors */ }
  }, [memory, memoryKey]);

  useEffect(() => {
    if (!storageKey || loadedKey.current !== storageKey || !conversations.length) return;
    try {
      const toSave = conversations.map(c => ({
        ...c,
        messages: c.messages.map(m => ({ ...m, streaming: false, status: undefined })),
      }));
      localStorage.setItem(storageKey, JSON.stringify(toSave.slice(0, 30)));
    } catch { /* ignore quota errors */ }
  }, [conversations, storageKey]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeId, conversations]);

  function updateMessage(convId: string, msgIndex: number, update: (m: MessageItem) => MessageItem) {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: c.messages.map((m, i) => i === msgIndex ? update(m) : m), updatedAt: Date.now() } : c));
  }

  function rememberQuestion(value: string) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) return;
    setMemory(prev => {
      const shortTerm = [...prev.shortTerm.filter(item => item !== normalized), normalized].slice(-8);
      const shouldKeepLongTerm = normalized.length >= 18 && !/^(ok|uh|ừ|vang|vâng|cam on|cảm ơn)$/i.test(normalized);
      const longTerm = shouldKeepLongTerm ? [...prev.longTerm.filter(item => item !== normalized), normalized].slice(-16) : prev.longTerm;
      return { shortTerm, longTerm, updatedAt: Date.now() };
    });
  }

  function clearMemory() {
    setMemory({ shortTerm: [], longTerm: [], updatedAt: Date.now() });
    setServerMemory(null);
    setMemoryOpen(false);
    fetch("/api/assistant/memory", { method: "DELETE" }).catch(() => {});
  }

  function openMemoryPanel() {
    setMemoryOpen(v => !v);
    if (!memoryOpen) {
      fetch("/api/assistant/memory")
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setServerMemory(data); })
        .catch(() => {});
    }
  }

  function createNew() {
    const fresh = newConv();
    setConversations(prev => [fresh, ...prev]);
    setActiveId(fresh.id);
    setError("");
    setQuestion("");
  }

  function clearActive() {
    setConversations(prev => prev.map(c => c.id === activeId ? { ...c, title: "Cuộc hội thoại mới", messages: [], updatedAt: Date.now() } : c));
    setError("");
    setQuestion("");
  }

  function deleteConv(id: string) {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id);
      if (id === activeId) {
        if (next.length) setActiveId(next[0].id);
        else {
          const fresh = newConv();
          setActiveId(fresh.id);
          return [fresh];
        }
      }
      return next;
    });
  }

  async function sendFeedback(messageIndex: number, rating: FeedbackRating) {
    const item = messages[messageIndex];
    if (!item?.result.trace_id || item.feedback) return;
    const reasonByRating: Record<FeedbackRating, string> = { up: "helpful", wrong_source: "wrong_source", missing_document: "missing_document" };
    try {
      const response = await fetch(`${API_URL}/api/search/feedback`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ trace_id: item.result.trace_id, rating, reason: reasonByRating[rating], detail: item.question }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      updateMessage(activeId, messageIndex, m => ({ ...m, feedback: rating }));
    } catch {
      setError("Không thể ghi nhận phản hồi lúc này.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const displayQuestion = question.trim();
    if (!displayQuestion || loading) return;
    setQuestion("");
    setLoading(true);
    setError("");
    rememberQuestion(displayQuestion);

    const targetId = activeId;
    let msgIndex = -1;

    setConversations(prev => prev.map(c => {
      if (c.id !== targetId) return c;
      const isFirst = c.messages.length === 0;
      msgIndex = c.messages.length;
      return {
        ...c,
        title: isFirst ? displayQuestion.slice(0, 60) : c.title,
        messages: [...c.messages, {
          question: displayQuestion,
          result: { answer: "", citations: [], scope: "public_or_owned" },
          status: "Đang kết nối với trợ lý...",
          streaming: true,
        }],
        updatedAt: Date.now(),
      };
    }));

    try {
      const response = await fetchSearchStreamWithFallback("/api/search/stream", {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: displayQuestion, current_page: buildCurrentPageContext(context) }),
      });
      if (!response.ok || !response.body) throw new Error(`Máy chủ trả về lỗi HTTP ${response.status}.`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = done ? "" : lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "status") {
            updateMessage(targetId, msgIndex, m => ({ ...m, status: event.message }));
          } else if (event.type === "delta") {
            updateMessage(targetId, msgIndex, m => ({ ...m, status: "", result: { ...m.result, answer: m.result.answer + event.text } }));
            await new Promise(resolve => setTimeout(resolve, 18));
          } else if (event.type === "complete") {
            updateMessage(targetId, msgIndex, m => ({
              ...m,
              streaming: false,
              status: "",
              result: { ...m.result, citations: event.citations, scope: event.scope, trace_id: event.trace_id, intent: event.intent, rewritten_query: event.rewritten_query, verification: event.verification },
            }));
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
        if (done) break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể hỏi trợ lý.";
      setError(msg);
      if (msgIndex >= 0) updateMessage(targetId, msgIndex, m => ({ ...m, streaming: false, status: "", result: { ...m.result, answer: m.result.answer || msg } }));
    } finally {
      setLoading(false);
    }
  }

  async function openPreview(id: string, title: string) {
    setPreviewLoading(true);
    try {
      const [detail, provenance] = await Promise.all([
        fetch(`${API_URL}/api/documents/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: "include",
        }).then(response => response.json()),
        fetch(`${API_URL}/api/documents/${id}/provenance`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: "include",
        }).then(response => response.json()),
      ]);
      setPreview({ id, title, content: detail.content, files: provenance.files || [] });
    } catch {
      setPreview({ id, title, content: "", files: [] });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function downloadCitationDocument(id: string, title: string) {
    setDownloadingId(id);
    setError("");
    try {
      const provenanceResponse = await fetch(`${API_URL}/api/documents/${id}/provenance`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      });
      if (!provenanceResponse.ok) throw new Error(`Không thể lấy thông tin tệp của "${title}".`);
      const provenance = await provenanceResponse.json();
      const file = Array.isArray(provenance.files) ? provenance.files[0] : null;
      if (!file?.id) throw new Error(`Tài liệu "${title}" hiện chưa có tệp gốc để tải xuống.`);

      const fileResponse = await fetch(`${API_URL}/api/files/${file.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      });
      if (!fileResponse.ok) throw new Error(`Không thể tải xuống "${title}" ngay lúc này.`);

      const url = URL.createObjectURL(await fileResponse.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.original_name || `${title}.bin`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải xuống tài liệu này ngay lúc này.");
    } finally {
      setDownloadingId("");
    }
  }

  return <div className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${isPanel ? "h-full rounded-[20px] border border-slate-300/85 bg-[linear-gradient(180deg,#f3f6fb_0%,#eef3f9_100%)] shadow-[0_0_0_1px_rgba(148,163,184,0.24),0_0_22px_rgba(148,163,184,0.16),0_18px_48px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,#0f172a_0%,#111c2e_100%)] dark:shadow-[0_0_0_1px_rgba(96,165,250,0.18),0_0_24px_rgba(59,130,246,0.18),0_18px_48px_rgba(2,6,23,0.42)]" : "app-card h-full border border-blue-100 shadow-2xl"} ${className}`}>
    {/* Minimal White Header */}
    <div className="flex shrink-0 items-center justify-between gap-3 bg-[rgba(244,247,252,0.94)] dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-300/85 dark:border-slate-800 px-5 py-3.5 relative z-10">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 font-extrabold tracking-tight text-[16px] text-[#102451] dark:text-blue-100">
          <div className="w-8 h-8 shrink-0 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex items-center justify-center p-0.5 relative group">
            <img src="/bot-avatar.png" alt="Bot" className="w-full h-full object-cover rounded-full" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 border border-white dark:border-slate-900"></span>
            </span>
          </div>
          Trợ lý AI
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-bold transition-colors ${memoryOpen ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`} title="Bộ nhớ trợ lý" aria-label="Bộ nhớ trợ lý" onClick={openMemoryPanel}><MessageSquare size={14}/><span className="hidden sm:inline">Bộ nhớ</span></button>
        <button className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" title="Cuộc hội thoại mới" aria-label="Cuộc hội thoại mới" onClick={createNew}><Plus size={15}/></button>
        <button className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-red-900/40 dark:hover:text-red-400" title="Xóa nội dung chat" aria-label="Xóa nội dung chat" onClick={clearActive}><Trash2 size={15}/></button>
        {isPanel && <Link href="/assistant" className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" title="Mở toàn màn hình" aria-label="Mở toàn màn hình"><Maximize2 size={15}/></Link>}
        {onClose && <button className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" title="Đóng trợ lý" aria-label="Đóng trợ lý" onClick={onClose}><X size={16}/></button>}
      </div>
    </div>

    {/* {contextLines.length > 0 && <div className="shrink-0 border-b border-[var(--border)] bg-[#102451]/10 px-4 py-2 text-[11px] text-[#102451]">
      <strong className="block">Ngữ cảnh hiện tại</strong>
      <p className="mt-1 line-clamp-2">{contextLines.join(" · ")}</p>
    </div>} */}

    {memoryOpen && <div className="shrink-0 border-b border-[var(--border)] bg-[rgba(228,236,248,0.72)] dark:bg-slate-800/70 px-4 py-3 text-[11px]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong>Bộ nhớ của trợ lý</strong>
        <button className="text-[11px] font-bold text-red-600 hover:underline" onClick={clearMemory}>Xóa bộ nhớ</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
          <span className="muted font-semibold">🧠 Ngắn hạn (server)</span>
          <p className="mt-1 line-clamp-4 whitespace-pre-wrap">{(serverMemory?.short_term ?? []).slice(-4).join("\n") || "Chưa có nội dung."}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
          <span className="muted font-semibold">📚 Dài hạn (server)</span>
          <p className="mt-1 line-clamp-4 whitespace-pre-wrap">{(serverMemory?.long_term ?? []).slice(-4).join("\n") || "Chưa có nội dung."}</p>
        </div>
      </div>
    </div>}

    <div className={`min-h-0 min-w-0 flex-1 overflow-hidden ${isPanel ? "flex flex-col" : "grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)]"}`}>
      <aside className={`${isPanel ? "max-h-28 shrink-0 border-b bg-[rgba(241,245,251,0.84)] dark:bg-slate-900/55" : "min-h-0 border-b xl:border-b-0 xl:border-r"} min-w-0 border-[var(--border)] overflow-auto`}>
        <div className={`${isPanel ? "flex gap-2 overflow-x-auto p-2" : "space-y-0.5 p-2"}`}>
          {conversations.map(c => <div key={c.id} className={`group flex min-w-0 items-start gap-1 rounded-lg px-2 py-2 ${isPanel ? "w-52 shrink-0" : ""} ${c.id === activeId ? "bg-[#102451]/10" : "hover:bg-[var(--soft)]"}`}>
            <button className="flex min-w-0 flex-1 gap-2 text-left" onClick={() => { setActiveId(c.id); setError(""); }}>
              <MessageSquare size={14} className={`mt-0.5 shrink-0 ${c.id === activeId ? "text-[#102451]" : "text-[var(--muted)]"}`}/>
              <div className="min-w-0">
                <span className={`block truncate text-xs font-medium ${c.id === activeId ? "text-[#102451]" : ""}`}>{c.title}</span>
                <span className="muted text-[10px]">{c.messages.length} tin · {new Date(c.updatedAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </button>
            <button onClick={() => deleteConv(c.id)} className="mt-0.5 shrink-0 text-[var(--muted)] opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100" title="Xóa"><Trash2 size={13}/></button>
          </div>)}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[rgba(248,250,253,0.62)] p-4 dark:bg-transparent">
        <div ref={messagesViewportRef} className="min-h-0 min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto pr-1 pt-1 pb-8">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-5 mt-2 max-w-full" style={{ animation: "chatPopIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards" }}>
              <style dangerouslySetInnerHTML={{ __html: `
                @keyframes chatPopIn {
                  from { opacity: 0; transform: translateY(15px) scale(0.98); }
                  to { opacity: 1; transform: translateY(0) scale(1); }
                }
              `}} />
              <div className="mx-auto w-full max-w-[460px] rounded-2xl bg-gradient-to-br from-white to-blue-50 p-5 shadow-lg border border-blue-100/50">
                <div className="mb-3 flex items-center gap-2.5 font-bold text-[#102451] tracking-wide">
                  <div className="p-1.5 bg-[#102451]/10 rounded-lg">
                    <Sparkles className="text-[#102451]" size={16}/>
                  </div>
                  Trợ lý AI - VinUni
                </div>
                <p className="mb-4 text-sm text-slate-600 leading-relaxed">
                  Chào bạn! Mình có thể tìm tài liệu, tóm tắt nội dung, hướng dẫn tải lên, kiểm tra policy và trả lời theo nguồn bạn được phép truy cập.
                </p>
                <div className="space-y-3">
                  <div className="text-[11px] font-extrabold text-blue-900 tracking-wider uppercase mb-2">Gợi ý</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setQuestion("Tìm tài liệu theo chủ đề ")} className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-blue-300 text-left group">
                      <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors"><Search size={16}/></div>
                      <div className="min-w-0 flex-1">
                        <strong className="block text-xs text-slate-800 font-bold mb-0.5 truncate">Tìm theo chủ đề</strong>
                        <span className="block text-[10px] text-slate-500 leading-tight line-clamp-2">Lọc nhanh tài liệu theo học phần, chủ đề.</span>
                      </div>
                    </button>
                    <button onClick={() => setQuestion("Tóm tắt tài liệu về ")} className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-blue-300 text-left group">
                      <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-100 transition-colors"><BookOpen size={16}/></div>
                      <div className="min-w-0 flex-1">
                        <strong className="block text-xs text-slate-800 font-bold mb-0.5 truncate">Tóm tắt nội dung</strong>
                        <span className="block text-[10px] text-slate-500 leading-tight line-clamp-2">Rút ý chính và so sánh nội dung.</span>
                      </div>
                    </button>
                    <button onClick={() => setQuestion("Hướng dẫn tải lên một tài liệu mới.")} className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-blue-300 text-left group">
                      <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-100 transition-colors"><UploadCloud size={16}/></div>
                      <div className="min-w-0 flex-1">
                        <strong className="block text-xs text-slate-800 font-bold mb-0.5 truncate">Hỗ trợ tải lên</strong>
                        <span className="block text-[10px] text-slate-500 leading-tight line-clamp-2">Hướng dẫn đặt tên, chọn thư mục.</span>
                      </div>
                    </button>
                    <button onClick={() => setQuestion("Kiểm tra quyền truy cập của tôi.")} className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-blue-300 text-left group">
                      <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-100 transition-colors"><ShieldCheck size={16}/></div>
                      <div className="min-w-0 flex-1">
                        <strong className="block text-xs text-slate-800 font-bold mb-0.5 truncate">Kiểm tra quyền</strong>
                        <span className="block text-[10px] text-slate-500 leading-tight line-clamp-2">Làm rõ quyền xem, chỉnh sửa.</span>
                      </div>
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}
          {messages.map((item, index) => <div key={index} className="space-y-4">
            <div className="ml-auto max-w-[82%] rounded-xl rounded-tr-sm bg-[#102451] p-4 text-sm text-white">{item.question}</div>
            <div className="max-w-[95%] rounded-xl rounded-tl-sm border border-slate-200/70 bg-[rgba(229,237,248,0.92)] p-5 text-sm shadow-[0_8px_20px_rgba(15,23,42,0.05)] dark:border-slate-700 dark:bg-[var(--soft)]">
              <div className="mb-3 flex items-center gap-2 text-[#102451]">
                <Sparkles size={15}/>
                {item.streaming && <span className="text-xs font-medium">{item.status || "Đang trả lời..."}</span>}
              </div>
              {item.result.answer ? <div><FriendlyAnswer answer={item.result.answer}/>{item.streaming && <span className="ml-1 inline-block h-4 w-1.5 animate-pulse bg-[#102451] align-middle"/>}</div> : <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><LoaderCircle className="animate-spin" size={14}/>{item.status}</div>}
              {!item.streaming && <ReferenceSources citations={item.result.citations} onPreview={openPreview} onDownload={downloadCitationDocument} downloadingId={downloadingId}/>}
              {!item.streaming && item.result.trace_id && <FeedbackControls value={item.feedback} onSend={rating => sendFeedback(index, rating)}/>}
            </div>
          </div>)}
          <div ref={bottomRef} className="h-6 shrink-0"/>
        </div>

        {previewLoading && <div className="mb-2 flex items-center gap-2 rounded-lg border border-blue-200/70 bg-[#102451]/10 p-2 text-xs text-[#102451]"><LoaderCircle size={13} className="animate-spin"/>Đang tải nội dung tài liệu...</div>}
        {error && <p className="mb-2 rounded-lg border border-red-200 bg-red-50/90 p-2 text-xs text-red-700">{error}</p>}
        {messages.length === 0 && (
          <div className="mb-3 px-1" style={{ animation: "chatPopIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards", animationDelay: "0.1s", opacity: 0 }}>
            <div className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase mb-2">Tác vụ nhanh</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setQuestion("Tìm tài liệu liên quan đến ")} className="px-3 py-1.5 bg-blue-50/50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-full transition-all hover:-translate-y-0.5 border border-blue-200/50 shadow-sm">Tìm tài liệu</button>
              <button onClick={() => setQuestion("Hướng dẫn tôi tải file lên kho tri thức.")} className="px-3 py-1.5 bg-emerald-50/50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full transition-all hover:-translate-y-0.5 border border-emerald-200/50 shadow-sm">Tải file</button>
              <button onClick={() => setQuestion("Tài liệu scan có OCR và trích xuất nội dung như thế nào?")} className="px-3 py-1.5 bg-purple-50/50 hover:bg-purple-100 text-purple-700 text-xs font-semibold rounded-full transition-all hover:-translate-y-0.5 border border-purple-200/50 shadow-sm">OCR</button>
              <button onClick={() => setQuestion("Giải thích quyền truy cập tài liệu của tôi.")} className="px-3 py-1.5 bg-amber-50/50 hover:bg-amber-100 text-amber-700 text-xs font-semibold rounded-full transition-all hover:-translate-y-0.5 border border-amber-200/50 shadow-sm">Quyền</button>
            </div>
          </div>
        )}
        <form onSubmit={submit} className="mt-4 flex shrink-0 gap-2 rounded-2xl border border-slate-300/80 bg-[rgba(243,246,251,0.92)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-slate-700 dark:bg-slate-900/85">
          <input className="field" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Nhập câu hỏi cho Trợ lý AI..."/>
          <button disabled={loading} className="btn-primary" aria-label="Gửi">{loading ? <LoaderCircle className="animate-spin" size={16}/> : <Send size={16}/>}</button>
        </form>
      </section>
    </div>

    {preview && <DocModal doc={preview} token={token || ""} onClose={() => setPreview(null)}/>}
  </div>;
}
