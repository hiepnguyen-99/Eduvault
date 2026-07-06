"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Bot,
  ChevronDown,
  CheckCircle2,
  FolderSync,
  LoaderCircle,
  LogOut,
  HelpCircle,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Trash2,
  UploadCloud,
  User,
  X,
  XCircle,
} from "lucide-react";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { AssistantChat } from "@/components/assistant-chat";
import { LoginScreen } from "@/components/login-screen";
import { UploadTask, UploadTaskProvider, useUploadTasks, labelForUploadSource } from "@/components/upload-task-provider";
import { canAccessPath, permissionsForRole, ROLE_LABELS, ROLE_MENUS, toAppRole, MenuItem } from "@/src/config/role-menu";

const GLOBAL_ASSISTANT_OPEN_KEY = "eduvault.global-assistant.open";

export function AppShell({ children }: { children: React.ReactNode }) {
  return <AuthProvider><UploadTaskProvider><AuthenticatedShell>{children}</AuthenticatedShell></UploadTaskProvider></AuthProvider>;
}

const uploadStatusLabels: Record<UploadTask["status"], string> = {
  uploading: "Đang tải lên",
  uploaded: "Đã tải file gốc",
  analyzing: "Đang AI phân tích",
  saving_metadata: "Đang lưu metadata",
  pending_confirmation: "Chờ xác nhận phân loại",
  processing: "Đã lưu, AI đang xử lý",
  completed: "Đã lưu, AI xử lý nền",
  failed: "Thất bại",
};

function formatUploadBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function UploadNotificationMenu() {
  const { tasks, retryUpload, removeTask } = useUploadTasks();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const activeCount = tasks.filter(task => !["completed", "failed"].includes(task.status)).length;
  const failedCount = tasks.filter(task => task.status === "failed").length;
  const badgeCount = activeCount || failedCount;

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button className="icon-btn relative cursor-pointer" aria-label="Thông báo" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <Bell size={17}/>
        {badgeCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">{badgeCount}</span>}
      </button>
      {open && <div className="app-card absolute right-0 top-12 z-[80] w-[min(420px,calc(100vw-1.5rem))] overflow-hidden shadow-xl">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <UploadCloud className="text-blue-600" size={17}/>
          <div>
            <strong className="block text-sm">Thông báo tải lên</strong>
          </div>
          {activeCount > 0 && <span className="badge badge-blue ml-auto">{activeCount} đang chạy</span>}
        </div>
        <div className="max-h-[min(68vh,520px)] space-y-2 overflow-y-auto p-3">
          {!tasks.length && <p className="muted p-3 text-center text-xs">Chưa có thông báo upload. Bạn có thể tiếp tục làm việc khi file đang được xử lý.</p>}
          {tasks.slice(0, 8).map(task => {
            const progress = task.total_bytes > 0 ? Math.round(task.uploaded_bytes / task.total_bytes * 100) : 0;
            const active = !["completed", "failed"].includes(task.status);
            const canCancel = ["pending_confirmation", "failed"].includes(task.status);
            return <div key={task.id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex items-start gap-2">
                {task.status === "completed" ? <CheckCircle2 className="mt-0.5 text-green-600" size={16}/> : task.status === "failed" ? <XCircle className="mt-0.5 text-red-600" size={16}/> : <LoaderCircle className="mt-0.5 animate-spin text-blue-600" size={16}/>}
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-xs">{task.filename}</strong>
                  <span className="muted text-[11px]">{uploadStatusLabels[task.status]}</span>
                </div>
                {task.status === "failed" && <button className="btn-secondary px-2 py-1 text-[10px] cursor-pointer" onClick={() => retryUpload(task.id)}><RefreshCw size={11}/>Thử lại</button>}
                {canCancel && <button className="btn-secondary px-2 py-1 text-[10px] text-red-600 cursor-pointer" onClick={() => removeTask(task.id)}><Trash2 size={11}/>Hủy</button>}
                {!active && !canCancel && <button className="icon-btn h-7 w-7 cursor-pointer" aria-label="Xóa tác vụ" onClick={() => removeTask(task.id)}><Trash2 size={12}/></button>}
              </div>
              <div className="progress mt-3"><i style={{ width: `${active ? progress : 100}%` }} className={task.status === "failed" ? "!bg-red-500" : task.status === "completed" ? "!bg-green-500" : ""}/></div>
              <div className="muted mt-1 flex justify-between text-[10px]"><span>{formatUploadBytes(task.uploaded_bytes)} / {formatUploadBytes(task.total_bytes)}</span><span>{progress}%</span></div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                <span className="badge badge-blue">{labelForUploadSource(task.metadata.source_type)}</span>
                {task.metadata.device_id && <span className="badge badge-amber">{task.metadata.device_id}</span>}
              </div>
              {task.metadata.ai_metadata && <div className="mt-2 rounded-lg bg-[var(--soft)] p-2 text-[10px]">
                <strong className="block text-blue-700">Nhãn AI đã gán</strong>
                <span className="muted">{task.metadata.ai_metadata.topic} · {task.metadata.ai_metadata.doc_type}</span>
              </div>}
              {task.error && <p className="mt-2 text-[10px] text-red-600">{task.error}</p>}
            </div>;
          })}
        </div>
      </div>}
    </div>
  );
}

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, ready, logout } = useAuth();
  const { tasks } = useUploadTasks();
  const [dark, setDark] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [headerQuery, setHeaderQuery] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantReady, setAssistantReady] = useState(false);
  const [mascotVisible, setMascotVisible] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    try {
      setAssistantOpen(window.localStorage.getItem(GLOBAL_ASSISTANT_OPEN_KEY) === "true");
    } catch { /* ignore */ }
    setAssistantReady(true);
  }, []);

  useEffect(() => {
    if (!assistantReady) return;
    try {
      window.localStorage.setItem(GLOBAL_ASSISTANT_OPEN_KEY, String(assistantOpen));
    } catch { /* ignore */ }
  }, [assistantOpen, assistantReady]);

  useEffect(() => {
    function handleDoubleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea')) return;
      
      setMascotVisible(v => !v);
      window.getSelection()?.removeAllRanges();
    }
    
    window.addEventListener('dblclick', handleDoubleClick);
    return () => window.removeEventListener('dblclick', handleDoubleClick);
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    const permissions = Array.from(new Set([...(user.permissions || []), ...permissionsForRole(user.role)]));
    if (!canAccessPath(path, permissions)) router.replace("/");
  }, [path, ready, router, user]);

  if (!ready) return <div className="grid min-h-screen place-items-center text-sm muted">Đang kết nối tới máy chủ...</div>;
  if (!user) return <LoginScreen />;
  const effectivePermissions = Array.from(new Set([...(user.permissions || []), ...permissionsForRole(user.role)]));
  if (!canAccessPath(path, effectivePermissions)) return null;

  const appRole = toAppRole(user.role);
  const menuItems = ROLE_MENUS[appRole].filter(item => effectivePermissions.includes(item.permission));
  const canUseAssistant = effectivePermissions.includes("chatbot.use");
  const currentMenuItem = menuItems.find(item => path === item.href.split("?")[0]);
  const assistantContext = {
    title: currentMenuItem?.label || "Kho lưu trữ tri thức",
    lines: [
      `Người dùng: ${user.name} (${user.code})`,
      `Vai trò: ${ROLE_LABELS[appRole]}`,
      user.department ? `Đơn vị: ${user.department}` : "",
      `Trang hiện tại: ${currentMenuItem?.label || path}`,
      "Chỉ trả lời theo phạm vi tài liệu và chức năng người dùng hiện tại được phép truy cập.",
    ].filter(Boolean),
  };

  // Group menu items for Horizontal Nav
  const groups: { label: string; items: MenuItem[] }[] = [];
  const overviewItems = menuItems.filter(item => ["/dashboard", "/search"].includes(item.href.split("?")[0]));
  const repositoryItems = menuItems.filter(item => ["/repository", "/auto-ingestion", "/trash", "/versions", "/knowledge-transfer"].includes(item.href.split("?")[0]));
  const adminItems = menuItems.filter(item => ["/operations", "/policy", "/governance-rules", "/users", "/permissions", "/backup", "/reports", "/audit-logs"].includes(item.href.split("?")[0]));
  const aiItems = menuItems.filter(item => ["/assistant"].includes(item.href.split("?")[0]));
  const profileItems = menuItems.filter(item => ["/profile"].includes(item.href.split("?")[0]));
  const desktopPendingCount = tasks.filter(task => task.metadata.source_type === "desktop_agent" && task.status === "pending_confirmation").length;
  const desktopActiveCount = tasks.filter(task => task.metadata.source_type === "desktop_agent" && !["completed", "failed"].includes(task.status)).length;

  if (overviewItems.length > 0) groups.push({ label: "Tổng quan", items: overviewItems });
  if (repositoryItems.length > 0) groups.push({ label: "Kho tài liệu", items: repositoryItems });
  if (adminItems.length > 0) groups.push({ label: "Quản trị", items: adminItems });
  if (aiItems.length > 0) groups.push({ label: "Trợ lý AI", items: aiItems });

  function submitHeaderSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = headerQuery.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  function renderMobileMenu() {
    return (
      <div className="fixed inset-0 z-50 flex lg:hidden">
        <div className="absolute inset-0 bg-slate-950/60" onClick={() => setMobile(false)}/>
        <aside className="relative flex h-full w-[280px] flex-col bg-[var(--sidebar)] text-white p-5 space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <img src="/vinuni_logo.png" alt="VinUniversity Logo" className="h-8 w-auto object-contain bg-white p-1 rounded" />
              <strong className="text-xs font-bold">Tri thức VinUni</strong>
            </div>
            <button aria-label="Đóng menu" className="text-white cursor-pointer" onClick={() => setMobile(false)}><X/></button>
          </div>
          <nav className="flex-1 overflow-y-auto space-y-4">
            {groups.map(group => (
              <div key={group.label} className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-blue-200/60 px-2">{group.label}</p>
                {group.items.map(item => {
                  const active = path === item.href.split("?")[0];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobile(false)}
                      className={`flex h-10 w-full items-center rounded-lg px-3 text-xs font-semibold transition-colors ${
                        active ? "bg-blue-500 text-white" : "text-blue-100/75 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
            <div className="space-y-1 border-t border-white/10 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-blue-200/60 px-2">Hỗ trợ</p>
              <Link
                href="/support"
                onClick={() => setMobile(false)}
                className="flex h-10 w-full items-center rounded-lg px-3 text-xs font-semibold text-blue-100/75 hover:bg-white/10 hover:text-white text-left"
              >
                Hỗ trợ
              </Link>
            </div>
          </nav>
        </aside>
      </div>
    );
  }

  return (
    <div className="edu-tech-bg min-h-screen flex flex-col relative overflow-hidden">
      <div className="float-node node-1 w-[500px] h-[500px] top-[-5%] left-[-10%]" style={{ animationDelay: '0s' }}></div>
      <div className="float-node node-2 w-[700px] h-[700px] top-[20%] right-[-15%]" style={{ animationDelay: '5s' }}></div>
      <div className="float-node node-3 w-[450px] h-[450px] bottom-[-10%] left-[25%]" style={{ animationDelay: '2s' }}></div>
      <header className="top-nav-shell sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/85 px-4 md:px-7 shadow-sm">
        <div className="flex items-center gap-2 xl:gap-6 min-w-0 flex-1">
          <Link href="/" className="flex items-center gap-2.5 shrink group min-w-0 rounded-lg">
            <img src="/vinuni_logo.png" alt="VinUniversity Logo" className="h-10 w-auto object-contain transition-transform duration-300 group-hover:scale-105 dark:drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] shrink-0" />
            <div className="hidden lg:block min-w-0">
              <strong className="block text-base font-black text-[#102451] dark:text-blue-100 dark:drop-shadow-[0_0_10px_rgba(147,197,253,0.6)] uppercase tracking-wider leading-none transition-all truncate">Kho lưu trữ tri thức khoa CNTT</strong>
            </div>
          </Link>
          
          <nav className="hidden lg:flex items-center gap-1.5 shrink-0" aria-label="Điều hướng ngang">
            {groups.map((group) => {
              if (group.items.length === 1) {
                const item = group.items[0];
                const active = path === item.href.split("?")[0];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center whitespace-nowrap px-2 xl:px-3 py-2 text-sm rounded-lg border border-transparent transition-all ${
                      active 
                        ? "bg-transparent text-black dark:text-white" 
                        : "text-black dark:text-blue-100 hover:bg-transparent hover:text-black dark:hover:text-white"
                    }`}
                  >
                    <span className="top-nav-label">{item.label}</span>
                  </Link>
                );
              }
              return (
                <div key={group.label} className="relative group">
                  <button 
                    onClick={() => router.push(group.items[0].href)}
                    className={`inline-flex items-center whitespace-nowrap gap-1 px-2 xl:px-3 py-2 text-sm rounded-lg border border-transparent transition-all cursor-pointer ${
                      group.items.some(item => path === item.href.split("?")[0])
                        ? "bg-transparent text-black dark:text-white" 
                        : "text-black dark:text-blue-100 hover:bg-transparent hover:text-black dark:hover:text-white"
                    }`}
                  >
                    <span className="top-nav-label">{group.label}</span>
                    <ChevronDown size={14} className="top-nav-chevron opacity-70 group-hover:rotate-180 transition-transform duration-200" />
                  </button>
                  <div className="absolute left-0 top-full opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-200 pt-1 z-50">
                    <div className="bg-white dark:bg-slate-900 border border-[var(--border)] rounded-xl shadow-xl py-1 w-52">
                      {group.items.map((item) => {
                        const active = path === item.href.split("?")[0];
                        return (
                           <Link
                             key={item.href}
                             href={item.href}
                             className={`block mx-1.5 my-0.5 px-3 py-2 text-sm font-bold rounded-lg border border-transparent transition-all ${
                               active 
                                 ? "bg-slate-50 text-[#102451] dark:bg-slate-800 dark:text-white" 
                                 : "text-gray-700 dark:text-gray-200 hover:bg-slate-50 hover:text-[#102451] dark:hover:bg-slate-800 dark:hover:text-blue-200"
                              }`}
                           >
                             {item.label}
                           </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

          </nav>
        </div>

        <div className="flex items-center gap-2 xl:gap-3 shrink-0">
          <form onSubmit={submitHeaderSearch} className="hidden xl:flex h-10 w-36 xl:w-48 2xl:w-64 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-left text-base text-[var(--muted)] focus-within:border-blue-300 focus-within:text-blue-700 dark:focus-within:border-blue-400 dark:focus-within:text-blue-300 dark:focus-within:drop-shadow-[0_0_8px_rgba(96,165,250,0.4)] shrink-0">
            <Search size={18}/>
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-gray-200 placeholder:dark:text-gray-500" value={headerQuery} onChange={event => setHeaderQuery(event.target.value)} placeholder="Tìm tài liệu..." />
          </form>
          <button 
            className={`relative flex items-center justify-center h-10 w-10 rounded-full border transition-all duration-500 shrink-0 ${
              dark 
                ? "bg-indigo-950/40 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:shadow-[0_0_25px_rgba(99,102,241,0.6)] hover:bg-indigo-900/50" 
                : "bg-amber-50 border-amber-300/60 shadow-[0_0_15px_rgba(251,191,36,0.4)] hover:shadow-[0_0_25px_rgba(251,191,36,0.6)] hover:bg-amber-100"
            }`}
            aria-label="Đổi giao diện" 
            onClick={() => setDark(!dark)}
          >
            {/* Moon Icon (Dark Mode) */}
            <Moon 
              size={20} 
              className={`absolute text-indigo-400 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                dark 
                  ? "opacity-100 rotate-0 scale-100 animate-moon-effect" 
                  : "opacity-0 -rotate-90 scale-50"
              }`} 
            />
            {/* Sun Icon (Light Mode) */}
            <Sun 
              size={20} 
              className={`absolute text-amber-500 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                dark 
                  ? "opacity-0 rotate-90 scale-50" 
                  : "opacity-100 rotate-0 scale-100 animate-sun-effect"
              }`} 
            />
          </button>
          <Link href="/auto-ingestion" className="hidden md:flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[#102451] dark:text-blue-200 hover:border-blue-300 hover:text-blue-700 dark:hover:border-blue-400 dark:hover:text-blue-100 dark:hover:drop-shadow-[0_0_10px_rgba(147,197,253,0.6)] transition-all shrink-0">
            <FolderSync size={16}/>
            <span className="hidden lg:inline">Tải tự động</span>
            {(desktopPendingCount > 0 || desktopActiveCount > 0) && (
              <span className="badge badge-amber">{desktopPendingCount > 0 ? `${desktopPendingCount} chờ` : `${desktopActiveCount} chạy`}</span>
            )}
          </Link>
          <UploadNotificationMenu />
          <div className="relative group flex items-center gap-2 border-l border-[var(--border)] pl-3 cursor-pointer h-full">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-[#102451] dark:bg-blue-900/80 dark:border dark:border-blue-500 dark:drop-shadow-[0_0_8px_rgba(59,130,246,0.6)] text-sm font-bold text-white shrink-0 transition-all">
              {user.code.slice(0, 2)}
            </div>
            <div className="hidden md:block text-left">
              <strong className="block text-sm leading-none dark:text-blue-50">{user.name}</strong>
              <span className="muted text-xs block mt-0.5 dark:text-blue-200/70">{ROLE_LABELS[appRole]}</span>
            </div>
            <ChevronDown size={16} className="muted ml-1 transition-transform group-hover:rotate-180 dark:text-blue-200/70" />
            
            <div className="absolute right-0 top-[120%] w-52 opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-200 z-50">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-[var(--border)] shadow-xl overflow-hidden py-1">
                <div className="px-4 py-3 border-b border-[var(--border)] mb-1 bg-slate-50/50 dark:bg-slate-800/50">
                  <strong className="block text-xs text-[#102451] dark:text-blue-100 mb-1">{user.name}</strong>
                  <span className="block text-[10px] text-gray-500 font-medium">@{user.code}</span>
                </div>
                <Link href="/profile" className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors text-left">
                  <User size={14} className="text-blue-500" /> Hồ sơ cá nhân
                </Link>
                <Link href="/support" className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors text-left">
                  <HelpCircle size={14} className="text-blue-500" /> Hỗ trợ
                </Link>
                <Link href="/settings" className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors text-left">
                  <FolderSync size={14} className="text-emerald-500" /> Watched folder
                </Link>
                <div className="border-t border-[var(--border)] my-1"></div>
                <button onClick={async () => { await logout(); window.location.href = "/"; }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left">
                  <LogOut size={14} /> Đăng xuất
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {mobile && renderMobileMenu()}

      {/* Main Content Area */}
      <main className={`flex-1 flex min-h-0 w-full justify-center p-3 md:p-5 xl:p-6 transition-all duration-500 ease-in-out ${assistantOpen ? "md:pr-[420px] xl:pr-[440px]" : ""}`}>
        <div className="flex min-h-0 w-full max-w-[1600px] flex-1">
          {children}
        </div>
      </main>

      {/* Persistent AI Assistant chat sidebar */}
      {canUseAssistant && path !== "/assistant" && (
        <>
          {!assistantOpen && (
            <div className={`fixed bottom-4 right-4 md:bottom-8 md:right-8 z-[70] group transition-all duration-700 ease-in-out transform ${mascotVisible ? "translate-x-0 opacity-100" : "translate-x-32 opacity-0 pointer-events-none"}`}>
              <button
                className="relative inline-flex items-center justify-center transition-all duration-300 cursor-pointer hover:-translate-y-2 active:translate-y-2 hover:scale-105 drop-shadow-[0_20px_20px_rgba(0,0,0,0.3)]"
                onClick={() => setAssistantOpen(true)}
                aria-label="Mở trợ lý AI"
              >
                <style dangerouslySetInnerHTML={{ __html: `
                  @keyframes floatMascot {
                    0% { transform: translateY(0px) rotate(0deg); }
                    33% { transform: translateY(-8px) rotate(3deg); }
                    66% { transform: translateY(4px) rotate(-2deg); }
                    100% { transform: translateY(0px) rotate(0deg); }
                  }
                  .animate-float-mascot {
                    animation: floatMascot 4s ease-in-out infinite;
                  }
                `}} />
                
                {/* Hào quang phía sau (Glow) */}
                <div className="absolute inset-0 top-1/4 rounded-full bg-cyan-400/20 animate-ping pointer-events-none blur-2xl duration-1000"></div>
                
                {/* Hình dáng Mascot */}
                <img src="/bot-avatar.png" alt="Trợ lý AI" className="w-24 h-24 md:w-32 md:h-32 object-contain animate-float-mascot" />
                
                {/* Bóng dưới chân (Ground Shadow) */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-16 h-3 bg-black/20 rounded-full blur-sm animate-pulse pointer-events-none"></div>

                {/* Bong bóng chat (Speech Bubble) hiển thị khi hover */}
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white text-[#102451] text-sm font-black px-4 py-2 rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none transform group-hover:-translate-y-2">
                  Hỏi đáp cùng Trợ lý AI!
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45"></div>
                </div>
              </button>
            </div>
          )}
          {assistantOpen && (
            <div className="fixed top-[72px] bottom-0 left-0 right-0 z-[90] pointer-events-none">
              <div className="absolute inset-0 bg-slate-950/20 opacity-100 md:hidden pointer-events-auto" onClick={() => setAssistantOpen(false)}/>
              <aside className="pointer-events-auto absolute top-3 right-3 bottom-3 md:top-4 md:right-4 md:bottom-4 w-[calc(100vw-24px)] md:w-[380px] xl:w-[400px] rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl overflow-hidden flex flex-col">
                <AssistantChat variant="panel" context={assistantContext} onClose={() => setAssistantOpen(false)}/>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
