"use client";

import Link from "next/link";
import type { Conversation } from "@/lib/types";
import { GithubAuthButton } from "@/components/GithubAuthButton";

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
        className="group flex items-center gap-2 rounded-2xl border border-nimbus-border bg-nimbus-surface py-2 pl-2 pr-4 text-sm font-medium text-nimbus-text shadow-[var(--nimbus-shadow)] transition-[transform,border-color] duration-300 ease-[var(--nimbus-ease)] hover:-translate-y-0.5 hover:border-nimbus-accent/40 active:translate-y-0 active:scale-[0.98]"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-nimbus-accent-soft text-nimbus-accent transition-transform duration-300 ease-[var(--nimbus-ease)] group-hover:rotate-90">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1v12M1 7h12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
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
            className={`truncate rounded-xl border-l-2 px-3 py-2 text-left text-sm transition-[color,background-color,border-color] duration-300 ease-[var(--nimbus-ease)] ${
              c.id === activeId
                ? "border-nimbus-accent bg-nimbus-surface font-medium text-nimbus-text shadow-[var(--nimbus-shadow)]"
                : "border-transparent text-nimbus-text-muted hover:bg-nimbus-surface/60"
            }`}
          >
            {c.title}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <GithubAuthButton />
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-nimbus-border bg-nimbus-surface text-nimbus-text-muted shadow-[var(--nimbus-shadow)] transition-colors hover:text-nimbus-text"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M7.5 1.5v1.6M7.5 12v1.5M13.5 7.5H12M3 7.5H1.5M11.6 3.4l-1.1 1.1M4.5 10.5l-1.1 1.1M11.6 11.6l-1.1-1.1M4.5 4.5 3.4 3.4"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </div>
    </aside>
  );
}
