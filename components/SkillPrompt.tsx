"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { signIn, useSession } from "next-auth/react";
import { Lightbulb, Plug, Sparkles, X } from "lucide-react";
import { gsap, useGSAP, reducedMotion } from "@/lib/motion";
import { BUILTIN_SKILLS, matchSkills, type Skill } from "@/lib/skills";
import type { GithubRepoLink } from "@/lib/types";
import { GithubMark } from "./BrandMark";

const MCP_NUDGE_KEYWORDS = [
  "search the web",
  "browse the web",
  "look up",
  "fetch this url",
  "scrape",
];

/** Contextual hints above the composer: a skill that fits, a missing connector, a proposed skill. */
export function SkillPrompt({
  latestUserText,
  githubRepo,
  hasEnabledMcp,
  onConnectRepo,
  onOpenMcp,
}: {
  latestUserText: string;
  githubRepo?: GithubRepoLink;
  hasEnabledMcp: boolean;
  onConnectRepo: () => void;
  onOpenMcp: () => void;
}) {
  const { data: session } = useSession();
  const [approved, setApproved] = useState<Skill[]>([]);
  const [proposed, setProposed] = useState<Skill[]>([]);
  // Hints the user closed stay closed for the rest of this chat.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    fetch("/api/skills")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || cancelled) return;
        setApproved(data.approved ?? []);
        setProposed(data.proposed ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.user, latestUserText]);

  async function reviewSkill(id: string, status: "approved" | "rejected") {
    setProposed((prev) => prev.filter((s) => s.id !== id));
    if (status === "approved") {
      const skill = proposed.find((s) => s.id === id);
      if (skill) setApproved((prev) => [...prev, skill]);
    }
    await fetch("/api/skills", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  }

  const dismiss = (key: string) => setDismissed((prev) => new Set(prev).add(key));

  const skills = matchSkills(latestUserText, [...BUILTIN_SKILLS, ...approved]).filter(
    (s) => !dismissed.has(s.id)
  );
  const lower = latestUserText.toLowerCase();
  const suggestsMcp =
    !hasEnabledMcp && !dismissed.has("mcp") && MCP_NUDGE_KEYWORDS.some((kw) => lower.includes(kw));
  const latestProposed = proposed[0];

  if (skills.length === 0 && !suggestsMcp && !latestProposed) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {skills.map((skill) => {
        if (!session?.user) {
          return (
            <Hint
              key={skill.id}
              icon={<GithubMark className="h-3.5 w-3.5" />}
              text={`${skill.name} needs GitHub. Sign in to turn it on.`}
              actionLabel="Sign in"
              onAction={() => signIn("github")}
              onDismiss={() => dismiss(skill.id)}
            />
          );
        }
        if (skill.id === "github-push" && !githubRepo) {
          return (
            <Hint
              key={skill.id}
              icon={<GithubMark className="h-3.5 w-3.5" />}
              text="Connect a repo to this chat so ARO can read it and push code."
              actionLabel="Connect repo"
              onAction={onConnectRepo}
              onDismiss={() => dismiss(skill.id)}
            />
          );
        }
        return (
          <Hint
            key={skill.id}
            icon={<Lightbulb aria-hidden className="h-3.5 w-3.5" />}
            text={skill.usageTip}
            onDismiss={() => dismiss(skill.id)}
          />
        );
      })}

      {suggestsMcp && (
        <Hint
          icon={<Plug aria-hidden className="h-3.5 w-3.5" />}
          text="This might need an outside tool, and no MCP connector is on yet."
          actionLabel="Add connector"
          onAction={onOpenMcp}
          onDismiss={() => dismiss("mcp")}
        />
      )}

      {latestProposed && (
        <Hint
          icon={<Sparkles aria-hidden className="h-3.5 w-3.5" />}
          text={
            <>
              You ask for this often. Save it as a skill? <span className="text-nimbus-text">{latestProposed.name}</span>:{" "}
              {latestProposed.description}
            </>
          }
          actionLabel="Save skill"
          onAction={() => reviewSkill(latestProposed.id, "approved")}
          onDismiss={() => reviewSkill(latestProposed.id, "rejected")}
          dismissLabel="Not useful"
        />
      )}
    </div>
  );
}

function Hint({
  icon,
  text,
  actionLabel,
  onAction,
  onDismiss,
  dismissLabel = "Dismiss",
}: {
  icon: ReactNode;
  text: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  dismissLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    gsap.from(ref.current, { autoAlpha: 0, y: 8, duration: reducedMotion() ? 0 : 0.45, ease: "aro" });
  });

  return (
    <div
      ref={ref}
      className="flex items-center gap-2.5 rounded-[12px] border border-nimbus-border bg-nimbus-surface/80 py-1.5 pl-3 pr-1.5 text-[12.5px] text-nimbus-text-muted"
    >
      <span className="shrink-0 text-nimbus-text-muted">{icon}</span>
      <p className="min-w-0 flex-1 leading-snug">{text}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="h-7 shrink-0 rounded-md bg-nimbus-accent px-2.5 text-[12px] font-medium text-white transition-[background-color,transform] hover:bg-nimbus-accent-hover active:scale-95"
        >
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        title={dismissLabel}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-nimbus-text-faint transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text"
      >
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
