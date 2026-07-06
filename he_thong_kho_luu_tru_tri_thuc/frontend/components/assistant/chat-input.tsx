"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, RefObject, useEffect, useRef } from "react";
import { FileText, LoaderCircle, Paperclip, Send, X } from "lucide-react";

type ChatInputProps = {
  value: string;
  loading: boolean;
  canSubmit: boolean;
  attachedFile: File | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  attachmentLabel: string;
  onValueChange: (value: string) => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitShortcut: () => void;
};

const DEFAULT_HEIGHT = 64;
const MAX_HEIGHT = 160;

export function ChatInput({
  value,
  loading,
  canSubmit,
  attachedFile,
  fileInputRef,
  attachmentLabel,
  onValueChange,
  onFileSelect,
  onRemoveFile,
  onSubmit,
  onSubmitShortcut,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = `${DEFAULT_HEIGHT}px`;
    node.style.height = `${Math.min(Math.max(node.scrollHeight, DEFAULT_HEIGHT), MAX_HEIGHT)}px`;
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSubmit) onSubmitShortcut();
    }
  }

  return (
    <div className="assistant-input-shell">
      {attachedFile && (
        <div className="assistant-file-chip">
          <FileText size={14} />
          <span className="min-w-0 flex-1 truncate font-medium">{attachedFile.name}</span>
          <button type="button" className="assistant-file-chip__remove" onClick={onRemoveFile} aria-label="Bo file">
            <X size={14} />
          </button>
        </div>
      )}
      <form onSubmit={onSubmit} className="assistant-composer">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.json,.yaml,.yml"
          className="hidden"
          onChange={onFileSelect}
        />
        <button
          type="button"
          className="assistant-composer__icon assistant-composer__icon--left"
          onClick={() => fileInputRef.current?.click()}
          aria-label={attachmentLabel}
          title={attachmentLabel}
        >
          <Paperclip size={18} />
        </button>
        <div className="assistant-composer__body">
          {!value && (
            <span className="assistant-composer__placeholder">
              {attachedFile ? "Tieu de policy (tuy chon)..." : "Nhap cau hoi hoac dan tai lieu tai day..."}
            </span>
          )}
          <textarea
            ref={textareaRef}
            className="assistant-composer__textarea"
            rows={1}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Nhap cau hoi cho tro ly"
          />
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="assistant-composer__icon assistant-composer__icon--send"
          aria-label="Gui"
          title="Gui"
        >
          {loading ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />}
        </button>
      </form>
      <p className="assistant-input-footer">AI co the mac loi. Hay kiem tra thong tin quan trong.</p>
    </div>
  );
}
