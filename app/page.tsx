"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { UIMessage } from "ai";
import { signIn, signOut, useSession } from "next-auth/react";
import { LogIn, LogOut, PanelLeft, Plug, Settings, Sparkles, SquarePen, SunMoon } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";
import { ChatPanel } from "@/components/ChatPanel";
import { CommandPalette, type PaletteAction } from "@/components/CommandPalette";
import { BrandTile } from "@/components/BrandMark";
import { useToast } from "@/components/Toaster";
import type { Conversation, GithubRepoLink } from "@/lib/types";
import { FALLBACK_MODEL } from "@/lib/types";
import {
  createConversation,
  loadActiveId,
  loadConversations,
  loadModelSource,
  loadOpenTabs,
  loadSidebarCollapsed,
  saveActiveId,
  saveConversations,
  saveOpenTabs,
  saveSidebarCollapsed,
  titleFromMessage,
} from "@/lib/storage";
import { resolveNewChatModel } from "@/lib/models";
import {
  createConversationRemote,
  deleteConversationRemote,
  fetchConversations,
  patchConversationRemote,
} from "@/lib/db";
import { loadTheme, saveTheme } from "@/lib/theme";
import { gsap, useGSAP, reducedMotion } from "@/lib/motion";
import { useModKey } from "@/lib/useMediaQuery";

// Enough tabs for real parallel work; beyond this the oldest idle tab closes.
const MAX_TABS = 8;

