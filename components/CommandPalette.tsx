"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { CornerDownLeft, MessageSquare, Search, SquareCode } from "lucide-react";
import type { Conversation } from "@/lib/types";
import { gsap, useGSAP, reducedMotion } from "@/lib/motion";
import { relativeTime } from "@/lib/dateGroups";

export type PaletteAction = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  hint?: string;
  run: () => void;
};

type Item =
  | { kind: "action"; id: string; action: PaletteAction }
  | { kind: "chat"; id: string; conversation: Conversation };

function firstUserText(c: Conversation): string {
  const msg = c.messages.find((m) => m.role === "user");
  const part = msg?.parts.find((p) => p.type === "text");
  return part && "text" in part ? part.text : "";
}

/** Ctrl/Cmd + K: jump to any chat or run an action, all from the keyboard. */
export function CommandPalette({
  open,
  onClose,
  actions,
  conversations,
  onSelectConversation,
}: {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const mounted = useRef(false);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const matchedActions = actions
      .filter((a) => !q || a.label.toLowerCase().includes(q))
      .map((a) => ({ kind: "action" as const, id: `a-${a.id}`, action: a }));
    const matchedChats = [...conversations]
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((c) => !q || c.title.toLowerCase().includes(q) || firstUserText(c).toLowerCase().includes(q))
      .slice(0, q ? 12 : 6)
      .map((c) => ({ kind: "chat" as const, id: `c-${c.id}`, conversation: c }));
    return [...matchedActions, ...matchedChats];
  }, [actions, conversations, query]);

  const safeIndex = Math.min(index, Math.max(items.length - 1, 0));

  useGSAP(
    () => {
      const overlay = overlayRef.current;
      const panel = panelRef.current;
      if (!overlay || !panel) return;
      const fast = reducedMotion();
      if (!mounted.current) {
        mounted.current = true;
        if (!open) return;
      }
      if (open) {
        gsap.to(overlay, { autoAlpha: 1, duration: fast ? 0 : 0.25, ease: "power1.out" });
        gsap.fromTo(
          panel,
          { autoAlpha: 0, y: -12, scale: 0.97 },
          { autoAlpha: 1, y: 0, scale: 1, duration: fast ? 0 : 0.45, ease: "aro" }
        );
        gsap.from(panel.querySelectorAll("[data-palette-item]"), {
          autoAlpha: 0,
          y: 4,
          duration: fast ? 0 : 0.35,
          stagger: 0.018,
          ease: "aro",
          delay: 0.05,
        });
      } else {
        gsap.to(panel, { autoAlpha: 0, y: -6, scale: 0.98, duration: fast ? 0 : 0.16, ease: "aro-in" });
        gsap.to(overlay, { autoAlpha: 0, duration: fast ? 0 : 0.2, delay: fast ? 0 : 0.04 });
      }
    },
    { dependencies: [open] }
  );

  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      returnFocus.current?.focus?.();
    }
  }, [open]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${safeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [safeIndex]);

  function run(item: Item | undefined) {
    if (!item) return;
    onClose();
    if (item.kind === "action") item.action.run();
    else onSelectConversation(item.conversation.id);
  }

  let actionHeaderShown = false;
  let chatHeaderShown = false;

  return (
    <div
      ref={overlayRef}
      style={{ visibility: "hidden", opacity: 0 }}
      onPointerDown={(e) => e.target === overlayRef.current && onClose()}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/45 px-3 pt-[12vh] backdrop-blur-[3px]"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="w-full max-w-[560px] overflow-hidden rounded-[16px] border border-nimbus-border-strong bg-nimbus-surface shadow-[var(--nimbus-shadow-lift)]"
      >
        <div className="flex items-center gap-2.5 border-b border-nimbus-border px-4">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-nimbus-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(items[safeIndex]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Search chats or type a command"
            aria-label="Search chats or commands"
            aria-controls="palette-list"
            aria-activedescendant={items[safeIndex] ? `palette-${items[safeIndex].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            className="aro-bare-focus h-13 min-w-0 flex-1 bg-transparent py-4 text-[16px] text-nimbus-text sm:text-[15px] placeholder:text-nimbus-text-faint focus:outline-none"
          />
          <kbd className="rounded-md border border-nimbus-border px-1.5 py-0.5 font-sans text-[11px] text-nimbus-text-faint">Esc</kbd>
        </div>

        <div ref={listRef} id="palette-list" role="listbox" className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-nimbus-text-muted">Nothing matches &ldquo;{query}&rdquo;.</p>
          )}
          {items.map((item, i) => {
            const selected = i === safeIndex;
            let header: string | null = null;
            if (item.kind === "action" && !actionHeaderShown) {
              actionHeaderShown = true;
              header = "Actions";
            } else if (item.kind === "chat" && !chatHeaderShown) {
              chatHeaderShown = true;
              header = query ? "Chats" : "Recent chats";
            }
            const Icon = item.kind === "action" ? item.action.icon : item.conversation.mode === "code" ? SquareCode : MessageSquare;
            return (
              <div key={item.id}>
                {header && <p className="px-3 pb-1 pt-2.5 text-[11.5px] text-nimbus-text-faint">{header}</p>}
                <button
                  type="button"
                  id={`palette-${item.id}`}
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  data-palette-item
                  onPointerMove={() => setIndex(i)}
                  onClick={() => run(item)}
                  className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] transition-colors duration-100 ${
                    selected ? "bg-nimbus-surface-2 text-nimbus-text" : "text-nimbus-text-soft"
                  }`}
                >
                  <Icon aria-hidden className={`h-4 w-4 shrink-0 ${selected ? "text-nimbus-text" : "text-nimbus-text-muted"}`} />
                  <span className="min-w-0 flex-1 truncate">
                    {item.kind === "action" ? item.action.label : item.conversation.title}
                  </span>
                  {item.kind === "chat" && (
                    <span className="shrink-0 text-[11.5px] text-nimbus-text-faint">{relativeTime(item.conversation.createdAt)}</span>
                  )}
                  {item.kind === "action" && item.action.hint && (
                    <kbd className="shrink-0 font-sans text-[11px] text-nimbus-text-faint">{item.action.hint}</kbd>
                  )}
                  <CornerDownLeft aria-hidden className={`h-3.5 w-3.5 shrink-0 text-nimbus-text-faint ${selected ? "" : "invisible"}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
