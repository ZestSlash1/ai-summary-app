"use client";

import { useLayoutEffect, type RefObject } from "react";
import { signIn } from "next-auth/react";
import {
  ArrowRight,
  Bug,
  FlaskConical,
  FolderTree,
  GitCompare,
  ImagePlus,
  WandSparkles,
  Lightbulb,
  MessageSquareText,
  Wand2,
} from "lucide-react";
import { BrandMark, GithubMark } from "@/components/BrandMark";
import { gsap, SplitText, reducedMotion } from "@/lib/motion";
import type { Conversation, GithubRepoLink } from "@/lib/types";

export type Suggestion = { label: string; prompt: string; icon: typeof Bug };

export function suggestionsFor(repo?: GithubRepoLink, mode?: "chat" | "code"): Suggestion[] {
  if (mode === "code") {
    if (repo) {
      return [
        {
          label: `Explore ${repo.name} structure`,
          prompt: `Read the repository structure of ${repo.owner}/${repo.name} and summarize its key modules, entry points, and architectural flow.`,
          icon: FolderTree,
        },
        {
          label: "Fix a failing test",
          prompt: `Look for failing tests or bugs in ${repo.owner}/${repo.name}, find the root cause, and propose a clean fix with tests.`,
          icon: Bug,
        },
        {
          label: "Review changes and diff",
          prompt: `Review the changes and git diff in ${repo.owner}/${repo.name}, checking for edge cases, performance regressions, and style consistency.`,
          icon: GitCompare,
        },
      ];
    }
    return [
      {
        label: "Read repo structure",
        prompt: "Inspect the repository structure and explain the key folders, entry points, and data flow.",
        icon: FolderTree,
      },
      {
        label: "Fix a failing test",
        prompt: "Help me diagnose and fix a failing test. What error message or test failure are you seeing?",
        icon: Bug,
      },
      {
        label: "Review code diff",
        prompt: "Review a code diff or changes for potential regressions, security risks, and edge cases.",
        icon: GitCompare,
      },
    ];
  }
  if (repo) {
    return [
      {
        label: `Walk me through ${repo.name}`,
        prompt: `Look through the ${repo.owner}/${repo.name} repo and explain how it is structured: the main folders, the entry points, and how a request flows through it.`,
        icon: FolderTree,
      },
      {
        label: "Find bugs worth fixing",
        prompt: `Read the most important files in ${repo.owner}/${repo.name} and point out the bugs or risky code you find, with file paths and suggested fixes.`,
        icon: Bug,
      },
      {
        label: "Write tests for a core module",
        prompt: `Pick a core module in ${repo.owner}/${repo.name} that has no tests, read it, and write unit tests for it.`,
        icon: FlaskConical,
      },
    ];
  }
  return [
    { label: "What can you do?", prompt: "What can you help me with? Keep it short.", icon: Lightbulb },
    {
      label: "Write a debounced search hook",
      prompt: "Write a React hook for a debounced search input, with a short example of using it.",
      icon: Wand2,
    },
    {
      label: "Explain async and await",
      prompt: "Explain async and await in JavaScript with one small, practical example.",
      icon: MessageSquareText,
    },
  ];
}

/** The strip at the top of an empty chat: repo status, and the one action that matters next. */
export function WelcomeBanner({
  signedIn,
  repo,
  onConnectRepo,
}: {
  signedIn: boolean;
  repo?: GithubRepoLink;
  onConnectRepo: () => void;
}) {
  const content = !signedIn
    ? { strong: "Sign in with GitHub", rest: "to connect repos and keep chats in sync", onClick: () => signIn("github") }
    : repo
      ? { strong: `${repo.owner}/${repo.name}`, rest: "connected. ARO can read and search it", onClick: onConnectRepo }
      : { strong: "Connect a repo", rest: "so ARO can read your code and push changes", onClick: onConnectRepo };

  return (
    <button
      type="button"
      data-welcome="banner"
      onClick={content.onClick}
      className="aro-glass group/banner relative mx-auto flex max-w-[calc(100%-2rem)] items-center gap-2.5 rounded-full border py-1.5 pl-3 pr-2.5 text-[12.5px] text-nimbus-text-muted transition-[border-color,scale] duration-300 ease-[var(--nimbus-ease)] hover:border-nimbus-border-strong motion-safe:active:scale-[0.97] max-sm:rounded-2xl"
    >
      <GithubMark className="h-3.5 w-3.5 shrink-0 text-nimbus-text" />
      <span className="line-clamp-2 text-left sm:truncate">
        <span className="font-medium text-nimbus-text">{content.strong}</span> {content.rest}
      </span>
      <ArrowRight
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-[var(--nimbus-ease)] group-hover/banner:translate-x-0.5"
      />
    </button>
  );
}

/** Mark, greeting, and question above the composer. */
export function WelcomeHero({ firstName }: { firstName?: string }) {
  return (
    <div className="flex flex-col items-center px-4 text-center">
      <div data-field-focus className="relative mb-6 flex h-16 w-16 items-center justify-center">
        <div
          aria-hidden
          data-welcome="glow"
          className="pointer-events-none absolute -inset-16 rounded-full bg-[radial-gradient(closest-side,var(--aro-glow-2),var(--aro-glow-1)_45%,transparent)]"
        />
        <BrandMark className="aro-mark-blink relative h-16 w-16" />
      </div>
      <h1
        data-welcome="title"
        className="text-balance text-[26px] font-medium leading-tight tracking-[-0.025em] text-nimbus-text sm:text-[30px]"
      >
        {firstName ? `Welcome back, ${firstName}!` : "Welcome to ARO"}
      </h1>
      <p data-welcome="subtitle" className="mt-2 text-[15px] text-nimbus-text-muted">
        What should we work on?
      </p>
    </div>
  );
}

