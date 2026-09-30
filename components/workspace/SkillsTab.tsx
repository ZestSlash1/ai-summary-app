"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Eye,
  Loader2,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { gsap, reducedMotion } from "@/lib/motion";
import { useToast } from "@/components/Toaster";
import { useHomeGpu } from "@/lib/useHomeGpu";
import {
  CURATED_SKILL_SOURCES,
  type CatalogSkill,
  type InstalledSkill,
} from "@/lib/skillSources";

const STORAGE_KEY = "aro-installed-skills";

/**
 * Slugify skill ID to safely match the gateway requirement: /^[a-zA-Z0-9_-]{1,64}$/
 */
function slugifySafeId(input: string): string {
  if (!input) return "skill";
  return (
    input
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "skill"
  );
}

function loadLocalSkills(): InstalledSkill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalSkills(skills: InstalledSkill[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
    window.dispatchEvent(new CustomEvent("aro:skills-changed", { detail: skills }));
  } catch {
    // Non-blocking storage fallback
  }
}

/**
 * Animated install button with GSAP state transitions.
 */
function InstallButton({
  state,
  onClick,
  disabled,
}: {
  state: "idle" | "installing" | "installed";
  onClick: () => void;
  disabled?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!btnRef.current) return;
    gsap.killTweensOf(btnRef.current);
    if (state === "installed") {
      gsap.fromTo(
        btnRef.current,
        { scale: 0.9, opacity: 0.8 },
        { scale: 1, opacity: 1, duration: reducedMotion() ? 0 : 0.35, ease: "aro" }
      );
    } else if (state === "installing") {
      gsap.fromTo(
        btnRef.current,
        { scale: 0.96, opacity: 0.7 },
        { scale: 1, opacity: 1, duration: reducedMotion() ? 0 : 0.25, ease: "aro" }
      );
    }
  }, [state]);

  if (state === "installed") {
    return (
      <span
        ref={btnRef as React.RefObject<HTMLSpanElement>}
        className="flex h-7 items-center gap-1 rounded-md border border-nimbus-accent/40 bg-nimbus-accent-soft px-2 text-[11px] font-medium text-nimbus-accent-text"
      >
        <Check aria-hidden className="h-3 w-3" />
        Installed
      </span>
    );
  }

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onClick}
      disabled={disabled || state === "installing"}
      className="flex h-7 items-center gap-1 rounded-md bg-nimbus-accent px-2.5 text-[11px] font-medium text-white shadow-xs transition-colors hover:bg-nimbus-accent-hover active:scale-95 disabled:opacity-50"
    >
      {state === "installing" ? (
        <>
          <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
          <span>Installing</span>
        </>
      ) : (
        <>
          <Download aria-hidden className="h-3 w-3" />
          <span>Install</span>
        </>
      )}
    </button>
  );
}

