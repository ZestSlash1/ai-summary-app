"use client";

import { useRef } from "react";
import { signIn, useSession } from "next-auth/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { detectSkills } from "@/lib/skills";
import type { GithubRepoLink } from "@/lib/types";

gsap.registerPlugin(useGSAP);

const MCP_NUDGE_KEYWORDS = [
  "search the web",
  "browse the web",
  "look up",
  "fetch this url",
  "scrape",
];

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
  const skills = detectSkills(latestUserText);
  const lower = latestUserText.toLowerCase();
  const suggestsMcp =
    !hasEnabledMcp && MCP_NUDGE_KEYWORDS.some((kw) => lower.includes(kw));

  if (skills.length === 0 && !suggestsMcp) return null;

  return (
    <div className="flex flex-col gap-2">
      {skills.map((skill) => {
        if (!session?.user) {
          return (
            <PromptCard
              key={skill.id}
              text={`This looks like it needs the ${skill.name} skill — sign in with GitHub to enable it.`}
              actionLabel="Sign in with GitHub"
              onAction={() => signIn("github")}
            />
          );
        }
        if (!githubRepo) {
          return (
            <PromptCard
              key={skill.id}
              text={`${skill.name} is enabled — connect this conversation to a repo to use it.`}
              actionLabel="Connect a repo"
              onAction={onConnectRepo}
            />
          );
        }
        return <TipCard key={skill.id} text={skill.usageTip} />;
      })}

      {suggestsMcp && (
        <PromptCard
          text="This might need an external tool — no MCP connector is enabled yet."
          actionLabel="Add a connector"
          onAction={onOpenMcp}
        />
      )}
    </div>
  );
}

function useCardEntrance() {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current,
      { opacity: 0, y: 8, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power3.out" }
    );
  }, []);
  return ref;
}

function PromptCard({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const ref = useCardEntrance();
  return (
    <div
      ref={ref}
      className="flex items-center justify-between gap-3 rounded-2xl border border-nimbus-accent/30 bg-nimbus-accent-soft px-4 py-2.5 text-sm text-nimbus-text"
    >
      <span>{text}</span>
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 rounded-[var(--nimbus-radius-pill)] bg-nimbus-accent px-3 py-1.5 text-xs font-medium text-white shadow-[var(--nimbus-glow)] transition-[opacity,transform] duration-300 ease-[var(--nimbus-ease)] hover:opacity-90 active:scale-95"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function TipCard({ text }: { text: string }) {
  const ref = useCardEntrance();
  return (
    <div
      ref={ref}
      className="rounded-2xl border border-nimbus-free/30 bg-nimbus-free-soft px-4 py-2.5 text-sm text-nimbus-text"
    >
      💡 {text}
    </div>
  );
}
