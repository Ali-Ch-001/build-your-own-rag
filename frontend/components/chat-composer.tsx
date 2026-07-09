"use client";

import { ArrowUp, Square } from "lucide-react";

export function ChatComposer({ value, onChange, onSubmit, onCancel, streaming, disabled }: { value: string; onChange: (value: string) => void; onSubmit: () => void; onCancel: () => void; streaming: boolean; disabled?: boolean }) {
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (value.trim() && !streaming && !disabled) onSubmit();
  }

  return (
    <form onSubmit={submit} className="border-t border-line bg-surface-1 p-3 sm:p-4">
      <label htmlFor="chat-query" className="sr-only">Ask a grounded question</label>
      <div className="flex items-end gap-2 border border-line-strong bg-canvas p-2 focus-within:border-accent">
        <textarea
          id="chat-query"
          rows={2}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (value.trim() && !streaming && !disabled) onSubmit();
            }
          }}
          className="min-h-[52px] max-h-40 flex-1 resize-y bg-transparent px-2 py-2 text-base text-ink outline-none placeholder:text-ink-faint disabled:opacity-50"
          placeholder="Ask a question grounded in the selected corpus..."
        />
        {streaming ? (
          <button type="button" className="btn-danger size-11 shrink-0 p-0" onClick={onCancel} aria-label="Cancel response"><Square size={16} fill="currentColor" aria-hidden="true" /></button>
        ) : (
          <button type="submit" className="btn-primary size-11 shrink-0 p-0" disabled={!value.trim() || disabled} aria-label="Send question"><ArrowUp size={18} aria-hidden="true" /></button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 px-1 font-mono text-[10px] text-ink-faint"><span>Enter to send / Shift+Enter for new line</span><span>Grounded mode / disconnect cancels</span></div>
    </form>
  );
}
