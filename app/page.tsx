"use client";

import { useEffect, useState } from "react";
import type { UIMessage } from "ai";
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

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // One-time hydration from localStorage: must run after mount since
    // localStorage isn't available during server rendering.
    /* eslint-disable react-hooks/set-state-in-effect */
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
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const active = conversations?.find((c) => c.id === activeId);

  function persist(next: Conversation[]) {
    setConversations(next);
    saveConversations(next);
  }

  function handleNewChat() {
    if (!conversations) return;
    const fresh = createConversation();
    persist([...conversations, fresh]);
    setActiveId(fresh.id);
    saveActiveId(fresh.id);
    setSidebarOpen(false);
  }

  function handleSelect(id: string) {
    setActiveId(id);
    saveActiveId(id);
    setSidebarOpen(false);
  }

  function handleModelChange(model: string) {
    if (!conversations || !activeId) return;
    persist(
      conversations.map((c) => (c.id === activeId ? { ...c, model } : c))
    );
  }

  function handleRepoChange(repo: GithubRepoLink | undefined) {
    if (!conversations || !activeId) return;
    persist(
      conversations.map((c) =>
        c.id === activeId ? { ...c, githubRepo: repo } : c
      )
    );
  }

  function handleMessagesUpdate(messages: UIMessage[]) {
    if (!conversations || !activeId) return;
    const textPart = messages
      .find((m) => m.role === "user")
      ?.parts.find((p) => p.type === "text" && p.text.trim());
    const firstUserText =
      textPart && "text" in textPart ? textPart.text : undefined;

    persist(
      conversations.map((c) =>
        c.id === activeId
          ? {
              ...c,
              messages,
              title:
                c.title === "New chat" && firstUserText
                  ? titleFromMessage(firstUserText)
                  : c.title,
            }
          : c
      )
    );
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