/** Starting points under the composer, plus a way back into the last chat. */
export function WelcomeSuggestions({
  suggestions,
  onPick,
  canEditImages,
  onPickImage,
  onCreateImage,
  lastConversation,
  onContinue,
}: {
  suggestions: Suggestion[];
  onPick: (prompt: string) => void;
  canEditImages: boolean;
  onPickImage: () => void;
  /** Offered with the edit chip, where the image generator is reachable. */
  onCreateImage?: () => void;
  lastConversation?: Conversation;
  onContinue: (id: string) => void;
}) {
  const chip =
    "aro-glass group/chip relative flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] max-sm:min-h-11 max-sm:text-[14px] text-nimbus-text-muted transition-[border-color,color,scale] duration-300 ease-[var(--nimbus-ease)] hover:border-nimbus-border-strong hover:text-nimbus-text motion-safe:active:scale-[0.97]";
  const icon =
    "h-3.5 w-3.5 shrink-0 transition-transform duration-500 ease-[var(--nimbus-ease)] group-hover/chip:-rotate-12 group-hover/chip:scale-110";

  return (
    <div className="flex w-full flex-col items-center gap-5 px-4">
      <div className="flex max-w-[680px] flex-wrap justify-center gap-2 max-sm:flex-col max-sm:flex-nowrap max-sm:items-center">
        {suggestions.map((s) => (
          <button key={s.label} type="button" data-welcome="chip" onClick={() => onPick(s.prompt)} className={chip}>
            <s.icon aria-hidden className={icon} />
            {s.label}
          </button>
        ))}
        {canEditImages && onCreateImage && (
          <button type="button" data-welcome="chip" onClick={onCreateImage} className={chip}>
            <WandSparkles aria-hidden className={icon} />
            Create an image
          </button>
        )}
        {canEditImages && (
          <button type="button" data-welcome="chip" onClick={onPickImage} className={chip}>
            <ImagePlus aria-hidden className={icon} />
            Edit an image
          </button>
        )}
      </div>
      {lastConversation && (
        <button
          type="button"
          data-welcome="chip"
          onClick={() => onContinue(lastConversation.id)}
          className="group/continue flex max-w-full items-center gap-1.5 text-[12.5px] text-nimbus-text-faint transition-colors hover:text-nimbus-text-muted"
        >
          <span className="shrink-0">Continue</span>
          <span className="truncate text-nimbus-text-muted">{lastConversation.title}</span>
          <ArrowRight
            aria-hidden
            className="h-3 w-3 shrink-0 transition-transform duration-300 group-hover/continue:translate-x-0.5"
          />
        </button>
      )}
    </div>
  );
}

/**
 * The welcome entrance, one timeline across the whole empty state: the mark pops
 * in and wakes up, the greeting rises word by word, then the composer and starting points settle in.
 */
export function useWelcomeIntro(
  scope: RefObject<HTMLElement | null>,
  composerRef: RefObject<HTMLElement | null>,
  active: boolean
) {
  // A fresh gsap.context per run (not useGSAP's shared one): React's dev double-mount reverts
  // the first run, and the replay must start from a clean context or its tweens never play.
  useLayoutEffect(() => {
    if (!active || !scope.current || reducedMotion()) return;
    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(scope);

      const title = q("[data-welcome=title]")[0];
      const split = title ? SplitText.create(title, { type: "words", mask: "words" }) : null;

      const tl = gsap.timeline({ defaults: { ease: "aro" } });
      tl.from(q("[data-mark=bubble]"), {
        autoAlpha: 0,
        scale: 0.55,
        rotation: -16,
        svgOrigin: "60 60",
        duration: 0.9,
        ease: "back.out(2.2)",
      })
        .from(q("[data-mark=eyes]"), { autoAlpha: 0, duration: 0.4, ease: "power1.out" }, 0.55)
        .from(q("[data-welcome=glow]"), { autoAlpha: 0, scale: 0.6, duration: 1.4 }, 0.1)
        .from(split?.words ?? [], { yPercent: 110, duration: 0.8, stagger: 0.06 }, 0.25)
        .from(q("[data-welcome=subtitle]"), { autoAlpha: 0, y: 8, duration: 0.7 }, 0.5)
        .from(composerRef.current, { autoAlpha: 0, y: 18, scale: 0.985, duration: 0.8 }, 0.55)
        .from(q("[data-welcome=chip]"), { autoAlpha: 0, y: 10, duration: 0.6, stagger: 0.05 }, 0.75)
        .from(q("[data-welcome=banner]"), { autoAlpha: 0, y: -10, duration: 0.7 }, 0.8);

      // A slow breath on the glow keeps the empty screen from feeling frozen.
      gsap.to(q("[data-welcome=glow]"), {
        scale: 1.12,
        opacity: 0.7,
        duration: 4.5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: 1.5,
      });

      return () => split?.revert();
    }, scope);
    return () => ctx.revert();
  }, [active, scope, composerRef]);
}
