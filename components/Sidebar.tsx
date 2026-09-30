"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Cpu,
  Ellipsis,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plug,
  Search,
  Settings,
  Sparkles,
  SquareCode,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import type { Conversation } from "@/lib/types";
import { gsap, useGSAP, Flip, iconWiggle, reducedMotion } from "@/lib/motion";
import { useIsDesktop, useModKey } from "@/lib/useMediaQuery";
import { useHomeGpu, bonsaiState, type GpuState } from "@/lib/useHomeGpu";
import { AccountMenu } from "./AccountMenu";
import { BrandTile } from "./BrandMark";
import { ThemeToggleIcon } from "./ThemeToggleIcon";
import { PopoverPanel } from "./Popover";
import { MENU_ROW } from "./ui/classes";

const EXPANDED_W = 248;
const COLLAPSED_W = 60;

const GPU_DOT: Record<GpuState, string> = {
  online: "bg-nimbus-free text-nimbus-free",
  busy: "bg-nimbus-warn text-nimbus-warn",
  sleeping: "bg-nimbus-text-faint text-nimbus-text-faint",
  offline: "bg-nimbus-danger text-nimbus-danger",
};
const GPU_LABEL: Record<GpuState, string> = {
  online: "online",
  busy: "busy",
  sleeping: "asleep",
  offline: "offline",
};

