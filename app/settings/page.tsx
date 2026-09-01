"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ModelSwitcher } from "@/components/ModelSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { McpConnectorsList } from "@/components/McpConnectorsList";
import { DEFAULT_MODEL } from "@/lib/types";
import { loadDefaultModel, saveDefaultModel, saveConversations } from "@/lib/storage";
import type { Skill } from "@/lib/skills";

gsap.registerPlugin(useGSAP);

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [defaultModel, setDefaultModel] = useState(DEFAULT_MODEL);
  const [cleared, setCleared] = useState(false);
  const [approvedSkills, setApprovedSkills] = useState<Skill[]>([]);
  const [proposedSkills, setProposedSkills] = useState<Skill[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDefaultModel(loadDefaultModel());
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/skills")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setApprovedSkills(data.approved ?? []);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProposedSkills(data.proposed ?? []);
      })
      .catch(() => {});
  }, [session?.user]);

  async function reviewSkill(id: string, status: "approved" | "rejected") {
    const skill = proposedSkills.find((s) => s.id === id);
    setProposedSkills((prev) => prev.filter((s) => s.id !== id));
    if (status === "approved" && skill) {
      setApprovedSkills((prev) => [...prev, skill]);
    }
    await fetch("/api/skills", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  }

  async function deleteSkill(id: string) {
    setApprovedSkills((prev) => prev.filter((s) => s.id !== id));
    await fetch("/api/skills", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  useGSAP(
    () => {
      const sections = containerRef.current?.querySelectorAll("section");
      if (!sections?.length) return;
      gsap.fromTo(
        sections,
        { opacity: 0, y: 16, filter: "blur(3px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.06,
        }
      );
    },
    { scope: containerRef }
  );

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
    <div
      ref={containerRef}
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-10"
    >
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-nimbus-border bg-nimbus-surface text-nimbus-text-muted shadow-[var(--nimbus-shadow)] transition-[transform,color] duration-300 ease-[var(--nimbus-ease)] hover:-translate-x-0.5 hover:text-nimbus-text active:scale-90"
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
          <Card className="flex items-center gap-3">
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="" className="h-11 w-11 rounded-full" />
            ) : (
              <div className="h-11 w-11 rounded-full bg-nimbus-accent-soft" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-nimbus-text">
                {session.user.name ?? "Signed in"}
              </p>
              <p className="truncate text-xs text-nimbus-text-muted">{session.user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="shrink-0 rounded-[var(--nimbus-radius-pill)] border border-nimbus-border px-3 py-1.5 text-xs font-medium text-nimbus-text-muted transition-[color,transform] duration-300 ease-[var(--nimbus-ease)] hover:text-nimbus-text active:scale-95"
            >
              Sign out
            </button>
          </Card>
        ) : (
          <Card className="flex items-center justify-between gap-3">
            <p className="text-sm text-nimbus-text-muted">
              Sign in with GitHub to push code and connect repos.
            </p>
            <button
              type="button"
              onClick={() => signIn("github")}
              className="shrink-0 rounded-[var(--nimbus-radius-pill)] bg-nimbus-accent px-4 py-2 text-sm font-medium text-white shadow-[var(--nimbus-glow)] transition-[opacity,transform] duration-300 ease-[var(--nimbus-ease)] hover:opacity-90 active:scale-95"
            >
              Sign in with GitHub
            </button>
          </Card>
        )}
      </Section>

      <Section title="Appearance" description="OLED-friendly dark theme, or follow your system.">
        <ThemeToggle />
      </Section>

      <Section title="Default model" description="Used for every new conversation.">
        <ModelSwitcher value={defaultModel} onChange={handleDefaultModelChange} />
      </Section>

      <Section title="MCP connectors" description="Remote tool servers available to the assistant.">
        <Card>
          <McpConnectorsList />
        </Card>
      </Section>

      {session?.user && (approvedSkills.length > 0 || proposedSkills.length > 0) && (
        <Section
          title="Learned skills"
          description="Proposed automatically when a pattern shows up in what you ask for."
        >
          <Card className="flex flex-col gap-2">
            {proposedSkills.length === 0 && approvedSkills.length === 0 && (
              <p className="text-sm text-nimbus-text-muted">None yet.</p>
            )}
            {proposedSkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-nimbus-accent/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-nimbus-text">
                    {skill.name}{" "}
                    <span className="text-xs text-nimbus-text-muted">(proposed)</span>
                  </p>
                  <p className="truncate text-xs text-nimbus-text-muted">
                    {skill.description}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => reviewSkill(skill.id, "approved")}
                    className="rounded-lg bg-nimbus-accent px-2.5 py-1 text-xs font-medium text-white"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewSkill(skill.id, "rejected")}
                    className="rounded-lg border border-nimbus-border px-2.5 py-1 text-xs text-nimbus-text-muted"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {approvedSkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-nimbus-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-nimbus-text">{skill.name}</p>
                  <p className="truncate text-xs text-nimbus-text-muted">
                    {skill.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteSkill(skill.id)}
                  className="shrink-0 text-xs text-nimbus-text-muted transition-colors duration-300 ease-[var(--nimbus-ease)] hover:text-nimbus-text"
                >
                  Delete
                </button>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Data">
        <Card className="flex items-center justify-between gap-3">
          <p className="text-sm text-nimbus-text-muted">
            {cleared
              ? "All local conversations cleared."
              : "Delete every saved conversation from this browser."}
          </p>
          <button
            type="button"
            onClick={handleClearData}
            className="shrink-0 rounded-[var(--nimbus-radius-pill)] border border-red-500/30 px-4 py-2 text-sm font-medium text-red-500 transition-[background-color,transform] duration-300 ease-[var(--nimbus-ease)] hover:bg-red-500/10 active:scale-95"
          >
            Clear all chats
          </button>
        </Card>
      </Section>
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="nimbus-shell shadow-[var(--nimbus-shadow)]">
      <div className={`nimbus-shell-inner border border-nimbus-border bg-nimbus-surface p-4 ${className}`}>
        {children}
      </div>
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
