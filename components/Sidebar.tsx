"use client";

import type { Conversation } from "@/lib/types";

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  const sorted = [...conversations].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-4 border-r border-nimbus-border bg-nimbus-bg px-4 py-6">
      <button
        type="button"
        onClick={onNewChat}
        className="flex items-center justify-center gap-2 rounded-2xl border border-nimbus-border bg-nimbus-surface px-4 py-2.5 text-sm font-medium text-nimbus-text shadow-[var(--nimbus-shadow)] transition-colors hover:border-nimbus-accent/40"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 1v12M1 7h12"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        New chat
      </button>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {sorted.length === 0 && (
          <p className="px-2 py-2 text-xs text-nimbus-text-muted">
            No conversations yet.
          </p>
        )}
        {sorted.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={`truncate rounded-xl px-3 py-2 text-left text-sm transition-colors ${
              c.id === activeId
                ? "bg-nimbus-surface font-medium text-nimbus-text shadow-[var(--nimbus-shadow)]"
                : "text-nimbus-text-muted hover:bg-nimbus-surface/60"
            }`}
          >
            {c.title}
          </button>
        ))}
      </div>
    </aside>
  );
}
