"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { GithubRepoLink } from "@/lib/types";

type RepoOption = {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
};

export function RepoConnect({
  value,
  onChange,
  pushStatus,
  forceOpen,
  onForceOpenHandled,
}: {
  value?: GithubRepoLink;
  onChange: (repo: GithubRepoLink | undefined) => void;
  pushStatus?: { state: "pushed" | "error"; label: string };
  forceOpen?: boolean;
  onForceOpenHandled?: () => void;
}) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Opens the panel in response to an external one-shot trigger (the
    // "Connect a repo" skill prompt) rather than a continuously-derived value.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (forceOpen) {
      setOpen(true);
      onForceOpenHandled?.();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen]);
  const [repos, setRepos] = useState<RepoOption[] | null>(null);
  const [newRepoName, setNewRepoName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!open || !session?.user || repos !== null) return;
    fetch("/api/github/repos")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(setRepos)
      .catch(() => setRepos([]));
  }, [open, session, repos]);

  if (!session?.user) return null;

  async function connectExisting(repo: RepoOption) {
    onChange({ owner: repo.owner, name: repo.name, branch: repo.defaultBranch });
    setOpen(false);
  }

  async function createAndConnect() {
    if (!newRepoName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRepoName.trim(), private: true }),
      });
      if (!res.ok) throw new Error();
      const repo = await res.json();
      onChange({ owner: repo.owner, name: repo.name, branch: repo.defaultBranch });
      setNewRepoName("");
      setOpen(false);
    } catch {
      setError("Couldn't create that repo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-[var(--nimbus-radius-pill)] border border-nimbus-border bg-nimbus-surface px-3.5 py-2 text-sm font-medium text-nimbus-text shadow-[var(--nimbus-shadow)] transition-colors hover:border-nimbus-accent/40"
      >
        {value ? (
          <span className="max-w-[10rem] truncate">
            {value.owner}/{value.name}
          </span>
        ) : (
          <span className="text-nimbus-text-muted">Connect repo</span>
        )}
        {pushStatus && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              pushStatus.state === "pushed" ? "bg-nimbus-free" : "bg-red-500"
            }`}
            title={pushStatus.label}
          />
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-2xl border border-nimbus-border bg-nimbus-surface p-3 shadow-[var(--nimbus-shadow-lift)]">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-nimbus-text-muted">
            Your repos
          </p>
          <div className="mb-3 max-h-40 overflow-y-auto">
            {repos === null && (
              <p className="px-1 py-1 text-sm text-nimbus-text-muted">Loading…</p>
            )}
            {repos?.length === 0 && (
              <p className="px-1 py-1 text-sm text-nimbus-text-muted">No repos found.</p>
            )}
            {repos?.map((repo) => (
              <button
                key={repo.fullName}
                type="button"
                onClick={() => connectExisting(repo)}
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-nimbus-text hover:bg-nimbus-bg"
              >
                {repo.fullName}
              </button>
            ))}
          </div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-nimbus-text-muted">
            Or create new
          </p>
          <div className="flex gap-1.5">
            <input
              value={newRepoName}
              onChange={(e) => setNewRepoName(e.target.value)}
              placeholder="repo-name"
              className="flex-1 rounded-lg border border-nimbus-border bg-nimbus-bg px-2 py-1.5 text-sm text-nimbus-text placeholder:text-nimbus-text-muted focus:outline-none"
            />
            <button
              type="button"
              onClick={createAndConnect}
              disabled={busy || !newRepoName.trim()}
              className="rounded-lg bg-nimbus-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Create
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="mt-2 text-xs text-nimbus-text-muted hover:text-nimbus-text"
            >
              Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