export function Sidebar({
  conversations,
  activeId,
  activeIsEmpty,
  streamingIds,
  onSelect,
  onNewChat,
  onNewCodeChat,
  onRename,
  onDelete,
  onOpenPalette,
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
}: {
  conversations: Conversation[];
  activeId: string;
  activeIsEmpty: boolean;
  streamingIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onNewChat: (mode?: "chat" | "code") => void;
  onNewCodeChat?: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenPalette: () => void;
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const asideRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const modKey = useModKey();
  const placed = useRef(false);
  const narrow = isDesktop && collapsed;
  const activeConversation = conversations.find((c) => c.id === activeId);
  const isCodeMode = activeConversation?.mode === "code";

  const [historyOpen, setHistoryOpen] = useState(true);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const { allowed: gpuAllowed, status: gpuStatus } = useHomeGpu({ pollMs: 30_000 });
  const footerRef = useRef<HTMLDivElement>(null);
  const footerFlip = useRef<ReturnType<typeof Flip.getState> | null>(null);

  // Record where the footer buttons are before the rail changes width, so they can glide
  // from a row into a column instead of jumping.
  function toggleCollapsed() {
    const items = footerRef.current?.querySelectorAll("[data-footer-item]");
    if (items?.length) footerFlip.current = Flip.getState(items);
    onToggleCollapsed();
  }
  const toggleRef = useRef(toggleCollapsed);
  useEffect(() => {
    toggleRef.current = toggleCollapsed;
  });

  // Ctrl/Cmd + B toggles the rail from anywhere, like most editors.
  useEffect(() => {
    if (!isDesktop) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isDesktop]);
  const gpu = gpuStatus ? bonsaiState(gpuStatus) : null;

  // Desktop: the rail glides between wide and narrow while labels fade out of the way.
  // Mobile: the same element is a drawer that slides over the page.
  useGSAP(
    () => {
      const aside = asideRef.current;
      const backdrop = backdropRef.current;
      if (!aside || !backdrop) return;
      const labels = aside.querySelectorAll("[data-sb-label]");
      const instant = !placed.current || reducedMotion();
      // Flip to "placed" only after a frame: React's dev double-run reverts the first pass,
      // and the second pass must also place the rail instantly rather than animate.
      if (!placed.current) requestAnimationFrame(() => (placed.current = true));
      gsap.killTweensOf([aside, backdrop, labels]);

      if (footerFlip.current) {
        Flip.from(footerFlip.current, { duration: instant ? 0 : 0.55, ease: "aro", absolute: false });
        footerFlip.current = null;
      }

      if (isDesktop) {
        gsap.set(aside, { x: 0 });
        gsap.set(backdrop, { autoAlpha: 0 });
        if (collapsed) {
          gsap
            .timeline()
            .to(labels, { autoAlpha: 0, duration: instant ? 0 : 0.12, ease: "aro-in" })
            .to(aside, { width: COLLAPSED_W, duration: instant ? 0 : 0.55, ease: "aro" }, instant ? 0 : 0.04);
        } else {
          gsap
            .timeline()
            .to(aside, { width: EXPANDED_W, duration: instant ? 0 : 0.55, ease: "aro" })
            .to(labels, { autoAlpha: 1, duration: instant ? 0 : 0.3, stagger: instant ? 0 : 0.008 }, instant ? 0 : 0.22);
        }
      } else {
        gsap.set(aside, { width: 280 });
        gsap.set(labels, { autoAlpha: 1 });
        gsap.to(aside, { x: open ? 0 : "-105%", duration: instant ? 0 : 0.5, ease: "aro" });
        gsap.to(backdrop, { autoAlpha: open ? 1 : 0, duration: instant ? 0 : 0.35 });
      }
    },
    { dependencies: [collapsed, open, isDesktop] }
  );

  useEffect(() => {
    if (!searching) return;
    searchRef.current?.focus();
  }, [searching]);

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => b.createdAt - a.createdAt),
    [conversations]
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withContent = sorted.filter((c) => c.messages.length > 0 || c.id === activeId);
    return q ? withContent.filter((c) => c.title.toLowerCase().includes(q)) : withContent;
  }, [sorted, query, activeId]);

  // New chats slide into the history list; the first render just appears.
  const listRef = useRef<HTMLUListElement>(null);
  const knownIds = useRef<Set<string> | null>(null);
  useGSAP(
    () => {
      const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-chat-row]") ?? []);
      if (knownIds.current === null) {
        const ids = new Set(rows.map((r) => r.dataset.chatRow!));
        requestAnimationFrame(() => (knownIds.current ??= ids));
        if (!reducedMotion()) gsap.from(rows.slice(0, 14), { autoAlpha: 0, x: -6, duration: 0.45, stagger: 0.025, ease: "aro", delay: 0.1 });
        return;
      }
      for (const row of rows) {
        const id = row.dataset.chatRow!;
        if (knownIds.current.has(id)) continue;
        knownIds.current.add(id);
        if (!reducedMotion()) gsap.from(row, { autoAlpha: 0, x: -8, duration: 0.5, ease: "aro" });
      }
    },
    { dependencies: [visible.map((c) => c.id).join(",")], scope: listRef }
  );

  function closeSearch() {
    setSearching(false);
    setQuery("");
  }

  function toggleSearch() {
    if (searching) return closeSearch();
    setSearching(true);
    setHistoryOpen(true);
  }

  return (
    <>
      {/* Mobile backdrop: tapping outside closes the drawer. */}
      <div
        ref={backdropRef}
        onClick={onClose}
        aria-hidden="true"
        style={{ visibility: "hidden", opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] md:hidden"
      />
      <aside
        ref={asideRef}
        aria-label="Sidebar"
        style={{ width: EXPANDED_W }}
        className="fixed inset-y-0 left-0 z-50 flex h-full shrink-0 flex-col overflow-hidden bg-nimbus-chrome max-md:border-r max-md:border-nimbus-border max-md:shadow-[var(--nimbus-shadow-lift)] md:relative md:z-auto"
      >
        {/* Brand and collapse */}
        <div className="flex h-12 shrink-0 items-center gap-2 px-3">
          <button
            type="button"
            onClick={narrow ? toggleCollapsed : undefined}
            tabIndex={narrow ? 0 : -1}
            aria-label={narrow ? "Expand sidebar" : undefined}
            className={`group/brand relative flex shrink-0 items-center gap-2 rounded-lg ${narrow ? "cursor-pointer" : "cursor-default"}`}
          >
            <span className={`transition-opacity duration-200 ${narrow ? "group-hover/brand:opacity-0" : ""}`}>
              <BrandTile className="h-[26px] w-[26px]" />
            </span>
            {narrow && (
              <PanelLeftOpen
                aria-hidden
                className="absolute left-[5px] h-4 w-4 text-nimbus-text opacity-0 transition-opacity duration-200 group-hover/brand:opacity-100"
              />
            )}
            <span data-sb-label className="text-[15px] font-medium tracking-[-0.01em] text-nimbus-text">
              aro
            </span>
          </button>
          <div className="flex-1" />
          <button
            type="button"
            data-sb-label
            onClick={isDesktop ? toggleCollapsed : onClose}
            aria-label={isDesktop ? "Collapse sidebar" : "Close menu"}
            title={isDesktop ? `Collapse sidebar (${modKey} B)` : "Close menu"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-nimbus-text-muted transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text"
          >
            {isDesktop ? <PanelLeftClose aria-hidden className="h-4 w-4" /> : <X aria-hidden className="h-4 w-4" />}
          </button>
        </div>

        {/* Primary navigation */}
        <nav className="flex shrink-0 flex-col gap-0.5 px-2.5 pt-1" aria-label="Main">
          <NavItem icon={SquarePen} label="New chat" active={activeIsEmpty && !isCodeMode} onClick={() => onNewChat("chat")} narrow={narrow} wiggle="tilt" />
          <NavItem icon={SquareCode} label="Code" active={activeIsEmpty && isCodeMode} onClick={onNewCodeChat ?? (() => onNewChat("code"))} narrow={narrow} wiggle="tilt" />
          <NavItem
            icon={Search}
            label="Search"
            onClick={onOpenPalette}
            narrow={narrow}
            wiggle="pop"
            hint={`${modKey} K`}
          />
          <NavItem icon={Plug} label="Connectors" href="/settings#connectors" narrow={narrow} wiggle="tilt" />
          <NavItem icon={Sparkles} label="Skills" href="/settings#skills" narrow={narrow} wiggle="pop" />
          {gpuAllowed && (
            <NavItem
              icon={Cpu}
              label="Home PC"
              href="/settings#home-pc"
              narrow={narrow}
              wiggle="pop"
              title={gpu ? `Bonsai is ${GPU_LABEL[gpu]}` : "Home PC"}
              trailing={
                gpu && (
                  <span
                    aria-label={`Bonsai ${GPU_LABEL[gpu]}`}
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${GPU_DOT[gpu]} ${gpu === "busy" ? "aro-live-dot" : ""} ${
                      narrow ? "absolute right-2 top-2" : "ml-auto"
                    }`}
                  />
                )
              }
            />
          )}
        </nav>

        {/* History */}
        <div data-sb-label className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="flex h-8 shrink-0 items-center gap-1 px-4 pr-2.5">
            {searching ? (
              <div className="relative flex-1">
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                  placeholder="Filter chats"
                  aria-label="Filter chats"
                  className="aro-bare-focus h-7 w-full rounded-md border border-nimbus-border bg-nimbus-surface px-2 text-[16px] md:text-[12.5px] text-nimbus-text placeholder:text-nimbus-text-faint focus:border-nimbus-accent/60 focus:outline-none"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                aria-expanded={historyOpen}
                className="flex flex-1 items-center gap-1 text-[12px] text-nimbus-text-faint transition-colors hover:text-nimbus-text-muted"
              >
                Chat history
                <ChevronDown
                  aria-hidden
                  className={`h-3 w-3 transition-transform duration-300 ${historyOpen ? "" : "-rotate-90"}`}
                />
              </button>
            )}
            <button
              type="button"
              onClick={toggleSearch}
              aria-label={searching ? "Close filter" : "Filter chats"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-nimbus-text-faint transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text"
            >
              {searching ? <X aria-hidden className="h-3.5 w-3.5" /> : <Search aria-hidden className="h-3.5 w-3.5" />}
            </button>
          </div>

          <ul
            ref={listRef}
            className={`min-h-0 flex-1 overflow-y-auto px-2.5 pb-2 pt-1 ${historyOpen ? "" : "hidden"}`}
          >
            {visible.length === 0 && (
              <li className="px-2 py-2 text-[12.5px] text-nimbus-text-faint">
                {query ? "No chats match." : "Your chats will show up here."}
              </li>
            )}
            {visible.map((c) => (
              <HistoryRow
                key={c.id}
                conversation={c}
                active={c.id === activeId}
                streaming={streamingIds.has(c.id)}
                onSelect={() => onSelect(c.id)}
                onRename={(title) => onRename(c.id, title)}
                onDelete={() => onDelete(c.id)}
              />
            ))}
          </ul>
        </div>

        {/* Account and settings */}
        <div
          ref={footerRef}
          className={`flex shrink-0 gap-1 border-t border-nimbus-border px-2.5 py-2.5 ${
            narrow ? "flex-col items-center" : "items-center"
          }`}
        >
          <div data-footer-item className={narrow ? "" : "min-w-0 flex-1"}>
            <AccountMenu conversations={conversations} compact={narrow} />
          </div>
          <div data-footer-item>
            <ThemeToggleIcon />
          </div>
          <Link
            data-footer-item
            href="/settings"
            aria-label="Settings"
            title="Settings"
            data-wiggle="spin"
            onPointerEnter={iconWiggle}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-nimbus-text-muted transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text"
          >
            <Settings aria-hidden className="h-4 w-4" />
          </Link>
        </div>
      </aside>
    </>
  );
}

function NavItem({
  icon: Icon,
  label,
  onClick,
  href,
  active = false,
  narrow,
  hint,
  wiggle,
  trailing,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  narrow: boolean;
  hint?: string;
  wiggle?: string;
  trailing?: ReactNode;
  title?: string;
}) {
  const className = `group/nav relative flex h-8 items-center gap-2.5 rounded-lg px-[9px] text-[13.5px] transition-colors duration-200 ${
    active ? "bg-nimbus-surface-2 text-nimbus-text" : "text-nimbus-text-muted hover:bg-nimbus-surface hover:text-nimbus-text"
  }`;
  const content = (
    <>
      <Icon aria-hidden className="h-4 w-4 shrink-0" />
      <span data-sb-label className="truncate">
        {label}
      </span>
      {hint && (
        <kbd data-sb-label className="ml-auto font-sans text-[11px] text-nimbus-text-faint">
          {hint}
        </kbd>
      )}
      {trailing}
    </>
  );
  const common = {
    className,
    "data-wiggle": wiggle,
    onPointerEnter: iconWiggle,
    title: narrow ? (title ?? label) : title,
    "aria-label": narrow ? label : undefined,
  };
  return href ? (
    <Link href={href} {...common}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} {...common} aria-current={active ? "page" : undefined}>
      {content}
    </button>
  );
}

function HistoryRow({
  conversation,
  active,
  streaming,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  streaming: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function closeMenu() {
    setMenuOpen(false);
    setConfirming(false);
  }

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  function commitRename() {
    const title = draft.trim();
    if (title && title !== conversation.title) onRename(title);
    setRenaming(false);
  }

  return (
    <li data-chat-row={conversation.id} className="group/row relative">
      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setDraft(conversation.title);
              setRenaming(false);
            }
          }}
          aria-label="Chat title"
          className="aro-bare-focus h-8 w-full rounded-lg border border-nimbus-accent/60 bg-nimbus-surface px-2 text-[16px] text-nimbus-text focus:outline-none md:text-[13px]"
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={() => {
            setDraft(conversation.title);
            setRenaming(true);
          }}
          aria-current={active ? "page" : undefined}
          className={`flex h-8 w-full items-center gap-2 rounded-lg pl-2 pr-8 text-left text-[13px] transition-colors duration-200 ${
            active
              ? "bg-nimbus-surface-2 text-nimbus-text"
              : "text-nimbus-text-muted hover:bg-nimbus-surface hover:text-nimbus-text"
          }`}
        >
          {conversation.mode === "code" && (
            <SquareCode aria-label="Code session" className="h-3.5 w-3.5 shrink-0 text-nimbus-accent" />
          )}
          {streaming && (
            <span aria-label="Replying" className="aro-live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-nimbus-accent text-nimbus-accent" />
          )}
          <span className="truncate">{conversation.title}</span>
        </button>
      )}
      {!renaming && (
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
          aria-label={`More for ${conversation.title}`}
          aria-expanded={menuOpen}
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md text-nimbus-text-muted opacity-0 transition-[opacity,background-color] hover:bg-nimbus-surface-3 hover:text-nimbus-text focus-visible:opacity-100 group-hover/row:opacity-100 aria-expanded:opacity-100 max-md:opacity-100"
        >
          <Ellipsis aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}
      <PopoverPanel
        open={menuOpen}
        onClose={closeMenu}
        anchorRef={menuButtonRef}
        placement="bottom-end"
        width={184}
        label={`Actions for ${conversation.title}`}
        className="p-1"
      >
          <button
            type="button"
            onClick={() => {
              closeMenu();
              setDraft(conversation.title);
              setRenaming(true);
            }}
            className={MENU_ROW}
          >
            <Pencil aria-hidden className="h-3.5 w-3.5 text-nimbus-text-muted" />
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirming) return setConfirming(true);
              closeMenu();
              onDelete();
            }}
            className={`${MENU_ROW} ${confirming ? "bg-nimbus-danger-soft text-nimbus-danger hover:bg-nimbus-danger-soft" : "text-nimbus-danger"}`}
          >
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
            {confirming ? "Tap again to delete" : "Delete"}
          </button>
      </PopoverPanel>
    </li>
  );
}