export function SkillsTab() {
  const toast = useToast();
  // Only the owner, with Hermes set up on the home PC, can copy a skill into Hermes.
  const { allowed: homeAllowed, status: homeStatus } = useHomeGpu();
  const hermesReady = homeAllowed === true && !!homeStatus?.hermes && homeStatus.hermes !== "unconfigured";
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [catalog, setCatalog] = useState<CatalogSkill[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [selectedSource, setSelectedSource] = useState<string>("anthropics/skills");
  const [customUrl, setCustomUrl] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [viewMode, setViewMode] = useState<"catalog" | "installed">("catalog");

  const [installingId, setInstallingId] = useState<string | null>(null);
  const [previewSkill, setPreviewSkill] = useState<{
    name: string;
    description: string;
    body: string;
    repo: string;
    path: string;
    installed: boolean;
    catalogItem?: CatalogSkill;
  } | null>(null);

  // Sync installed skills from local storage and server
  const refreshInstalled = useCallback(() => {
    const local = loadLocalSkills();
    setInstalled(local);

    fetch("/api/skills/install")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.skills && Array.isArray(data.skills) && data.skills.length > 0) {
          setInstalled(data.skills);
          saveLocalSkills(data.skills);
        }
      })
      .catch(() => {
        // Retain local skills if server request fails
      });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshInstalled();

    const handleUpdate = () => {
      setInstalled(loadLocalSkills());
    };

    window.addEventListener("aro:skills-changed", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("aro:skills-changed", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [refreshInstalled]);

  // Load catalog for selected source
  const loadCatalog = useCallback(async (sourceToLoad: string) => {
    if (!sourceToLoad.trim()) return;
    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const res = await fetch(`/api/skills/catalog?source=${encodeURIComponent(sourceToLoad.trim())}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to load skills catalog.");
      }
      const data = (await res.json()) as { skills: CatalogSkill[] };
      setCatalog(data.skills ?? []);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Failed to load skills catalog.");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSource !== "custom") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadCatalog(selectedSource);
    }
  }, [selectedSource, loadCatalog]);

  // Check if a catalog skill is already installed
  const installedIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of installed) {
      set.add(item.id.toLowerCase());
      set.add(item.name.toLowerCase());
    }
    return set;
  }, [installed]);

  const isSkillInstalled = useCallback(
    (skill: CatalogSkill) => {
      const safeId = slugifySafeId(`${skill.owner}/${skill.repo}/${skill.path || skill.name}`).toLowerCase();
      return installedIds.has(safeId) || installedIds.has(skill.name.toLowerCase());
    },
    [installedIds]
  );

  // Install a skill handler
  const handleInstall = async (skill: CatalogSkill) => {
    setInstallingId(skill.id || skill.name);
    try {
      const res = await fetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: skill.repo,
          path: skill.path,
          ref: skill.branch,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Installation failed.");
      }

      const result = (await res.json()) as { skill: InstalledSkill };
      const newSkill = result.skill;

      // Update local storage
      const existing = loadLocalSkills();
      const updated = [newSkill, ...existing.filter((s) => s.id !== newSkill.id)];
      saveLocalSkills(updated);
      setInstalled(updated);

      // Copy into Hermes through the server (owner-only). The skill is installed here either
      // way; this only reports whether Hermes got it too.
      if (hermesReady) {
        const safeId = slugifySafeId(newSkill.id || newSkill.name);
        try {
          const hermesRes = await fetch("/api/hermes/skills", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: safeId, files: newSkill.files }),
          });
          const hermesBody = (await hermesRes.json().catch(() => ({}))) as { error?: string; replaced?: boolean };
          if (hermesRes.ok) {
            toast({ tone: "success", title: hermesBody.replaced ? "Updated in Hermes" : "Also installed in Hermes" });
          } else {
            toast({ tone: "error", title: "Installed here, but not in Hermes", description: hermesBody.error });
          }
        } catch {
          toast({ tone: "error", title: "Installed here, but not in Hermes", description: "The home PC did not answer." });
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to install skill.");
    } finally {
      setInstallingId(null);
    }
  };

  // Toggle enable/disable
  const handleToggle = async (skillId: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    const current = loadLocalSkills();
    const updated = current.map((s) => (s.id === skillId ? { ...s, enabled: nextEnabled } : s));
    saveLocalSkills(updated);
    setInstalled(updated);

    try {
      await fetch("/api/skills/install", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId, enabled: nextEnabled }),
      });
    } catch {
      // Local state is already updated
    }
  };

  // Uninstall skill
  const handleUninstall = async (skillId: string) => {
    const current = loadLocalSkills();
    const updated = current.filter((s) => s.id !== skillId);
    saveLocalSkills(updated);
    setInstalled(updated);

    try {
      await fetch("/api/skills/install", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId }),
      });
    } catch {
      // Local state is already updated
    }
  };

  // Filter skills by search query
  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.repo.toLowerCase().includes(q)
    );
  }, [catalog, search]);

  const filteredInstalled = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return installed;
    return installed.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.repo.toLowerCase().includes(q)
    );
  }, [installed, search]);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Sub-tab Navigation */}
      <div className="flex items-center justify-between gap-1 border-b border-nimbus-border pb-2 text-[12px]">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setViewMode("catalog")}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              viewMode === "catalog"
                ? "bg-nimbus-surface text-nimbus-text shadow-xs"
                : "text-nimbus-text-muted hover:text-nimbus-text"
            }`}
          >
            Catalog
          </button>
          <button
            type="button"
            onClick={() => setViewMode("installed")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
              viewMode === "installed"
                ? "bg-nimbus-surface text-nimbus-text shadow-xs"
                : "text-nimbus-text-muted hover:text-nimbus-text"
            }`}
          >
            <span>Installed</span>
            {installed.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-nimbus-accent px-1 text-[10px] font-semibold text-white">
                {installed.length}
              </span>
            )}
          </button>
        </div>

        <span className="text-[11px] text-nimbus-text-faint">
          {installed.filter((s) => s.enabled).length} active
        </span>
      </div>

      {/* Search Input (16px minimum font size on mobile to prevent automatic iOS zoom) */}
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-nimbus-text-faint"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills..."
          aria-label="Search skills"
          className="h-8 w-full rounded-lg border border-nimbus-border bg-nimbus-surface pl-8 pr-2.5 text-[16px] text-nimbus-text placeholder:text-nimbus-text-faint focus:border-nimbus-accent/60 focus:outline-none md:text-[12.5px]"
        />
      </div>

      {/* CATALOG VIEW */}
      {viewMode === "catalog" && (
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          {/* Source Filter Dropdown / Tabs */}
          <div className="flex flex-col gap-2">
            <label htmlFor="source-select" className="sr-only">
              Filter by skill source
            </label>
            <div className="flex items-center gap-1.5">
              <select
                id="source-select"
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="h-7 flex-1 rounded-md border border-nimbus-border bg-nimbus-surface px-2 text-[12px] text-nimbus-text focus:border-nimbus-accent/60 focus:outline-none"
              >
                {CURATED_SKILL_SOURCES.filter((s) => s.owner && s.repo).map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
                <option value="custom">Custom GitHub URL</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  if (selectedSource === "custom") {
                    loadCatalog(customUrl);
                  } else {
                    loadCatalog(selectedSource);
                  }
                }}
                title="Refresh catalog"
                aria-label="Refresh catalog"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-nimbus-border bg-nimbus-surface text-nimbus-text-muted transition-colors hover:text-nimbus-text"
              >
                <RotateCw aria-hidden className="h-3 w-3" />
              </button>
            </div>

            {selectedSource === "custom" && (
              <div className="flex items-center gap-1.5">
                <input
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo/tree/main/skills"
                  aria-label="Custom GitHub repository URL"
                  className="h-7 flex-1 rounded-md border border-nimbus-border bg-nimbus-surface px-2 text-[16px] text-nimbus-text placeholder:text-nimbus-text-faint focus:border-nimbus-accent/60 focus:outline-none md:text-[11.5px]"
                />
                <button
                  type="button"
                  onClick={() => loadCatalog(customUrl)}
                  className="h-7 rounded-md bg-nimbus-surface-2 px-2.5 text-[11.5px] font-medium text-nimbus-text transition-colors hover:bg-nimbus-surface-3"
                >
                  Load
                </button>
              </div>
            )}
          </div>

          {/* Loading Skeleton */}
          {catalogLoading && (
            <div className="flex flex-col gap-2 py-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg border border-nimbus-border bg-nimbus-surface/60 p-2.5"
                />
              ))}
            </div>
          )}

          {/* Error Message */}
          {catalogError && (
            <div className="rounded-lg border border-nimbus-danger/30 bg-nimbus-danger/10 p-2.5 text-[12px] text-nimbus-danger">
              <p className="leading-relaxed">{catalogError}</p>
              <button
                type="button"
                onClick={() => loadCatalog(selectedSource === "custom" ? customUrl : selectedSource)}
                className="mt-2 flex items-center gap-1 text-[11.5px] font-medium underline"
              >
                <RotateCw aria-hidden className="h-3 w-3" />
                Retry loading
              </button>
            </div>
          )}

          {/* Catalog Skill Cards */}
          {!catalogLoading && !catalogError && (
            <div className="aro-no-scrollbar flex-1 overflow-y-auto">
              {filteredCatalog.length === 0 ? (
                <div className="py-8 text-center text-[12.5px] text-nimbus-text-muted">
                  {search ? "No skills match your search query." : "No skills found in this source."}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredCatalog.map((skill) => {
                    const isInstalled = isSkillInstalled(skill);
                    const isBusy = installingId === (skill.id || skill.name);
                    const state = isInstalled ? "installed" : isBusy ? "installing" : "idle";

                    return (
                      <div
                        key={skill.id || skill.name}
                        className="rounded-lg border border-nimbus-border bg-nimbus-surface/70 p-2.5 transition-colors hover:border-nimbus-border-strong"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Sparkles aria-hidden className="h-3.5 w-3.5 shrink-0 text-nimbus-accent" />
                              <h3 className="truncate text-[12.5px] font-medium text-nimbus-text">
                                {skill.name}
                              </h3>
                              {skill.verified && (
                                <span title="Curated verified skill">
                                  <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-emerald-500" />
                                </span>
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-nimbus-text-muted">
                              {skill.description || "Instruction package for specialized agent workflows."}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between border-t border-nimbus-border/40 pt-2">
                          <span className="truncate text-[10.5px] text-nimbus-text-faint">
                            {skill.repo}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewSkill({
                                  name: skill.name,
                                  description: skill.description,
                                  body: skill.bodyPreview || "No preview body available.",
                                  repo: skill.repo,
                                  path: skill.path,
                                  installed: isInstalled,
                                  catalogItem: skill,
                                })
                              }
                              className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-nimbus-text-muted transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text"
                            >
                              <Eye aria-hidden className="h-3 w-3" />
                              Preview
                            </button>

                            <InstallButton
                              state={state}
                              onClick={() => handleInstall(skill)}
                              disabled={isInstalled || isBusy}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* INSTALLED VIEW */}
      {viewMode === "installed" && (
        <div className="aro-no-scrollbar flex-1 overflow-y-auto">
          {filteredInstalled.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <Sparkles aria-hidden className="h-8 w-8 text-nimbus-text-faint" />
              <p className="mt-2 text-[13px] font-medium text-nimbus-text">No skills installed</p>
              <p className="mt-1 text-[12px] text-nimbus-text-muted">
                Explore the catalog to add verified skills into your workspace.
              </p>
              <button
                type="button"
                onClick={() => setViewMode("catalog")}
                className="mt-3 rounded-md bg-nimbus-surface-2 px-3 py-1.5 text-[12px] font-medium text-nimbus-text hover:bg-nimbus-surface-3"
              >
                Browse Catalog
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredInstalled.map((skill) => (
                <div
                  key={skill.id}
                  className={`rounded-lg border bg-nimbus-surface/70 p-2.5 transition-colors ${
                    skill.enabled ? "border-nimbus-border" : "border-nimbus-border/40 opacity-75"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Sparkles aria-hidden className="h-3.5 w-3.5 shrink-0 text-nimbus-accent" />
                        <h3 className="truncate text-[12.5px] font-medium text-nimbus-text">
                          {skill.name}
                        </h3>
                        {skill.verified && (
                          <span title="Curated verified skill">
                            <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-emerald-500" />
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-nimbus-text-muted">
                        {skill.description || "Active instructions package."}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggle(skill.id, skill.enabled)}
                      role="switch"
                      aria-checked={skill.enabled}
                      title={skill.enabled ? "Disable skill" : "Enable skill"}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none ${
                        skill.enabled ? "bg-nimbus-accent" : "bg-nimbus-surface-3"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition duration-200 ${
                          skill.enabled ? "translate-x-4.5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-nimbus-border/40 pt-2">
                    <span className="truncate text-[10.5px] text-nimbus-text-faint">
                      {skill.repo || "Custom repository"}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewSkill({
                            name: skill.name,
                            description: skill.description,
                            body: skill.skillMd,
                            repo: skill.repo,
                            path: skill.path,
                            installed: true,
                          })
                        }
                        className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-nimbus-text-muted transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text"
                      >
                        <Eye aria-hidden className="h-3 w-3" />
                        View
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUninstall(skill.id)}
                        title="Uninstall skill"
                        aria-label={`Uninstall ${skill.name}`}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-nimbus-text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                      >
                        <Trash2 aria-hidden className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SKILL PREVIEW MODAL */}
      {previewSkill && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-nimbus-border bg-nimbus-panel shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-nimbus-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles aria-hidden className="h-4 w-4 text-nimbus-accent" />
                <h2 id="preview-title" className="text-[13.5px] font-medium text-nimbus-text">
                  {previewSkill.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPreviewSkill(null)}
                aria-label="Close preview"
                className="flex h-6 w-6 items-center justify-center rounded-md text-nimbus-text-muted hover:bg-nimbus-surface-2 hover:text-nimbus-text"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="aro-no-scrollbar flex-1 overflow-y-auto p-4">
              <p className="text-[12.5px] text-nimbus-text-muted">
                {previewSkill.description}
              </p>

              <div className="mt-3 rounded-lg border border-nimbus-border bg-nimbus-surface/60 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-nimbus-text-faint">
                  SKILL.md Instructions
                </p>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-nimbus-text">
                  {previewSkill.body}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-nimbus-border px-4 py-3">
              <span className="truncate text-[11px] text-nimbus-text-faint">
                {previewSkill.repo}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewSkill(null)}
                  className="rounded-md border border-nimbus-border bg-nimbus-surface px-3 py-1.5 text-[12px] font-medium text-nimbus-text hover:bg-nimbus-surface-2"
                >
                  Close
                </button>

                {!previewSkill.installed && previewSkill.catalogItem && (
                  <button
                    type="button"
                    onClick={() => {
                      if (previewSkill.catalogItem) {
                        handleInstall(previewSkill.catalogItem);
                        setPreviewSkill(null);
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-md bg-nimbus-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-xs hover:bg-nimbus-accent-hover"
                  >
                    <Download aria-hidden className="h-3.5 w-3.5" />
                    Install Now
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
