"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { LogOut, Settings } from "lucide-react";
import type { Conversation } from "@/lib/types";
import { GithubMark } from "./BrandMark";
import { PopoverPanel, usePopoverDismiss } from "./Popover";
import { MENU_ROW } from "./ui/classes";

/** Avatar in the sidebar footer. Signed out, it is the sign-in button. */
export function AccountMenu({
  conversations,
  compact = false,
}: {
  conversations: Conversation[];
  compact?: boolean;
}) {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, () => setOpen(false), rootRef);

  if (status === "loading") {
    return <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-nimbus-surface-2" />;
  }

  if (!session?.user) {
    return (
      <button
        type="button"
        onClick={() => signIn("github")}
        aria-label="Sign in with GitHub"
        title="Sign in with GitHub"
        className={`flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-nimbus-border bg-nimbus-surface text-[13px] font-medium text-nimbus-text transition-[background-color,transform] duration-200 hover:bg-nimbus-surface-2 active:scale-[0.97] ${
          compact ? "w-8" : "px-3"
        }`}
      >
        <GithubMark className="h-3.5 w-3.5 shrink-0" />
        {!compact && <span data-sb-label>Sign in</span>}
      </button>
    );
  }

  const sent = conversations.reduce((n, c) => n + c.messages.filter((m) => m.role === "user").length, 0);
  const avatar = session.user.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={session.user.image} alt="" className="h-7 w-7 shrink-0 rounded-full border border-nimbus-border" />
  ) : (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nimbus-surface-2">
      <GithubMark className="h-3.5 w-3.5" />
    </span>
  );

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Account: ${session.user.name ?? "signed in"}`}
        className="flex min-w-0 items-center gap-2 rounded-lg p-0.5 pr-2 transition-colors hover:bg-nimbus-surface-2"
      >
        {avatar}
        {!compact && (
          <span data-sb-label className="truncate text-[13px] text-nimbus-text-soft">
            {session.user.name?.split(" ")[0] ?? "Account"}
          </span>
        )}
      </button>

      <PopoverPanel open={open} className="bottom-full left-0 mb-2 w-64 p-1.5">
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          {avatar}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-nimbus-text">{session.user.name ?? "Signed in"}</p>
            <p className="truncate text-[12px] text-nimbus-text-muted">{session.user.email}</p>
          </div>
        </div>
        <div className="mx-2.5 mb-1.5 flex gap-4 border-t border-nimbus-border pt-2 text-[12px] text-nimbus-text-muted">
          <span>
            <span className="text-nimbus-text">{conversations.length}</span> chats
          </span>
          <span>
            <span className="text-nimbus-text">{sent}</span> messages sent
          </span>
        </div>
        <div className="border-t border-nimbus-border pt-1">
          <Link href="/settings" onClick={() => setOpen(false)} className={MENU_ROW}>
            <Settings aria-hidden className="h-3.5 w-3.5 text-nimbus-text-muted" />
            Settings
          </Link>
          <button type="button" onClick={() => signOut()} className={MENU_ROW}>
            <LogOut aria-hidden className="h-3.5 w-3.5 text-nimbus-text-muted" />
            Sign out
          </button>
        </div>
      </PopoverPanel>
    </div>
  );
}
