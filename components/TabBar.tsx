"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { Menu, MessageSquare, Plus, SquarePen, X } from "lucide-react";
import type { Conversation } from "@/lib/types";
import { gsap, useGSAP, iconWiggle, reducedMotion } from "@/lib/motion";

/**
 * Open chats as tabs above the panel. Tabs keep running in the background, so a reply
 * can finish in one while you work in another; a dot marks live and unread tabs.
 */
export function TabBar({
  tabs,
  activeId,
  streamingIds,
  unreadIds,
  onSelect,
  onClose,
  onNew,
  onOpenMenu,
}: {
  tabs: Conversation[];
  activeId: string;
  streamingIds: ReadonlySet<string>;
  unreadIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onOpenMenu: () => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const known = useRef<Set<string> | null>(null);

  // New tabs grow in from nothing; the first render just appears.
  useGSAP(
    () => {
      const els = Array.from(stripRef.current?.querySelectorAll<HTMLElement>("[data-tab]") ?? []);
      if (known.current === null) {
        known.current = new Set(els.map((el) => el.dataset.tab!));
        return;
      }
      for (const el of els) {
        const id = el.dataset.tab!;
        if (known.current.has(id)) continue;
        known.current.add(id);
        if (reducedMotion()) continue;
        gsap.from(el, { width: 0, minWidth: 0, autoAlpha: 0, duration: 0.45, ease: "aro", clearProps: "width,minWidth" });
      }
    },
    { dependencies: [tabs.map((t) => t.id).join(",")], scope: stripRef }
  );

  // Keep the active tab in view when there are more tabs than room.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-tab="${activeId}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [activeId]);

  function closeTab(id: string) {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`);
    known.current?.delete(id);
    if (!el || reducedMotion()) return onClose(id);
    gsap.to(el, {
      width: 0,
      minWidth: 0,
      paddingLeft: 0,
      paddingRight: 0,
      marginLeft: -4,
      autoAlpha: 0,
      duration: 0.28,
      ease: "aro-in",
      onComplete: () => onClose(id),
    });
  }

  function onKeyDown(e: KeyboardEvent, index: number) {
    const move = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!move) return;
    e.preventDefault();
    const next = tabs[(index + move + tabs.length) % tabs.length];
    onSelect(next.id);
    stripRef.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"] button`)?.focus();
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 px-2 md:pl-0.5 md:pr-2.5">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-nimbus-text-muted transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text md:hidden"
      >
        <Menu aria-hidden className="h-4 w-4" />
      </button>

      <div
        ref={stripRef}
        role="tablist"
        aria-label="Open chats"
        className="aro-no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {tabs.map((tab, index) => {
          const active = tab.id === activeId;
          const streaming = streamingIds.has(tab.id);
          const unread = !active && unreadIds.has(tab.id);
          const fresh = tab.messages.length === 0;
          const Icon = fresh ? SquarePen : MessageSquare;
          return (
            <div
              key={tab.id}
              data-tab={tab.id}
              className={`group/tab relative flex h-8 min-w-[112px] max-w-[210px] shrink-0 items-center overflow-hidden rounded-lg border transition-colors duration-200 ${
                active
                  ? "border-nimbus-border bg-nimbus-panel text-nimbus-text shadow-[var(--nimbus-inset-highlight)]"
                  : "border-transparent text-nimbus-text-muted hover:bg-nimbus-surface hover:text-nimbus-text"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => onSelect(tab.id)}
                onKeyDown={(e) => onKeyDown(e, index)}
                onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
                title={tab.title}
                className="flex h-full min-w-0 flex-1 items-center gap-2 pl-2.5 pr-1 text-[12.5px]"
              >
                {streaming ? (
                  <span aria-label="Replying" className="aro-live-dot mx-[4px] h-1.5 w-1.5 shrink-0 rounded-full bg-nimbus-accent text-nimbus-accent" />
                ) : (
                  <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-80" />
                )}
                <span className="truncate">{fresh ? "New chat" : tab.title}</span>
                {unread && <span aria-label="New reply" className="h-1.5 w-1.5 shrink-0 rounded-full bg-nimbus-accent" />}
              </button>
              <button
                type="button"
                onClick={() => closeTab(tab.id)}
                aria-label={`Close ${fresh ? "new chat" : tab.title}`}
                className={`mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-nimbus-text-muted transition-[opacity,background-color,color] hover:bg-nimbus-surface-3 hover:text-nimbus-text focus-visible:opacity-100 ${
                  active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100 max-md:opacity-100"
                }`}
              >
                <X aria-hidden className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNew}
        aria-label="New chat"
        title="New chat"
        data-wiggle="spin"
        onPointerEnter={iconWiggle}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-nimbus-border text-nimbus-text-muted transition-[color,background-color,transform] hover:bg-nimbus-surface-2 hover:text-nimbus-text active:scale-90"
      >
        <Plus aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
