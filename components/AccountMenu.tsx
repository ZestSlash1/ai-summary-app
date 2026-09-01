"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import type { Conversation } from "@/lib/types";
import { PopoverPanel, usePopoverDismiss } from "./Popover";

export function AccountMenu({ conversations }: { conversations: Conversation[] }) {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, () => setOpen(false), rootRef);

  if (status === "loading") {
    return <div className="h-9 w-9 shrink-0 rounded-full bg-nimbus-surface" />;
  }

  if (!session?.user) {
    return (
      <button
        type="button"
        onClick={() => signIn("github")}
        className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-nimbus-border bg-nimbus-surface px-3 py-2.5 text-sm font-medium text-nimbus-text shadow-[var(--nimbus-shadow)] transition-[transform,border-color] duration-300 ease-[var(--nimbus-ease)] hover:border-nimbus-accent/40 active:scale-[0.97]"
      >
        <GithubMark className="h-4 w-4 shrink-0" />
        Sign in
      </button>
    );
  }

  const messageCount = conversations.reduce((n, c) => n + c.messages.length, 0);
  const userMessageCount = conversations.reduce(
    (n, c) => n + c.messages.filter((m) => m.role === "user").length,
    0
  );

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-2xl border border-nimbus-border bg-nimbus-surface px-2 py-2 shadow-[var(--nimbus-shadow)] transition-[border-color] duration-300 ease-[var(--nimbus-ease)] hover:border-nimbus-accent/40"
      >
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={session.user.image} alt="" className="h-7 w-7 shrink-0 rounded-full" />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nimbus-accent-soft">
            <GithubMark className="h-4 w-4 text-nimbus-accent" />
          </span>
        )}
        <span className="flex-1 truncate text-left text-sm text-nimbus-text">
          {session.user.name ?? "Signed in"}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`shrink-0 text-nimbus-text-muted transition-transform duration-300 ease-[var(--nimbus-ease)] ${open ? "" : "rotate-180"}`}
        >
          <path
            d="M1.5 6.5 5 3l3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <PopoverPanel open={open} className="bottom-full left-0 mb-2 w-full min-w-[16rem] p-1.5">
        <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2">
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="h-9 w-9 shrink-0 rounded-full" />
          ) : (
            <GithubMark className="h-9 w-9 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-nimbus-text">
              {session.user.name ?? "Signed in"}
            </p>
            <p className="truncate text-xs text-nimbus-text-muted">{session.user.email}</p>
          </div>
        </div>

        <div className="my-1 h-px bg-nimbus-border" />

        <div className="px-2.5 py-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-nimbus-text-muted">
            Usage
          </p>
          <div className="flex items-center gap-4 text-sm text-nimbus-text">
            <div>
              <span className="font-semibold">{conversations.length}</span>{" "}
              <span className="text-nimbus-text-muted">
                {conversations.length === 1 ? "chat" : "chats"}
              </span>
            </div>
            <div>
              <span className="font-semibold">{userMessageCount}</span>{" "}
              <span className="text-nimbus-text-muted">sent</span>
            </div>
            <div>
              <span className="font-semibold">{messageCount}</span>{" "}
              <span className="text-nimbus-text-muted">total</span>
            </div>
          </div>
        </div>

        <div className="my-1 h-px bg-nimbus-border" />

        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-nimbus-text transition-colors duration-200 ease-[var(--nimbus-ease)] hover:bg-nimbus-bg"
        >
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" className="shrink-0 text-nimbus-text-muted">
            <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M7.5 1.5v1.6M7.5 12v1.5M13.5 7.5H12M3 7.5H1.5M11.6 3.4l-1.1 1.1M4.5 10.5l-1.1 1.1M11.6 11.6l-1.1-1.1M4.5 4.5 3.4 3.4"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          Settings
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-nimbus-text transition-colors duration-200 ease-[var(--nimbus-ease)] hover:bg-nimbus-bg"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-nimbus-text-muted">
            <path
              d="M5.5 12.5h-3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3M9.5 9.5 12.5 6.5 9.5 3.5M12.5 6.5h-8"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Sign out
        </button>
      </PopoverPanel>
    </div>
  );
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
