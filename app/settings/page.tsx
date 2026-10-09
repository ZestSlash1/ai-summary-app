"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { ArrowLeft, Check, Trash2, X } from "lucide-react";
import { gsap, useGSAP, reducedMotion } from "@/lib/motion";
import { ModelSwitcher } from "@/components/ModelSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ModsPanel } from "@/components/ModsPanel";
import { GpuStatusPanel } from "@/components/GpuStatus";
import { McpConnectorsList } from "@/components/McpConnectorsList";
import { BrandTile, GithubMark } from "@/components/BrandMark";
import { useToast } from "@/components/Toaster";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/components/ui/classes";
import { saveDefaultModelRef, saveConversations, saveOpenTabs } from "@/lib/storage";
import { resolveNewChatModel } from "@/lib/models";
import { BUILTIN_SKILLS, type Skill } from "@/lib/skills";

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "appearance", label: "Appearance" },
  { id: "mods", label: "Mods" },
  { id: "models", label: "Models" },
  { id: "home-pc", label: "Home PC" },
  { id: "connectors", label: "Connectors" },
  { id: "skills", label: "Skills" },
  { id: "data", label: "Data" },
];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const toast = useToast();
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [approvedSkills, setApprovedSkills] = useState<Skill[]>([]);
  const [proposedSkills, setProposedSkills] = useState<Skill[]>([]);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const containerRef = useRef<HTMLDivElement>(null);

  // The model new chats start with: the saved choice, or the same free pick a new chat would get.
  useEffect(() => {
    let cancelled = false;
    void resolveNewChatModel().then((ref) => !cancelled && setDefaultModel(ref));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/skills")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setApprovedSkills(data.approved ?? []);
        setProposedSkills(data.proposed ?? []);
      })
      .catch(() => {});
  }, [session?.user]);

  // Scroll spy: the nav follows whichever section is in the reading zone.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  useGSAP(
    () => {
      if (reducedMotion()) return;
      gsap.from("[data-settings-section]", { autoAlpha: 0, y: 14, duration: 0.6, stagger: 0.05, ease: "aro" });
      gsap.from("[data-settings-nav] > *", { autoAlpha: 0, x: -6, duration: 0.45, stagger: 0.03, ease: "aro" });
    },
    { scope: containerRef }
  );

  async function reviewSkill(id: string, next: "approved" | "rejected") {
    const skill = proposedSkills.find((s) => s.id === id);
    setProposedSkills((prev) => prev.filter((s) => s.id !== id));
    if (next === "approved" && skill) setApprovedSkills((prev) => [...prev, skill]);
    await fetch("/api/skills", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
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

  function handleDefaultModelChange(model: string) {
    setDefaultModel(model);
    saveDefaultModelRef(model);
  }

  function handleClearData() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    saveConversations([]);
    saveOpenTabs([]);
    window.localStorage.removeItem("nimbus-active-conversation");
    setConfirmClear(false);
    toast({ tone: "info", title: "Local chats cleared", description: "Chats saved to your account are not affected." });
  }

  return (
    <div ref={containerRef} className="min-h-dvh w-full bg-nimbus-chrome">
      <header className="nimbus-glass sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-nimbus-border bg-nimbus-chrome/80 px-4 md:px-8">
        <Link
          href="/"
          aria-label="Back to chats"
          className="group/back flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-nimbus-text-muted transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text"
        >
          <ArrowLeft aria-hidden className="h-4 w-4 transition-transform duration-300 group-hover/back:-translate-x-0.5" />
          Chats
        </Link>
        <span aria-hidden className="h-4 w-px bg-nimbus-border" />
        <BrandTile className="h-6 w-6" />
        <h1 className="text-[15px] font-medium text-nimbus-text">Settings</h1>
      </header>

      <div className="mx-auto flex w-full max-w-5xl gap-12 px-4 pb-24 pt-8 md:px-8 md:pt-12">
        <nav data-settings-nav aria-label="Settings sections" className="sticky top-24 hidden h-fit w-44 shrink-0 flex-col gap-0.5 md:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={activeSection === s.id ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 text-[13.5px] transition-colors duration-200 ${
                activeSection === s.id
                  ? "bg-nimbus-surface-2 text-nimbus-text"
                  : "text-nimbus-text-muted hover:bg-nimbus-surface hover:text-nimbus-text"
              }`}
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 max-w-2xl flex-1 flex-col gap-12">
          <Section id="account" title="Account" description="Sign in with GitHub to connect repos, push code, and sync chats.">
            <Card>
              {status === "loading" ? (
                <div className="h-11 animate-pulse rounded-lg bg-nimbus-surface-2" />
              ) : session?.user ? (
                <div className="flex items-center gap-3">
                  {session.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.user.image} alt="" className="h-10 w-10 rounded-full border border-nimbus-border" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-nimbus-surface-2">
                      <GithubMark className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-nimbus-text">{session.user.name ?? "Signed in"}</p>
                    <p className="truncate text-[12.5px] text-nimbus-text-muted">{session.user.email}</p>
                  </div>
                  <button type="button" onClick={() => signOut()} className={BUTTON_SECONDARY}>
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[13.5px] text-nimbus-text-muted">You are not signed in. Chats stay in this browser.</p>
                  <button type="button" onClick={() => signIn("github")} className={BUTTON_PRIMARY}>
                    <GithubMark className="h-4 w-4" />
                    Sign in with GitHub
                  </button>
                </div>
              )}
            </Card>
          </Section>

          <Section id="appearance" title="Appearance" description="Dark is the default. System follows your device.">
            <ThemeToggle />
          </Section>

          <Section id="mods" title="Mods" description="Visual touches for the chat: lighting, motion, reading, and color. Saved on this device.">
            <Card>
              <ModsPanel />
            </Card>
          </Section>

          <Section
            id="models"
            title="Models"
            description="Each chat keeps its own model, picked from the composer. This one starts every new chat."
          >
            <Card className="flex flex-col gap-5">
              <Field label="Default model for new chats">
                {defaultModel ? (
                  <ModelSwitcher
                    value={defaultModel}
                    onChange={handleDefaultModelChange}
                    placement="down"
                    variant="field"
                  />
                ) : (
                  <div className="h-10 w-56 animate-pulse rounded-lg bg-nimbus-surface-2" />
                )}
              </Field>
            </Card>
          </Section>

          <Section id="home-pc" title="Home PC" description="Bonsai and image editing run on the owner's PC through a private tunnel.">
            <GpuStatusPanel />
          </Section>

          <Section id="connectors" title="MCP connectors" description="Tool servers the model can call, saved in this browser. Each one you turn on is contacted with every message.">
            <Card>
              <McpConnectorsList />
            </Card>
          </Section>

          <Section id="skills" title="Skills" description="ARO proposes a skill when it notices you asking for the same thing more than once.">
            <Card className="flex flex-col gap-2">
              {BUILTIN_SKILLS.map((skill) => (
                <SkillRow key={skill.id} name={skill.name} description={skill.description} tag="Built in" />
              ))}
              {approvedSkills.map((skill) => (
                <SkillRow
                  key={skill.id}
                  name={skill.name}
                  description={skill.description}
                  tag="Learned"
                  actions={
                    <button
                      type="button"
                      onClick={() => deleteSkill(skill.id)}
                      aria-label={`Delete ${skill.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-nimbus-text-faint transition-colors hover:bg-nimbus-danger-soft hover:text-nimbus-danger"
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  }
                />
              ))}
              {proposedSkills.map((skill) => (
                <SkillRow
                  key={skill.id}
                  name={skill.name}
                  description={skill.description}
                  tag="Proposed"
                  dashed
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={() => reviewSkill(skill.id, "approved")}
                        aria-label={`Approve ${skill.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-nimbus-accent text-white transition-transform active:scale-95"
                      >
                        <Check aria-hidden className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewSkill(skill.id, "rejected")}
                        aria-label={`Reject ${skill.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-nimbus-text-muted transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text"
                      >
                        <X aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    </>
                  }
                />
              ))}
              {!session?.user && (
                <p className="px-1 pt-1 text-[12.5px] text-nimbus-text-muted">Sign in to see skills learned from your chats.</p>
              )}
            </Card>
          </Section>

          <Section id="data" title="Data" description="Chats in this browser. Chats saved to your account are kept.">
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13.5px] text-nimbus-text-muted">Delete every chat stored in this browser.</p>
              <div className="flex items-center gap-2">
                {confirmClear && (
                  <button type="button" onClick={() => setConfirmClear(false)} className={BUTTON_SECONDARY}>
                    Keep them
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClearData}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-nimbus-danger/30 px-3.5 text-[13px] font-medium text-nimbus-danger transition-[background-color,transform] duration-200 hover:bg-nimbus-danger-soft active:scale-[0.97]"
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  {confirmClear ? "Delete for good" : "Clear local chats"}
                </button>
              </div>
            </Card>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} data-settings-section className="scroll-mt-24">
      <h2 className="text-[16px] font-medium tracking-[-0.01em] text-nimbus-text">{title}</h2>
      {description && <p className="mt-1 text-[13.5px] leading-relaxed text-nimbus-text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[14px] border border-nimbus-border bg-nimbus-panel p-4 shadow-[var(--nimbus-inset-highlight)] ${className}`}
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-nimbus-text-muted">{label}</p>
      {children}
    </div>
  );
}

function SkillRow({
  name,
  description,
  tag,
  actions,
  dashed = false,
}: {
  name: string;
  description: string;
  tag: string;
  actions?: ReactNode;
  dashed?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 ${
        dashed ? "border-dashed border-nimbus-accent/35" : "border-nimbus-border"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13.5px] text-nimbus-text">
          <span className="truncate">{name}</span>
          <span className="shrink-0 rounded-[5px] bg-nimbus-surface-2 px-1.5 py-px text-[11px] text-nimbus-text-muted">{tag}</span>
        </p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-nimbus-text-muted">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
