"use client";

import Link from "next/link";
import { Bot, Maximize2, MessageSquare, Plus, Trash2, X } from "lucide-react";

type ChatHeaderProps = {
  title: string;
  subtitle: string;
  contextTitle?: string;
  memoryOpen: boolean;
  isPanel: boolean;
  onToggleMemory: () => void;
  onMemory: () => void;
  onNew: () => void;
  onClear: () => void;
  onClose?: () => void;
};

export function ChatHeader({
  contextTitle,
  isPanel,
  memoryOpen,
  onMemory,
  onNew,
  onClear,
  onClose,
}: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 px-6 py-4 bg-gradient-to-r from-[#102451] to-blue-800 text-white shadow-lg relative z-10 border-b border-blue-900/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 font-black text-lg tracking-wide drop-shadow-md">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-black/50 p-0.5 border border-cyan-300/30 shadow-inner flex shrink-0">
            <img src="/bot-avatar.png" alt="Bot" className="w-full h-full rounded-full object-cover" />
          </div>
          Trợ lý AI
        </div>
        <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-cyan-100/90 font-medium tracking-wide">
          {contextTitle || "Kho tri thức & Hỗ trợ công nghệ giáo dục"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-all ${memoryOpen ? "bg-cyan-500 text-white shadow-inner" : "bg-white/10 text-white hover:bg-white/20"}`} title="Bộ nhớ trợ lý" aria-label="Bộ nhớ trợ lý" onClick={onMemory}>
          <MessageSquare size={13}/>
          <span className="hidden sm:inline">Bộ nhớ</span>
        </button>
        <button className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20" title="Cuộc hội thoại mới" aria-label="Cuộc hội thoại mới" onClick={onNew}><Plus size={14}/></button>
        <button className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-red-500/80" title="Xóa nội dung chat" aria-label="Xóa nội dung chat" onClick={onClear}><Trash2 size={14}/></button>
        {isPanel && <Link href="/assistant" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20" title="Mở toàn màn hình" aria-label="Mở toàn màn hình"><Maximize2 size={14}/></Link>}
        {onClose && <button className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20" title="Đóng trợ lý" aria-label="Đóng trợ lý" onClick={onClose}><X size={15}/></button>}
      </div>
    </header>
  );
}
