"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Check, ChevronDown, Database, Lock, Plus, Search, Unlink } from "lucide-react";
import type { GithubRepoLink } from "@/lib/types";
import { GithubMark } from "./BrandMark";
import { PopoverPanel, usePopoverDismiss } from "./Popover";
import { useToast } from "./Toaster";
import { CHIP, FIELD, MENU_LABEL, MENU_ROW } from "./ui/classes";

type RepoOption = {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
};

/** Links a GitHub repo to the chat. The model can then read it, and tagged code can be pushed. */
export function RepoConnect({
  value,
  onChange,
  forceOpen,
  onForceOpenHandled,
  placement = "up",
}: {
  value?: GithubRepoLink;
  onChange: (repo: GithubRepoLink | undefined) => void;
  forceOpen?: boolean;
  onForceOpenHandled?: () => void;
  placement?: "up" | "down";
}) {
  const { data: session } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<RepoOption[] | null>(null);
  const [filter, setFilter] = useState("");
  const [newRepoName, setNewRepoName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Opens in response to a one-shot outside trigger (the welcome banner, a skill hint).
    /* eslint-disable react-hooks/set-state-in-effect */
    if (forceOpen) {
      setOpen(true);
      onForceOpenHandled?.();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen]);

  usePopoverDismiss(open, () => setOpen(false), rootRef);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => filterRef.current?.focus(), 60);
    if (!session?.user || repos !== null) return;
    fetch("/api/github/repos")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(setRepos)
      .catch(() => setRepos([]));
  }, [open, session, repos]);

  const filtered = useMemo(() => {
    if (!repos) return null;
    const q = filter.trim().toLowerCase();
    return q ? repos.filter((r) => r.fullName.toLowerCase().includes(q)) : repos;
  }, [repos, filter]);

  if (!session?.user) return null;

  function connect(repo: { owner: string; name: string; defaultBranch: string }) {
    onChange({ owner: repo.owner, name: repo.name, branch: repo.defaultBranch });
    setOpen(false);
    toast({
      tone: "success",
      title: `Connected ${repo.owner}/${repo.name}`,
      description: "ARO can now read this repo while you chat.",
    });
  }

  async function syncMemory() {
    if (!value) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/memory/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: value.owner, repo: value.name, branch: value.branch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed.");
      toast({
        tone: "success",
        title: "Repo memory updated",
        description: `Indexed ${data.ingested} file${data.ingested === 1 ? "" : "s"} for recall in later chats.`,
      });
    } catch {
      toast({ tone: "error", title: "Memory sync failed", description: "Reading the repo still works. Try the sync again later." });
    } finally {
      setSyncing(false);
    }
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
      const repo = (await res.json()) as RepoOption;
      setRepos((all) => (all ? [repo, ...all] : all));
      setNewRepoName("");
      connect(repo);
    } catch {
      setError("GitHub could not create that repo. The name may be taken.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={CHIP}
      >
        <GithubMark className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[10rem] truncate">{value ? value.name : "Connect repo"}</span>
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <PopoverPanel
        open={open}
        origin={placement === "up" ? "bottom left" : "top left"}
        className={`${placement === "up" ? "bottom-full mb-2" : "top-full mt-2"} left-0 flex w-80 flex-col p-1.5`}
      >
        {value && (
          <div className="mb-1 flex items-center gap-2.5 rounded-lg bg-nimbus-surface-2 px-2.5 py-2">
            <GithubMark className="h-4 w-4 shrink-0 text-nimbus-text" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-nimbus-text">
                {value.owner}/{value.name}
              </p>
              <p className="text-[11.5px] text-nimbus-text-muted">Connected on {value.branch}. ARO can read it.</p>
            </div>
          </div>
        )}
        <div className="relative p-1">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-nimbus-text-faint" />
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search your repos"
            aria-label="Search your repos"
            className={`${FIELD} pl-8`}
          />
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {repos === null && (
            <div className="flex flex-col gap-1.5 p-2.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-4 animate-pulse rounded bg-nimbus-surface-2" style={{ width: `${75 - i * 15}%` }} />
              ))}
            </div>
          )}
          {repos?.length === 0 && (
            <p className="px-2.5 py-2 text-[13px] text-nimbus-text-muted">No repos found on this account.</p>
          )}
          {filtered?.length === 0 && repos && repos.length > 0 && (
            <p className="px-2.5 py-2 text-[13px] text-nimbus-text-muted">No repos match.</p>
          )}
          {filtered?.map((repo) => {
            const selected = value?.owner === repo.owner && value?.name === repo.name;
            return (
              <button
                key={repo.fullName}
                type="button"
                onClick={() => connect(repo)}
                className={`${MENU_ROW} ${selected ? "bg-nimbus-surface-2" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate">{repo.fullName}</span>
                {repo.private && <Lock aria-label="Private" className="h-3 w-3 shrink-0 text-nimbus-text-faint" />}
                <Check aria-hidden className={`h-3.5 w-3.5 shrink-0 text-nimbus-accent-text ${selected ? "" : "invisible"}`} />
              </button>
            );
          })}
        </div>
        <div className="border-t border-nimbus-border p-1 pt-1.5">
          <p className={MENU_LABEL}>New private repo</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createAndConnect();
            }}
            className="flex gap-1.5 px-1"
          >
            <input
              value={newRepoName}
              onChange={(e) => setNewRepoName(e.target.value)}
              placeholder="repo-name"
              aria-label="New repo name"
              className={FIELD}
            />
            <button
              type="submit"
              disabled={busy || !newRepoName.trim()}
              aria-label="Create repo"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-nimbus-accent text-white transition-[transform,opacity] active:scale-95 disabled:opacity-40"
            >
              <Plus aria-hidden className="h-4 w-4" />
            </button>
          </form>
          {error && <p className="px-1.5 pt-1.5 text-[12px] text-nimbus-danger">{error}</p>}
        </div>
        {value && (
          <div className="mt-1 flex items-center gap-1 border-t border-nimbus-border pt-1">
            <button type="button" onClick={syncMemory} disabled={syncing} className={`${MENU_ROW} flex-1 text-nimbus-text-muted disabled:opacity-50`}>
              <Database aria-hidden className="h-3.5 w-3.5" />
              {syncing ? "Indexing" : "Sync memory"}
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className={`${MENU_ROW} flex-1 text-nimbus-text-muted`}
            >
              <Unlink aria-hidden className="h-3.5 w-3.5" />
              Disconnect
            </button>
          </div>
        )}
      </PopoverPanel>
    </div>
  );
}
