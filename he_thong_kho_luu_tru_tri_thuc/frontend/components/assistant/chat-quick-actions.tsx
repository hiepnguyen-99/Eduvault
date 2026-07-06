"use client";

import { ReactNode } from "react";

type QuickActionItem = {
  label: string;
  prompt: string;
  icon: ReactNode;
  className?: string;
};

type ChatQuickActionsProps = {
  items: QuickActionItem[];
  onSelect: (prompt: string) => void;
};

export function ChatQuickActions({ items, onSelect }: ChatQuickActionsProps) {
  return (
    <section className="assistant-section">
      <div className="assistant-section__heading">
        <span className="assistant-section__title">Thao tac nhanh</span>
      </div>
      <div className="assistant-quick-actions">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onSelect(item.prompt)}
            className={`assistant-quick-action ${item.className ?? ""}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
