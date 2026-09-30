"use client";

import { useEffect, useMemo, useState } from "react";
import type { UIMessage } from "ai";
import {
  FileCode,
  FileText,
  FolderTree,
  GitBranch,
  Layers,
  PanelRightClose,
  RotateCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { GithubRepoLink } from "@/lib/types";
import { extractPushableFiles, type PushableFile } from "@/lib/codeBlocks";
import { PushCard } from "@/components/chat/PushCard";
import { SkillsTab } from "@/components/workspace/SkillsTab";

export type WorkspaceTab = "files" | "changes" | "skills";

type TreeEntry = {
  path: string;
  size?: number;
};

function formatSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n\n");
}

export function WorkspaceRail({
  repo,
  messages,
  open,
  onClose,
  onFileSelect,
}: {
  repo?: GithubRepoLink;
  messages: UIMessage[];
  open: boolean;
  onClose: () => void;
  onFileSelect?: (path: string) => void;
}) {
  const [tab, setTab] = useState<WorkspaceTab>("files");
  const [filter, setFilter] = useState("");
  const [entries, setEntries] = useState<TreeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Fetch repository tree when repo is linked and files tab is viewed
  useEffect(() => {
    if (!repo) return;

    let active = true;

    const query = new URLSearchParams({
      owner: repo.owner,
      repo: repo.name,
      branch: repo.branch,
    });

    fetch(`/api/github/tree?${query.toString()}`)
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Failed to load repository tree.");
        }
        const data = (await res.json()) as { entries: TreeEntry[]; truncated: boolean };
        if (active) {
          setEntries(data.entries ?? []);
        }
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });

    return () => {
      active = false;
    };
  }, [repo, refreshIndex]);

  const activeEntries = repo ? entries : null;
  const activeError = repo ? error : null;
  const loading = Boolean(repo && activeEntries === null && !activeError);

  const pendingFiles: PushableFile[] = useMemo(() => {
    const raw = extractPushableFiles(messages.map(textOf));
    const deduped = new Map<string, PushableFile>();
    for (const f of raw) deduped.set(f.path, f);
    return Array.from(deduped.values());
  }, [messages]);

  const filteredEntries = useMemo(() => {
    if (!activeEntries) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return activeEntries;
    return activeEntries.filter((e) => e.path.toLowerCase().includes(q));
  }, [activeEntries, filter]);

  if (!open) return null;

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
      />

      {/* Rail Container: desktop right rail, mobile sliding drawer */}
      <aside
        aria-label="Workspace rail"
        className={`fixed inset-y-0 right-0 z-50 flex w-[85vw] max-w-sm flex-col border-l border-nimbus-border bg-nimbus-panel text-nimbus-text shadow-xl transition-transform duration-300 md:relative md:inset-auto md:z-auto md:w-80 md:shrink-0 md:shadow-none`}
      >
        {/* Rail Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-nimbus-border px-3.5">
          <div className="flex items-center gap-2">
            <Layers aria-hidden className="h-4 w-4 text-nimbus-accent" />
            <h2 className="text-[13.5px] font-medium text-nimbus-text">Workspace</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close workspace"
            title="Close workspace"
            className="flex h-7 w-7 items-center justify-center rounded-md text-nimbus-text-muted transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text"
          >
            <PanelRightClose aria-hidden className="hidden h-4 w-4 md:block" />
            <X aria-hidden className="h-4 w-4 md:hidden" />
          </button>
        </div>

        {/* Tab Selector */}
        <div
          role="tablist"
          aria-label="Workspace sections"
          className="flex border-b border-nimbus-border bg-nimbus-surface/40 p-1 text-[12.5px]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "files"}
            onClick={() => setTab("files")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-colors ${
              tab === "files"
                ? "bg-nimbus-surface text-nimbus-text shadow-xs"
                : "text-nimbus-text-muted hover:text-nimbus-text"
            }`}
          >
            <FolderTree aria-hidden className="h-3.5 w-3.5" />
            <span>Files</span>
            {activeEntries && <span className="text-[11px] text-nimbus-text-faint">({activeEntries.length})</span>}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === "changes"}
            onClick={() => setTab("changes")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-colors ${
              tab === "changes"
                ? "bg-nimbus-surface text-nimbus-text shadow-xs"
                : "text-nimbus-text-muted hover:text-nimbus-text"
            }`}
          >
            <GitBranch aria-hidden className="h-3.5 w-3.5" />
            <span>Changes</span>
            {pendingFiles.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-nimbus-accent px-1 text-[10px] font-semibold text-white">
                {pendingFiles.length}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === "skills"}
            onClick={() => setTab("skills")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-colors ${
              tab === "skills"
                ? "bg-nimbus-surface text-nimbus-text shadow-xs"
                : "text-nimbus-text-muted hover:text-nimbus-text"
            }`}
          >
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            <span>Skills</span>
          </button>
        </div>

        {/* Tab Content Panels */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {/* TAB 1: FILES */}
          {tab === "files" && (
            <div className="flex h-full flex-col">
              {!repo ? (
                <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
                  <FolderTree aria-hidden className="h-8 w-8 text-nimbus-text-faint" />
                  <p className="mt-2 text-[13px] font-medium text-nimbus-text">No repository connected</p>
                  <p className="mt-1 text-[12px] text-nimbus-text-muted">
                    Connect a GitHub repository to browse files in this coding session.
                  </p>
                </div>
              ) : (
                <>
                  <div className="relative mb-2.5">
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-nimbus-text-faint"
                    />
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Filter files..."
                      aria-label="Filter files"
                      className="h-8 w-full rounded-lg border border-nimbus-border bg-nimbus-surface pl-8 pr-2.5 text-[16px] text-nimbus-text placeholder:text-nimbus-text-faint focus:border-nimbus-accent/60 focus:outline-none md:text-[12.5px]"
                    />
                  </div>

                  {loading && (
                    <div className="flex flex-col gap-2 py-2">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="h-5 animate-pulse rounded bg-nimbus-surface-2"
                          style={{ width: `${80 - i * 10}%` }}
                        />
                      ))}
                    </div>
                  )}

                  {activeError && (
                    <div className="rounded-lg border border-nimbus-danger/30 bg-nimbus-danger/10 p-2.5 text-[12.5px] text-nimbus-danger">
                      <p className="leading-relaxed">{activeError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setEntries(null);
                          setError(null);
                          setRefreshIndex((i) => i + 1);
                        }}
                        className="mt-2 flex items-center gap-1 text-[11.5px] font-medium underline"
                      >
                        <RotateCw aria-hidden className="h-3 w-3" />
                        Retry
                      </button>
                    </div>
                  )}

                  {!loading && !activeError && filteredEntries.length === 0 && (
                    <p className="py-6 text-center text-[12.5px] text-nimbus-text-muted">
                      {filter ? "No files match your filter." : "Repository is empty."}
                    </p>
                  )}

                  {!loading && !activeError && filteredEntries.length > 0 && (
                    <ul className="flex flex-col gap-0.5">
                      {filteredEntries.map((entry) => (
                        <li key={entry.path}>
                          <button
                            type="button"
                            onClick={() => onFileSelect?.(entry.path)}
                            title={entry.path}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-nimbus-text-muted transition-colors hover:bg-nimbus-surface hover:text-nimbus-text"
                          >
                            <FileCode aria-hidden className="h-3.5 w-3.5 shrink-0 text-nimbus-text-faint" />
                            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">
                              {entry.path}
                            </span>
                            {entry.size !== undefined && (
                              <span className="shrink-0 text-[10.5px] text-nimbus-text-faint">
                                {formatSize(entry.size)}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 2: CHANGES */}
          {tab === "changes" && (
            <div className="flex h-full flex-col">
              {pendingFiles.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
                  <GitBranch aria-hidden className="h-8 w-8 text-nimbus-text-faint" />
                  <p className="mt-2 text-[13px] font-medium text-nimbus-text">No pending changes</p>
                  <p className="mt-1 text-[12px] text-nimbus-text-muted">
                    Code blocks tagged with file paths generated in this session will appear here ready to push.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {repo ? (
                    <PushCard files={pendingFiles} repo={repo} />
                  ) : (
                    <div className="rounded-lg border border-nimbus-warn/30 bg-nimbus-warn/10 p-2.5 text-[12px] text-nimbus-text-muted">
                      Connect a repository to push these {pendingFiles.length} file changes.
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11.5px] font-medium text-nimbus-text-faint uppercase tracking-wider">
                      Modified Files ({pendingFiles.length})
                    </p>
                    <ul className="flex flex-col gap-1">
                      {pendingFiles.map((file, idx) => (
                        <li
                          key={`${file.path}-${idx}`}
                          className="flex items-center gap-2 rounded-lg border border-nimbus-border bg-nimbus-surface/60 px-2.5 py-2 text-[12.5px]"
                        >
                          <FileText aria-hidden className="h-3.5 w-3.5 shrink-0 text-nimbus-accent" />
                          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-nimbus-text">
                            {file.path}
                          </span>
                          <span className="shrink-0 rounded bg-nimbus-surface-2 px-1.5 py-0.5 text-[10px] text-nimbus-text-faint">
                            {file.content.split("\n").length} lines
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SKILLS */}
          {tab === "skills" && <SkillsTab />}

        </div>
      </aside>
    </>
  );
}
