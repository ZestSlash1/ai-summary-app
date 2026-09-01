"use client";

import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import type { Conversation, GithubRepoLink } from "@/lib/types";
import { DEFAULT_MODEL } from "@/lib/types";
import {
  createConversation,
  loadActiveId,
  loadConversations,
  saveActiveId,
  saveConversations,
  titleFromMessage,
} from "@/lib/storage";
import {
  createConversationRemote,
  fetchConversations,
  patchConversationRemote,
} from "@/lib/db";

export default function Home() {
  const { data: session, status: sessionStatus } = useSession();
  const isRemote = !!session?.user;

  const [conversations, setConversations] = useState<Conversation[] | null>(
    null
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hydratedForRef = useRef<"anon" | "remote" | null>(null);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    const mode = isRemote ? "remote" : "anon";
    if (hydratedForRef.current === mode) return;
    hydratedForRef.current = mode;

    /* eslint-disable react-hooks/set-state-in-effect */
    if (!isRemote) {
      // One-time hydration from localStorage: must run after mount since
      // localStorage isn't available during server rendering.
      const stored = loadConversations();
      if (stored.length > 0) {
        setConversations(stored);
        const storedActive = loadActiveId();
        setActiveId(
          storedActive && stored.some((c) => c.id === storedActive)
            ? storedActive
            : stored[0].id
        );
      } else {
        const fresh = createConversation();
        setConversations([fresh]);
        setActiveId(fresh.id);
      }
      return;
    }

    (async () => {
      let remote = await fetchConversations();

      // One-time migration: a signed-in user with local-only history from
      // before they signed in gets it pushed up, then localStorage is
      // cleared so it isn't offered again on a later sign-out.
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
          remote = await fetchConversations();
          saveConversations([]);
        }
      }

      if (remote.length === 0) {
        const created = await createConversationRemote(DEFAULT_MODEL);
        if (created) remote = [created];
      }

      setConversations(remote);
      setActiveId(remote[0]?.id ?? null);
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [sessionStatus, isRemote]);

  const active = conversations?.find((c) => c.id === activeId);

  function persist(next: Conversation[]) {
    setConversations(next);
    if (!isRemote) saveConversations(next);
  }

  function handleNewChat() {
    if (!conversations) return;
    setSidebarOpen(false);
    if (isRemote) {
      createConversationRemote(DEFAULT_MODEL).then((created) => {
        if (!created) return;
        persist([...conversations, created]);
        setActiveId(created.id);
      });
      return;
    }
    const fresh = createConversation();
    persist([...conversations, fresh]);
    setActiveId(fresh.id);
    saveActiveId(fresh.id);
  }

  function handleSelect(id: string) {
    setActiveId(id);
    if (!isRemote) saveActiveId(id);
    setSidebarOpen(false);
  }

  function handleModelChange(model: string) {
    if (!conversations || !activeId) return;
    persist(
      conversations.map((c) => (c.id === activeId ? { ...c, model } : c))
    );
    if (isRemote) patchConversationRemote(activeId, { model });
  }

  function handleRepoChange(repo: GithubRepoLink | undefined) {
    if (!conversations || !activeId) return;
    persist(
      conversations.map((c) =>
        c.id === activeId ? { ...c, githubRepo: repo } : c
      )
    );
    if (isRemote) patchConversationRemote(activeId, { githubRepo: repo });
  }

  function handleMessagesUpdate(messages: UIMessage[]) {
    if (!conversations || !activeId) return;
    const current = conversations.find((c) => c.id === activeId);
    const textPart = messages
      .find((m) => m.role === "user")
      ?.parts.find((p) => p.type === "text" && p.text.trim());
    const firstUserText =
      textPart && "text" in textPart ? textPart.text : undefined;
    const title =
      current?.title === "New chat" && firstUserText
        ? titleFromMessage(firstUserText)
        : current?.title ?? "New chat";

    persist(
      conversations.map((c) =>
        c.id === activeId ? { ...c, messages, title } : c
      )
    );
    if (isRemote) patchConversationRemote(activeId, { messages, title });
  }

  if (!conversations || !active) {
    return <div className="flex flex-1 bg-nimbus-bg" />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={active.id}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
        className={`fixed left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-xl border border-nimbus-border bg-nimbus-surface text-nimbus-text shadow-[var(--nimbus-shadow)] transition-opacity duration-300 ease-[var(--nimbus-ease)] md:hidden ${
          sidebarOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 4h12M2 8h12M2 12h12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <ChatPanel
        key={active.id}
        conversationId={active.id}
        initialMessages={active.messages}
        model={active.model || DEFAULT_MODEL}
        onModelChange={handleModelChange}
        onMessagesUpdate={handleMessagesUpdate}
        githubRepo={active.githubRepo}
        onRepoChange={handleRepoChange}
      />
    </div>
  );
}
