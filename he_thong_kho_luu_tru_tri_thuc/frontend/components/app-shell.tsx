"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Bot,
  ChevronDown,
  CheckCircle2,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Trash2,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { AssistantChat } from "@/components/assistant-chat";
import { LoginScreen } from "@/components/login-screen";
import { UploadTask, UploadTaskProvider, useUploadTasks } from "@/components/upload-task-provider";
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
  const [dark, setDark] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [headerQuery, setHeaderQuery] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantReady, setAssistantReady] = useState(false);

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
    if (!ready || !user) return;
    const permissions = Array.from(new Set([...(user.permissions || []), ...permissionsForRole(user.role)]));
    if (!canAccessPath(path, permissions)) router.replace("/");
  }, [path, ready, router, user]);

  if (!ready) return <div className="grid min-h-screen place-items-center text-sm muted">Đang kết nối tới máy chủ...</div>;

  const isPublic = path === "/";
  if (!user) {
    if (!isPublic) {
      return <LoginScreen />;
    }
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg)]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[var(--border)] bg-[color:var(--card)]/92 px-4 backdrop-blur md:px-7 shadow-sm">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
              <img src="/vinuni_logo.png" alt="VinUniversity Logo" className="h-10 w-auto object-contain transition-transform duration-300 group-hover:scale-105" />
              <div className="hidden lg:block min-w-0">
                <strong className="block text-xs font-black text-[#102451] uppercase tracking-wider leading-none">Kho lưu trữ tri thức khoa CNTT</strong>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <button className="icon-btn cursor-pointer" aria-label="Đổi giao diện" onClick={() => setDark(!dark)}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>
            <Link href="/dashboard" className="btn-primary h-9 rounded-lg px-4 text-xs font-bold flex items-center justify-center bg-[#102451] hover:bg-[#C92027] text-white transition-all duration-200">
              Đăng nhập
            </Link>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-[1680px] p-4 md:p-7">
          {children}
        </main>
      </div>
    );
  }

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
  const repositoryItems = menuItems.filter(item => ["/repository", "/trash", "/versions", "/knowledge-transfer"].includes(item.href.split("?")[0]));
  const adminItems = menuItems.filter(item => ["/operations", "/policy", "/governance-rules", "/users", "/permissions", "/backup", "/reports", "/audit-logs"].includes(item.href.split("?")[0]));
  const aiItems = menuItems.filter(item => ["/assistant"].includes(item.href.split("?")[0]));
  const profileItems = menuItems.filter(item => ["/profile"].includes(item.href.split("?")[0]));

  if (overviewItems.length > 0) groups.push({ label: "Tổng quan", items: overviewItems });
  if (repositoryItems.length > 0) groups.push({ label: "Kho tài liệu", items: repositoryItems });
  if (adminItems.length > 0) groups.push({ label: "Quản trị", items: adminItems });
  if (aiItems.length > 0) groups.push({ label: "Trợ lý AI", items: aiItems });
  if (profileItems.length > 0) groups.push({ label: "Cá nhân", items: profileItems });

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
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[var(--border)] bg-[color:var(--card)]/92 px-4 backdrop-blur md:px-7 shadow-sm">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <img src="/vinuni_logo.png" alt="VinUniversity Logo" className="h-10 w-auto object-contain transition-transform duration-300 group-hover:scale-105" />
            <div className="hidden lg:block min-w-0">
              <strong className="block text-xs font-black text-[#102451] uppercase tracking-wider leading-none">Kho lưu trữ tri thức khoa CNTT</strong>
            </div>
          </Link>
          
          <nav className="hidden lg:flex items-center gap-1.5" aria-label="Điều hướng ngang">
            {groups.map((group) => {
              if (group.items.length === 1) {
                const item = group.items[0];
                const active = path === item.href.split("?")[0];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 text-[13px] font-bold rounded-lg border transition-all ${
                      active 
                        ? "border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-400" 
                        : "border-transparent text-gray-600 dark:text-gray-300 hover:border-blue-300 hover:bg-blue-100/80 hover:text-blue-700 dark:hover:border-blue-800 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              }
              return (
                <div key={group.label} className="relative group">
                  <button className="flex items-center gap-1 px-3 py-2 text-[13px] font-bold text-gray-600 dark:text-gray-300 rounded-lg border border-transparent hover:border-blue-300 hover:bg-blue-100/80 hover:text-blue-700 dark:hover:border-blue-800 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 transition-all cursor-pointer">
                    <span>{group.label}</span>
                  </button>
                  <div className="absolute left-0 top-full opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-200 pt-1 z-50">
                    <div className="bg-white dark:bg-slate-900 border border-[var(--border)] rounded-xl shadow-xl py-1 w-52">
                      {group.items.map((item) => {
                        const active = path === item.href.split("?")[0];
                        return (
                           <Link
                             key={item.href}
                             href={item.href}
                             className={`block mx-1.5 my-0.5 px-3 py-2 text-xs font-bold rounded-lg border transition-all ${
                               active 
                                 ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400" 
                                 : "border-transparent text-gray-700 dark:text-gray-200 hover:border-blue-300 hover:bg-blue-100/70 hover:text-blue-700 dark:hover:border-blue-800 dark:hover:bg-slate-800"
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

            <Link
              href="/support"
              className={`px-3 py-2 text-[13px] font-bold rounded-lg border transition-all ${
                path === "/support"
                  ? "border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-400 font-bold"
                  : "border-transparent text-gray-600 dark:text-gray-300 hover:border-blue-300 hover:bg-blue-100/80 hover:text-blue-700 dark:hover:border-blue-800 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
              }`}
            >
              Hỗ trợ
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <form onSubmit={submitHeaderSearch} className="hidden xl:flex h-10 w-44 md:w-56 lg:w-64 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-left text-sm text-[var(--muted)] focus-within:border-blue-300 focus-within:text-blue-700">
            <Search size={16}/>
            <input className="min-w-0 flex-1 bg-transparent text-xs outline-none" value={headerQuery} onChange={event => setHeaderQuery(event.target.value)} placeholder="Tìm tài liệu..." />
          </form>
          <button className="icon-btn cursor-pointer" aria-label="Đổi giao diện" onClick={() => setDark(!dark)}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>
          <UploadNotificationMenu />
          <div className="flex items-center gap-2 border-l border-[var(--border)] pl-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#102451] text-xs font-bold text-white shrink-0">
              {user.code.slice(0, 2)}
            </div>
            <div className="hidden md:block text-left">
              <strong className="block text-xs leading-none">{user.name}</strong>
              <span className="muted text-[10px] block mt-0.5">{ROLE_LABELS[appRole]}</span>
            </div>
            <button className="icon-btn ml-1 cursor-pointer" aria-label="Đăng xuất" onClick={async () => { await logout(); router.push("/"); }}>
              <LogOut size={15}/>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {mobile && renderMobileMenu()}

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-[1680px] p-4 md:p-7">
        {children}
      </main>

      {/* Persistent AI Assistant chat sidebar */}
      {canUseAssistant && (
        <>
          {!assistantOpen && (
            <button
              className="fixed bottom-5 right-5 z-[70] inline-flex h-12 items-center gap-2 rounded-full bg-[#102451] px-4 text-sm font-bold text-white shadow-xl shadow-blue-950/20 transition hover:bg-[#C92027] cursor-pointer"
              onClick={() => setAssistantOpen(true)}
              aria-label="Mở trợ lý AI"
            >
              <Bot size={18}/>
              <span className="hidden sm:inline">Trợ lý AI</span>
            </button>
          )}
          {assistantOpen && (
            <div className="fixed inset-0 z-[90] pointer-events-none">
              <div className="absolute inset-0 bg-slate-950/20 opacity-100 md:hidden pointer-events-auto" onClick={() => setAssistantOpen(false)}/>
              <aside className="pointer-events-auto absolute inset-y-0 right-0 w-[min(440px,100vw)] border-l border-[var(--border)] bg-[var(--card)] shadow-2xl">
                <AssistantChat variant="panel" context={assistantContext} onClose={() => setAssistantOpen(false)}/>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
