"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Conversation, GithubRepoLink } from "@/lib/types";
import { relativeTime } from "@/lib/dateGroups";

export function HomeDashboard({
  userName,
  conversations,
  activeConversationId,
  githubRepo,
  onSelectConversation,
  onNewChat,
  onConnectRepo,
  onSuggestion,
}: {
  userName?: string | null;
  conversations: Conversation[];
  activeConversationId: string;
  githubRepo?: GithubRepoLink;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onConnectRepo: () => void;
  onSuggestion: (text: string) => void;
}) {
  const [search, setSearch] = useState("");

  const others = useMemo(
    () =>
      conversations
        .filter((c) => c.id !== activeConversationId && c.messages.length > 0)
        .sort((a, b) => b.createdAt - a.createdAt),
    [conversations, activeConversationId]
  );

  const lastConversation = others[0];

  const filtered = useMemo(
    () =>
      others.filter((c) =>
        c.title.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [others, search]
  );

  const suggestions = githubRepo
    ? [
        {
          title: `Review open TODOs in ${githubRepo.owner}/${githubRepo.name}`,
          prompt: `Look through ${githubRepo.owner}/${githubRepo.name} for TODOs or unfinished code and suggest fixes.`,
        },
        {
          title: "Write unit tests for a tricky function",
          prompt: "I'll paste a function from the repo — write unit tests for it.",
        },
      ]
    : [
        {
          title: "What can you help me with?",
          prompt: "What can you help me with?",
        },
        {
          title: "Write unit tests for a function I share",
          prompt: "I'll paste a function — write unit tests for it.",
        },
      ];

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 overflow-y-auto pb-4 pr-1">
      <div>
        <h1 className="text-2xl font-semibold text-nimbus-text sm:text-3xl">
          Welcome{userName ? `, ${userName}` : ""}! 👋
        </h1>
        <p className="mt-1 text-sm text-nimbus-text-muted">
          How can I help you today?
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardLabel>Connected repo</CardLabel>
          {githubRepo ? (
            <>
              <p className="mt-2 truncate text-base font-semibold text-nimbus-text">
                {githubRepo.owner}/{githubRepo.name}
              </p>
              <p className="mt-1 text-xs text-nimbus-text-muted">
                branch: {githubRepo.branch}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-nimbus-text-muted">
                No repo connected yet.
              </p>
              <button
                type="button"
                onClick={onConnectRepo}
                className="mt-3 rounded-[var(--nimbus-radius-pill)] bg-nimbus-accent px-3.5 py-1.5 text-xs font-medium text-white transition-opacity duration-300 ease-[var(--nimbus-ease)] hover:opacity-90"
              >
                Connect repo
              </button>
            </>
          )}
        </Card>

        <Card>
          <CardLabel>Pick up where you left off</CardLabel>
          {lastConversation ? (
            <button
              type="button"
              onClick={() => onSelectConversation(lastConversation.id)}
              className="mt-2 block w-full text-left"
            >
              <p className="truncate text-base font-semibold text-nimbus-text">
                {lastConversation.title}
              </p>
              <p className="mt-1 text-xs text-nimbus-text-muted">
                {relativeTime(lastConversation.createdAt)}
              </p>
            </button>
          ) : (
            <p className="mt-2 text-sm text-nimbus-text-muted">
              No previous conversations yet.
            </p>
          )}
        </Card>

        {suggestions.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onSuggestion(s.prompt)}
            className="text-left"
          >
            <Card className="transition-[transform,border-color] duration-300 ease-[var(--nimbus-ease)] hover:-translate-y-0.5 hover:border-nimbus-accent/40">
              <div className="flex items-center gap-1.5 text-nimbus-accent">
                <SparkleIcon />
                <span className="text-xs font-medium uppercase tracking-wide">
                  Suggested Task
                </span>
              </div>
              <p className="mt-2 text-base font-semibold text-nimbus-text">
                {s.title}
              </p>
            </Card>
          </button>
        ))}
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recent chats…"
            className="min-w-0 flex-1 rounded-[var(--nimbus-radius-pill)] border border-nimbus-border bg-nimbus-bg px-3.5 py-2 text-sm text-nimbus-text placeholder:text-nimbus-text-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={onNewChat}
            className="shrink-0 rounded-[var(--nimbus-radius-pill)] bg-nimbus-accent px-4 py-2 text-sm font-medium text-white transition-opacity duration-300 ease-[var(--nimbus-ease)] hover:opacity-90"
          >
            New chat
          </button>
        </div>

        <div className="flex flex-col divide-y divide-nimbus-border">
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-nimbus-text-muted">
              {others.length === 0 ? "No recent chats yet." : "No matches."}
            </p>
          )}
          {filtered.map((c) => {
            const userMessages = c.messages.filter((m) => m.role === "user").length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectConversation(c.id)}
                className="flex min-w-0 items-center gap-3 py-3 text-left transition-colors duration-200 ease-[var(--nimbus-ease)] hover:bg-nimbus-bg/60"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    c.messages.length > 0 ? "bg-nimbus-free" : "bg-nimbus-text-muted"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-nimbus-text">
                  {c.title}
                </span>
                <span className="shrink-0 rounded-[var(--nimbus-radius-pill)] bg-nimbus-bg px-2.5 py-1 text-xs text-nimbus-text-muted">
                  {c.model.split("/").pop()}
                </span>
                <span className="shrink-0 rounded-[var(--nimbus-radius-pill)] bg-nimbus-bg px-2.5 py-1 text-xs text-nimbus-text-muted">
                  {userMessages} msg{userMessages === 1 ? "" : "s"}
                </span>
                <span className="shrink-0 rounded-[var(--nimbus-radius-pill)] bg-nimbus-bg px-2.5 py-1 text-xs text-nimbus-text-muted">
                  {relativeTime(c.createdAt)}
                </span>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--nimbus-radius-card)] border border-nimbus-border bg-nimbus-surface p-4 shadow-[var(--nimbus-shadow)] ${className}`}
    >
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-nimbus-text-muted">
      {children}
    </p>
  );
}

function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <path d="M7 1l1.2 4.1L12.5 7l-4.3 1.9L7 13l-1.2-4.1L1.5 7l4.3-1.9L7 1Z" />
    </svg>
  );
}
