"use client";

import { ExternalLink, FileText } from "lucide-react";

type RecentFileItem = {
  id: string;
  title: string;
  filename?: string;
  topic?: string;
};

type ChatRecentFilesProps = {
  files: RecentFileItem[];
  onPreview: (id: string, title: string) => void;
};

export function ChatRecentFiles({ files, onPreview }: ChatRecentFilesProps) {
  if (!files.length) return null;

  return (
    <section className="assistant-section">
      <div className="assistant-section__heading">
        <span className="assistant-section__title">Tai lieu gan day</span>
      </div>
      <div className="assistant-recent-files">
        {files.map((file) => (
          <button
            key={`${file.id}-${file.filename || file.title}`}
            type="button"
            className="assistant-recent-file"
            onClick={() => onPreview(file.id, file.title)}
          >
            <span className="assistant-recent-file__icon">
              <FileText size={16} />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <strong className="block truncate text-[13px] font-bold text-[var(--text)]">{file.title}</strong>
              <span className="mt-1 block truncate text-[11px] text-[var(--muted)]">
                {file.filename || file.topic || "Tai lieu trong kho tri thuc"}
              </span>
            </span>
            <ExternalLink size={14} className="text-[var(--muted)]" />
          </button>
        ))}
      </div>
    </section>
  );
}
