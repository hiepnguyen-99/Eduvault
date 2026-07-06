"use client";

import { MessageSquare, Trash2 } from "lucide-react";

type ConversationLite = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Array<unknown>;
};

type ChatHistoryListProps = {
  conversations: ConversationLite[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

function formatUpdatedAt(value: number) {
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatHistoryList({ conversations, activeId, onSelect, onDelete }: ChatHistoryListProps) {
  return (
    <section className="assistant-section">
      <div className="assistant-section__heading">
        <span className="assistant-section__title">Cuoc hoi thoai</span>
      </div>
      <div className="assistant-history">
        {conversations.map((item) => {
          const active = item.id === activeId;
          return (
            <div key={item.id} className={`assistant-history-item ${active ? "assistant-history-item--active" : ""}`}>
              <button type="button" className="assistant-history-item__main" onClick={() => onSelect(item.id)}>
                <span className={`assistant-history-item__icon ${active ? "assistant-history-item__icon--active" : ""}`}>
                  <MessageSquare size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[13px] font-bold text-[var(--text)]">{item.title}</strong>
                  <span className="mt-1 block text-[11px] text-[var(--muted)]">
                    {item.messages.length} tin . {formatUpdatedAt(item.updatedAt)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="assistant-history-item__delete"
                title="Xoa cuoc hoi thoai"
                aria-label="Xoa cuoc hoi thoai"
                onClick={() => onDelete(item.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
