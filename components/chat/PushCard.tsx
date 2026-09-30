"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, GitBranch, Loader2, RotateCw, Upload } from "lucide-react";
import { gsap, useGSAP, reducedMotion } from "@/lib/motion";
import { useToast } from "@/components/Toaster";
import type { PushableFile } from "@/lib/codeBlocks";
import type { GithubRepoLink } from "@/lib/types";

type PushState =
  | { kind: "idle" }
  | { kind: "pushing" }
  | { kind: "pushed"; commitUrl?: string }
  | { kind: "error"; message: string };

/**
 * Offers to commit the path-tagged code blocks of one reply to the linked repo.
 * Pushing is always the user's click: the model can read the repo, so it must not
 * also be able to write to it on its own.
 */
export function PushCard({ files, repo }: { files: PushableFile[]; repo: GithubRepoLink }) {
  const [state, setState] = useState<PushState>({ kind: "idle" });
  const rootRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useGSAP(
    () => {
      gsap.from(rootRef.current, {
        autoAlpha: 0,
        y: 8,
        duration: reducedMotion() ? 0 : 0.5,
        ease: "aro",
        delay: 0.1,
      });
    },
    { scope: rootRef }
  );

  async function push() {
    setState({ kind: "pushing" });
    const target = `${repo.owner}/${repo.name}`;
    try {
      const res = await fetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: repo.owner,
          repo: repo.name,
          branch: repo.branch,
          files,
          message: `ARO: update ${files.length} file${files.length === 1 ? "" : "s"}`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { commitUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Push failed.");
      setState({ kind: "pushed", commitUrl: data.commitUrl });
      toast({
        tone: "success",
        title: `Pushed to ${target}`,
        description: `${files.length} file${files.length === 1 ? "" : "s"} committed to ${repo.branch}.`,
        action: data.commitUrl ? { label: "View commit", href: data.commitUrl } : undefined,
      });
      // Keep project memory current with what was just pushed. Best effort.
      fetch("/api/memory/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: target, files }),
      }).catch(() => {});
    } catch (err) {
      const message = /not signed in/i.test(err instanceof Error ? err.message : "")
        ? "Sign in with GitHub again to push."
        : "GitHub did not accept the push. Check the branch still exists, then try again.";
      setState({ kind: "error", message });
      toast({ tone: "error", title: "Push failed", description: message });
    }
  }

  return (
    <div
      ref={rootRef}
      className="mt-3 overflow-hidden rounded-[12px] border border-nimbus-border bg-nimbus-surface"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
        <GitBranch aria-hidden className="h-4 w-4 shrink-0 text-nimbus-text-muted" />
        <p className="min-w-0 flex-1 text-[13px] text-nimbus-text-muted">
          {state.kind === "pushed" ? (
            <>
              Pushed to <span className="text-nimbus-text">{repo.owner}/{repo.name}</span> on {repo.branch}
            </>
          ) : (
            <>
              <span className="text-nimbus-text">
                {files.length} file{files.length === 1 ? "" : "s"}
              </span>{" "}
              ready for {repo.owner}/{repo.name} on {repo.branch}
            </>
          )}
        </p>
        {state.kind === "pushed" ? (
          state.commitUrl && (
            <a
              href={state.commitUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-nimbus-accent-text transition-colors hover:bg-nimbus-surface-2"
            >
              View commit
              <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
            </a>
          )
        ) : (
          <button
            type="button"
            onClick={push}
            disabled={state.kind === "pushing"}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-nimbus-accent px-3 text-[13px] font-medium text-white shadow-[var(--nimbus-glow)] transition-[background-color,transform] duration-200 hover:bg-nimbus-accent-hover active:scale-[0.97] disabled:opacity-60"
          >
            {state.kind === "pushing" ? (
              <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
            ) : state.kind === "error" ? (
              <RotateCw aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <Upload aria-hidden className="h-3.5 w-3.5" />
            )}
            {state.kind === "pushing" ? "Pushing" : state.kind === "error" ? "Try again" : "Push"}
          </button>
        )}
      </div>
      <ul className="flex flex-wrap gap-1.5 border-t border-nimbus-border px-3.5 py-2">
        {files.map((f) => (
          <li
            key={f.path}
            className="rounded-md bg-nimbus-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-nimbus-text-muted"
          >
            {f.path}
          </li>
        ))}
      </ul>
      {state.kind === "error" && (
        <p role="alert" className="border-t border-nimbus-border px-3.5 py-2 text-[12.5px] text-nimbus-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}
