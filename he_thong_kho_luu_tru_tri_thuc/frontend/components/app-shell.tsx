"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, BookOpenCheck, Bot, ChartNoAxesCombined, DatabaseBackup, File, FileClock, FolderKanban, GraduationCap, KeyRound, LoaderCircle, LogOut, Menu, Moon, Search, Send, Settings, Sparkles, Sun, Users, X } from "lucide-react";
import { navItems } from "@/lib/data";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { LoginScreen } from "@/components/login-screen";
import { Document } from "@/lib/api";
import { useBackendData } from "@/lib/hooks";

const icons = [ChartNoAxesCombined, FolderKanban, Bot, GraduationCap, FileClock, DatabaseBackup, KeyRound, ChartNoAxesCombined, Users, Settings];
const roleLabels = { lecturer: "Giảng viên", new_lecturer: "Giảng viên mới", head: "Trưởng bộ môn", admin: "Quản trị viên" };

export function AppShell({ children }: { children: React.ReactNode }) {
  return <AuthProvider><AuthenticatedShell>{children}</AuthenticatedShell></AuthProvider>;
}

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, ready, logout } = useAuth();
  const [dark, setDark] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(open => !open);
      }
      if (e.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) return <div className="min-h-screen grid place-items-center text-sm muted">Đang kết nối tới máy chủ...</div>;
  if (!user) return <LoginScreen />;

  const sidebar = (
    <aside className="h-full w-[280px] bg-[var(--sidebar)] text-white flex flex-col">
      <div className="h-[72px] px-5 flex items-center gap-3 border-b border-white/10">
        <div className="h-9 w-9 rounded-lg bg-blue-500 grid place-items-center"><BookOpenCheck size={20}/></div>
        <div><strong className="block max-w-[130px] text-[12px] font-bold uppercase leading-4 tracking-wide">Kho lưu trữ tri thức</strong></div>
      </div>
      <nav className="p-3 space-y-1 flex-1" aria-label="Điều hướng chính">
        <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[.16em] text-blue-200/60">Không gian làm việc</p>
        {navItems.map(([label, href, requiredRole], index) => {
          if (requiredRole && user?.role !== requiredRole) return null;
          const Icon = icons[index];
          const active = path === href;
          return <Link key={href} href={href} onClick={()=>setMobile(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition ${active ? "bg-blue-500 text-white shadow-lg shadow-blue-950/20" : "text-blue-100/75 hover:bg-white/8 hover:text-white"}`}><Icon size={17}/>{label}</Link>
        })}
      </nav>
      <div className="m-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex justify-between text-xs font-bold"><span>Dung lượng demo V2</span><span>100 GB</span></div>
        <div className="mt-2 h-1.5 rounded-full bg-white/10"><div className="h-full w-[12%] rounded-full bg-blue-400"/></div>
        <p className="mt-2 text-[10px] text-blue-100/60">MySQL metadata · MinIO file gốc</p>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen">
      <div className="desktop-sidebar fixed inset-y-0 left-0 z-30">{sidebar}</div>
      {mobile && <div className="fixed inset-0 z-50 flex lg:hidden"><div className="absolute inset-0 bg-slate-950/60" onClick={()=>setMobile(false)}/><div className="relative">{sidebar}<button aria-label="Đóng menu" className="absolute right-3 top-4 text-white" onClick={()=>setMobile(false)}><X/></button></div></div>}
      <div className="main-offset ml-[280px]">
        <header className="sticky top-0 z-20 h-[72px] bg-[color:var(--card)]/92 backdrop-blur border-b border-[var(--border)] px-4 md:px-7 flex items-center gap-3">
          <button className="icon-btn lg:hidden" aria-label="Mở menu" onClick={()=>setMobile(true)}><Menu size={18}/></button>
          <button onClick={()=>setSearchOpen(true)} className="h-10 max-w-xl flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 flex items-center gap-2 text-left text-sm text-[var(--muted)]"><Search size={17}/><span className="truncate">Tìm tài liệu hoặc hỏi AI...</span><kbd className="ml-auto hidden sm:block rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px]">⌘ K</kbd></button>
          <button className="icon-btn" aria-label="Đổi giao diện" onClick={()=>setDark(!dark)}>{dark?<Sun size={17}/>:<Moon size={17}/>}</button>
          <button className="icon-btn relative" aria-label="Thông báo"><Bell size={17}/><i className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500"/></button>
          <div className="hidden sm:flex items-center gap-2 border-l border-[var(--border)] pl-3"><div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-800 text-white grid place-items-center text-xs font-bold">{user.code.slice(0,2)}</div><div><strong className="block text-xs">{user.name}</strong><span className="muted text-[10px]">{roleLabels[user.role]} · {user.code}</span></div><button className="icon-btn ml-1" aria-label="Đăng xuất" onClick={logout}><LogOut size={15}/></button></div>
        </header>
        <main className="p-4 md:p-7 max-w-[1680px] mx-auto">{children}</main>
      </div>
      {searchOpen && <QuickSearch onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

type DashData = { documents: Document[] };
const emptyDash: DashData = { documents: [] };

function QuickSearch({ onClose }: { onClose: () => void }) {
  const { request } = useAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data } = useBackendData<DashData>("/api/dashboard", emptyDash);
  const [query, setQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const filtered = query.trim().length > 1
    ? data.documents.filter(d =>
        `${d.title} ${d.topic} ${d.doc_type}`.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 6)
    : data.documents.slice(0, 5);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function askAI() {
    if (!query.trim()) return;
    setAiLoading(true);
    setAiAnswer("");
    try {
      const r = await request<{ answer: string }>("/api/search", {
        method: "POST",
        body: JSON.stringify({ question: query }),
      });
      setAiAnswer(r.answer);
    } catch {
      setAiAnswer("Không thể truy vấn AI lúc này.");
    } finally {
      setAiLoading(false);
    }
  }

  function goToDoc(id: string) {
    router.push(`/documents/${id}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/55 p-4 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="app-card w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex gap-3 border-b border-[var(--border)] p-3">
          <Search className="muted mt-0.5 shrink-0" size={18}/>
          <input
            ref={inputRef}
            className="w-full bg-transparent outline-none text-sm"
            placeholder="Tìm tài liệu hoặc hỏi AI bất kỳ câu hỏi nào..."
            value={query}
            onChange={e => { setQuery(e.target.value); setAiAnswer(""); }}
            onKeyDown={e => { if (e.key === "Enter") askAI(); if (e.key === "Escape") onClose(); }}
          />
          {query && <button onClick={askAI} disabled={aiLoading} className="shrink-0 rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white flex items-center gap-1 disabled:opacity-60">
            {aiLoading ? <LoaderCircle size={13} className="animate-spin"/> : <Sparkles size={13}/>}Hỏi AI
          </button>}
          <button onClick={onClose} className="shrink-0 text-[var(--muted)]"><X size={18}/></button>
        </div>

        {aiAnswer && (
          <div className="border-b border-[var(--border)] bg-blue-50/60 p-4 dark:bg-blue-950/20">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-blue-600"><Sparkles size={13}/>Trả lời AI</div>
            <p className="text-xs leading-relaxed text-[var(--text)] whitespace-pre-wrap line-clamp-6">{aiAnswer}</p>
            <button onClick={() => { router.push(`/assistant`); onClose(); }} className="mt-2 text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"><Send size={11}/>Mở hội thoại đầy đủ</button>
          </div>
        )}

        <div className="max-h-80 overflow-auto">
          {query.trim().length > 1 && filtered.length === 0 && !aiLoading && !aiAnswer && (
            <p className="muted p-4 text-xs text-center">Không tìm thấy tài liệu. Nhấn <strong>Hỏi AI</strong> để tìm kiếm thông minh hơn.</p>
          )}
          {filtered.length > 0 && (
            <div className="p-2">
              <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                {query.trim().length > 1 ? `${filtered.length} tài liệu phù hợp` : "Tài liệu gần đây"}
              </p>
              {filtered.map(doc => (
                <button key={doc.id} onClick={() => goToDoc(doc.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--soft)]">
                  <div className="h-8 w-8 shrink-0 rounded bg-blue-50 text-blue-600 grid place-items-center"><File size={14}/></div>
                  <div className="min-w-0">
                    <strong className="block truncate text-xs">{doc.title}</strong>
                    <span className="muted text-[10px]">{doc.topic} · {doc.doc_type} · v{doc.current_version}</span>
                  </div>
                  <span className={`ml-auto shrink-0 badge ${doc.visibility === "public" ? "badge-green" : "badge-amber"}`}>{doc.visibility === "public" ? "Công khai" : "Riêng tư"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-[var(--border)] px-4 py-2 flex gap-4 text-[10px] text-[var(--muted)]">
          <span><kbd className="rounded border border-[var(--border)] px-1">↵</kbd> Hỏi AI</span>
          <span><kbd className="rounded border border-[var(--border)] px-1">Esc</kbd> Đóng</span>
          <span><kbd className="rounded border border-[var(--border)] px-1">⌘K</kbd> Mở/đóng</span>
        </div>
      </div>
    </div>
  );
}