export default function Home() {
  const router = useRouter();
  const toast = useToast();
  const modKey = useModKey();
  const { data: session, status: sessionStatus } = useSession();
  const isRemote = !!session?.user;

  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tabIds, setTabIds] = useState<string[]>([]);
  // Panels mount on first visit and then stay mounted, so a background tab keeps streaming.
  const [mountedIds, setMountedIds] = useState<Set<string>>(() => new Set());
  const [streamingIds, setStreamingIds] = useState<Set<string>>(() => new Set());
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Starts optimistic; flips to false if Supabase turns out to be unreachable
  // (e.g. this deployment has no Supabase configured), so a signed-in user
  // degrades to local-only instead of ending up with zero conversations.
  const [remoteOk, setRemoteOk] = useState(true);
  const useRemote = isRemote && remoteOk;
  const useRemoteRef = useRef(useRemote);
  const conversationsRef = useRef(conversations);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    useRemoteRef.current = useRemote;
    conversationsRef.current = conversations;
    activeIdRef.current = activeId;
  });

  const hydratedForRef = useRef<"anon" | "remote" | null>(null);

  const showConversations = useCallback((list: Conversation[], preferredId?: string | null) => {
    const active =
      preferredId && list.some((c) => c.id === preferredId) ? preferredId : list[0]?.id ?? null;
    const known = new Set(list.map((c) => c.id));
    const tabs = loadOpenTabs().filter((id) => known.has(id));
    if (active && !tabs.includes(active)) tabs.push(active);
    setConversations(list);
    setActiveId(active);
    setTabIds(tabs.slice(-MAX_TABS));
    setMountedIds(new Set(active ? [active] : []));
  }, []);

  useEffect(() => {
    // Hydrates browser-only preferences after mount; the server never sees localStorage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(loadSidebarCollapsed());
  }, []);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    const mode = isRemote ? "remote" : "anon";
    if (hydratedForRef.current === mode) return;
    hydratedForRef.current = mode;

    async function hydrateFromLocalStorage() {
      // One-time hydration from localStorage: must run after mount since
      // localStorage isn't available during server rendering.
      const stored = loadConversations();
      if (stored.length > 0) {
        showConversations(stored, loadActiveId());
      } else {
        const model = await resolveNewChatModel(loadModelSource());
        showConversations([createConversation(model)]);
      }
    }

    if (!isRemote) {
      void hydrateFromLocalStorage();
      return;
    }

    (async () => {
      let remote = await fetchConversations();

      if (remote === null) {
        // Supabase is unreachable/unconfigured in this environment: the signed-in
        // user still gets a working app, just local-only for this session.
        setRemoteOk(false);
        await hydrateFromLocalStorage();
        return;
      }

      // One-time migration: a signed-in user with local-only history from before
      // they signed in gets it pushed up, then localStorage is cleared so it isn't
      // offered again on a later sign-out.
      if (remote.length === 0) {
        const local = loadConversations();
        if (local.length > 0) {
          for (const c of local) {
            const created = await createConversationRemote(c.model);
            if (created) {
              await patchConversationRemote(created.id, {
                title: c.title,
                messages: c.messages,
                githubRepo: c.githubRepo,
              });
            }
          }
          const refetched = await fetchConversations();
          remote = refetched ?? [];
          saveConversations([]);
        }
      }

      if (remote.length === 0) {
        const model = await resolveNewChatModel(loadModelSource());
        const created = await createConversationRemote(model);
        if (created) remote = [created];
      }

      if (remote.length === 0) {
        // Every remote write also failed: degrade rather than blank out.
        setRemoteOk(false);
        await hydrateFromLocalStorage();
        return;
      }

      showConversations(remote, loadActiveId());
    })();
  }, [sessionStatus, isRemote, showConversations]);

  useEffect(() => {
    if (tabIds.length) saveOpenTabs(tabIds);
  }, [tabIds]);

  /** Every conversation write goes through here, so concurrent tabs never overwrite each other. */
  const updateConversations = useCallback((fn: (prev: Conversation[]) => Conversation[]) => {
    setConversations((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (!useRemoteRef.current) saveConversations(next);
      return next;
    });
  }, []);

  const streamingRef = useRef(streamingIds);
  useEffect(() => {
    streamingRef.current = streamingIds;
  }, [streamingIds]);

  const open = useCallback((id: string) => {
    setActiveId(id);
    saveActiveId(id);
    setSidebarOpen(false);
    setMountedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setUnreadIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setTabIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      if (next.length <= MAX_TABS) return next;
      // Close the oldest tab that is neither the one opening nor mid-reply.
      const drop = next.find((t) => t !== id && !streamingRef.current.has(t));
      return drop ? next.filter((t) => t !== drop) : next;
    });
  }, []);

  const creatingRef = useRef(false);
  const handleNewChat = useCallback(async () => {
    const list = conversationsRef.current;
    if (!list || creatingRef.current) return;
    // Reuse an untouched chat instead of piling up empty ones.
    const empty = list.find((c) => c.messages.length === 0);
    if (empty) return open(empty.id);

    creatingRef.current = true;
    try {
      const model = await resolveNewChatModel(loadModelSource());
      let created: Conversation | null;
      if (useRemoteRef.current) {
        created = await createConversationRemote(model);
        if (!created) {
          toast({ tone: "error", title: "Could not start a chat", description: "The database did not answer. Try again." });
          return;
        }
      } else {
        created = createConversation(model);
      }
      const fresh = created;
      updateConversations((prev) => [...prev, fresh]);
      open(fresh.id);
    } finally {
      creatingRef.current = false;
    }
  }, [open, toast, updateConversations]);

  /** Moves focus off a closing or deleted tab to its neighbor, or to a fresh chat. */
  const leaveTab = useCallback(
    (id: string, remainingTabs: string[]) => {
      if (activeIdRef.current !== id) return;
      const oldIndex = tabIds.indexOf(id);
      const neighbor = remainingTabs[Math.min(Math.max(oldIndex, 0), remainingTabs.length - 1)];
      if (neighbor) open(neighbor);
      else void handleNewChat();
    },
    [tabIds, open, handleNewChat]
  );

  function unmountPanel(id: string) {
    setMountedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function closeTab(id: string) {
    const remaining = tabIds.filter((t) => t !== id);
    setTabIds(remaining);
    unmountPanel(id);
    leaveTab(id, remaining);
  }

  function deleteConversation(id: string) {
    const target = conversations?.find((c) => c.id === id);
    const remaining = tabIds.filter((t) => t !== id);
    setTabIds(remaining);
    unmountPanel(id);
    updateConversations((prev) => prev.filter((c) => c.id !== id));
    if (useRemote) void deleteConversationRemote(id);
    if (activeIdRef.current === id) {
      const neighbor = remaining[Math.min(Math.max(tabIds.indexOf(id), 0), remaining.length - 1)];
      if (neighbor) open(neighbor);
      else {
        // Nothing left open: land on an empty chat, creating one if needed.
        conversationsRef.current = (conversationsRef.current ?? []).filter((c) => c.id !== id);
        void handleNewChat();
      }
    }
    toast({ tone: "info", title: "Chat deleted", description: target?.title });
  }

  function renameConversation(id: string, title: string) {
    updateConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    if (useRemote) void patchConversationRemote(id, { title });
  }

  const handleModelChange = useCallback(
    (id: string, model: string) => {
      updateConversations((prev) => prev.map((c) => (c.id === id ? { ...c, model } : c)));
      if (useRemoteRef.current) void patchConversationRemote(id, { model });
    },
    [updateConversations]
  );

  const handleRepoChange = useCallback(
    (id: string, repo: GithubRepoLink | undefined) => {
      updateConversations((prev) => prev.map((c) => (c.id === id ? { ...c, githubRepo: repo } : c)));
      if (useRemoteRef.current) void patchConversationRemote(id, { githubRepo: repo });
    },
    [updateConversations]
  );

  const handleMessagesUpdate = useCallback(
    (id: string, messages: UIMessage[]) => {
      const current = conversationsRef.current?.find((c) => c.id === id);
      if (!current) return;
      const textPart = messages
        .find((m) => m.role === "user")
        ?.parts.find((p) => p.type === "text" && p.text.trim());
      const firstUserText = textPart && "text" in textPart ? textPart.text : undefined;
      const title =
        current.title === "New chat" && firstUserText ? titleFromMessage(firstUserText) : current.title;
      updateConversations((prev) => prev.map((c) => (c.id === id ? { ...c, messages, title } : c)));
      if (useRemoteRef.current) void patchConversationRemote(id, { messages, title });
    },
    [updateConversations]
  );

  const handleStreamingChange = useCallback((id: string, streaming: boolean) => {
    setStreamingIds((prev) => {
      if (prev.has(id) === streaming) return prev;
      const next = new Set(prev);
      if (streaming) next.add(id);
      else next.delete(id);
      return next;
    });
    // A reply that finished in a background tab earns an unread dot.
    if (!streaming && activeIdRef.current !== id && streamingRef.current.has(id)) {
      setUnreadIds((prev) => new Set(prev).add(id));
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      saveSidebarCollapsed(!c);
      return !c;
    });
  }

  // Ctrl/Cmd + K opens the command palette from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Switching tabs: the incoming panel settles in instead of snapping.
  const mainRef = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (!activeId || reducedMotion()) return;
      const panel = mainRef.current?.querySelector(`[data-panel="${activeId}"]`);
      if (panel) gsap.fromTo(panel, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: "aro" });
    },
    { dependencies: [activeId] }
  );

  const actions = useMemo<PaletteAction[]>(
    () => [
      { id: "new", label: "New chat", icon: SquarePen, run: () => void handleNewChat() },
      { id: "sidebar", label: "Toggle sidebar", icon: PanelLeft, hint: `${modKey} B`, run: toggleCollapsed },
      {
        id: "theme",
        label: "Switch theme",
        icon: SunMoon,
        run: () => {
          const order = ["dark", "light", "system"] as const;
          const next = order[(order.indexOf(loadTheme()) + 1) % order.length];
          saveTheme(next);
          toast({ tone: "info", title: `Theme: ${next === "system" ? "match system" : next}` });
        },
      },
      { id: "connectors", label: "Manage MCP connectors", icon: Plug, run: () => router.push("/settings#connectors") },
      { id: "skills", label: "Review learned skills", icon: Sparkles, run: () => router.push("/settings#skills") },
      { id: "settings", label: "Open settings", icon: Settings, run: () => router.push("/settings") },
      session?.user
        ? { id: "signout", label: "Sign out", icon: LogOut, run: () => void signOut() }
        : { id: "signin", label: "Sign in with GitHub", icon: LogIn, run: () => void signIn("github") },
    ],
    [handleNewChat, modKey, router, session?.user, toast]
  );

  const active = conversations?.find((c) => c.id === activeId);

  if (!conversations || !active) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-nimbus-chrome">
        <div className="animate-pulse">
          <BrandTile className="h-9 w-9" />
        </div>
      </div>
    );
  }

  const byId = new Map(conversations.map((c) => [c.id, c]));
  const tabs = tabIds.map((id) => byId.get(id)).filter((c): c is Conversation => Boolean(c));
  const recentWithMessages = [...conversations]
    .filter((c) => c.messages.length > 0)
    .sort((a, b) => b.createdAt - a.createdAt);
  const panels = tabs.filter((c) => mountedIds.has(c.id) || c.id === active.id);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-nimbus-chrome">
      <Sidebar
        conversations={conversations}
        activeId={active.id}
        activeIsEmpty={active.messages.length === 0}
        streamingIds={streamingIds}
        onSelect={open}
        onNewChat={() => void handleNewChat()}
        onRename={renameConversation}
        onDelete={deleteConversation}
        onOpenPalette={() => {
          setSidebarOpen(false);
          setPaletteOpen(true);
        }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TabBar
          tabs={tabs}
          activeId={active.id}
          streamingIds={streamingIds}
          unreadIds={unreadIds}
          onSelect={open}
          onClose={closeTab}
          onNew={() => void handleNewChat()}
          onOpenMenu={() => setSidebarOpen(true)}
        />
        <main
          ref={mainRef}
          className="relative mx-1.5 mb-1.5 min-h-0 flex-1 overflow-hidden rounded-[14px] border border-nimbus-border bg-nimbus-panel shadow-[var(--nimbus-inset-highlight),var(--nimbus-shadow)] md:mb-2 md:ml-0 md:mr-2"
        >
          {panels.map((c) => (
            <div
              key={c.id}
              data-panel={c.id}
              role="tabpanel"
              aria-label={c.title}
              hidden={c.id !== active.id}
              className="h-full"
            >
              <ChatPanel
                conversationId={c.id}
                active={c.id === active.id}
                initialMessages={c.messages}
                model={c.model || FALLBACK_MODEL}
                onModelChange={handleModelChange}
                onMessagesUpdate={handleMessagesUpdate}
                githubRepo={c.githubRepo}
                onRepoChange={handleRepoChange}
                lastConversation={recentWithMessages.find((r) => r.id !== c.id)}
                userName={session?.user?.name}
                signedIn={Boolean(session?.user)}
                onSelectConversation={open}
                onStreamingChange={handleStreamingChange}
              />
            </div>
          ))}
        </main>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={actions}
        conversations={conversations}
        onSelectConversation={open}
      />
    </div>
  );
}
