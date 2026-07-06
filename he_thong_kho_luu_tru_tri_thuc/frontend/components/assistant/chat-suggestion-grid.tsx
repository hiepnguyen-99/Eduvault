"use client";

import { ReactNode } from "react";

type SuggestionItem = {
  title: string;
  description: string;
  icon: ReactNode;
  prompt: string;
};

type ChatSuggestionGridProps = {
  title: string;
  items: SuggestionItem[];
  onSelect: (prompt: string) => void;
};

export function ChatSuggestionGrid({ title, items, onSelect }: ChatSuggestionGridProps) {
  return (
    <section className="assistant-section">
      <div className="assistant-section__heading">
        <span className="assistant-section__title">{title}</span>
      </div>
      <div className="assistant-suggestion-grid">
        {items.map((item) => (
          <button key={item.title} type="button" className="assistant-suggestion-card" onClick={() => onSelect(item.prompt)}>
            <div className="assistant-suggestion-card__icon">{item.icon}</div>
            <strong className="assistant-suggestion-card__title">{item.title}</strong>
            <p className="assistant-suggestion-card__description">{item.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
