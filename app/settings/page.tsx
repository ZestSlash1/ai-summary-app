"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { ModelSwitcher } from "@/components/ModelSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { McpConnectorsList } from "@/components/McpConnectorsList";
import { DEFAULT_MODEL } from "@/lib/types";
import { loadDefaultModel, saveDefaultModel, saveConversations } from "@/lib/storage";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [defaultModel, setDefaultModel] = useState(DEFAULT_MODEL);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDefaultModel(loadDefaultModel());
  }, []);

  function handleDefaultModelChange(model: string) {
    setDefaultModel(model);
    saveDefaultModel(model);
  }

  function handleClearData() {
    if (!confirm("Delete all local conversations? This can't be undone.")) return;
    saveConversations([]);
    window.localStorage.removeItem("nimbus-active-conversation");
    setCleared(true);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-nimbus-border bg-nimbus-surface text-nimbus-text-muted shadow-[var(--nimbus-shadow)] transition-colors hover:text-nimbus-text"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 3 5 8l5 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold text-nimbus-text">Settings</h1>
      </div>

      <Section title="Account">
        {status === "loading" ? null : session?.user ? (
          <div className="flex items-center gap-3 rounded-2xl border border-nimbus-border bg-nimbus-surface p-4 shadow-[var(--nimbus-shadow)]">
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt=""
                className="h-11 w-11 rounded-full"
              />
            ) : (
              <div className="h-11 w-11 rounded-full bg-nimbus-accent-soft" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-nimbus-text">
                {session.user.name ?? "Signed in"}
              </p>
              <p className="truncate text-xs text-nimbus-text-muted">
                {session.user.email}
              </p>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="shrink-0 rounded-[var(--nimbus-radius-pill)] border border-nimbus-border px-3 py-1.5 text-xs font-medium text-nimbus-text-muted transition-colors hover:text-nimbus-text"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-nimbus-border bg-nimbus-surface p-4 shadow-[var(--nimbus-shadow)]">
            <p className="text-sm text-nimbus-text-muted">
              Sign in with GitHub to push code and connect repos.
            </p>
            <button
              type="button"
              onClick={() => signIn("github")}
              className="shrink-0 rounded-[var(--nimbus-radius-pill)] bg-nimbus-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Sign in with GitHub
            </button>
          </div>
        )}
      </Section>

      <Section title="Appearance" description="OLED-friendly dark theme, or follow your system.">
        <ThemeToggle />
      </Section>

      <Section title="Default model" description="Used for every new conversation.">
        <ModelSwitcher value={defaultModel} onChange={handleDefaultModelChange} />
      </Section>

      <Section title="MCP connectors" description="Remote tool servers available to the assistant.">
        <div className="rounded-2xl border border-nimbus-border bg-nimbus-surface p-4 shadow-[var(--nimbus-shadow)]">
          <McpConnectorsList />
        </div>
      </Section>

      <Section title="Data">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-nimbus-border bg-nimbus-surface p-4 shadow-[var(--nimbus-shadow)]">
          <p className="text-sm text-nimbus-text-muted">
            {cleared ? "All local conversations cleared." : "Delete every saved conversation from this browser."}
          </p>
          <button
            type="button"
            onClick={handleClearData}
            className="shrink-0 rounded-[var(--nimbus-radius-pill)] border border-red-500/30 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
          >
            Clear all chats
          </button>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-nimbus-text-muted">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-sm text-nimbus-text-muted">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
