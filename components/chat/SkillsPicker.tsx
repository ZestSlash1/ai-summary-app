"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Sparkles, X } from "lucide-react";
import { PopoverPanel } from "@/components/Popover";
import type { InstalledSkill } from "@/lib/skillSources";

const STORAGE_KEY = "aro-installed-skills";

function loadInstalledSkills(): InstalledSkill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveInstalledSkills(skills: InstalledSkill[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
    window.dispatchEvent(new CustomEvent("aro:skills-changed", { detail: skills }));
  } catch {
    // Non-blocking fallback
  }
}

export function SkillsPicker({
  onOpenSkillsTab,
}: {
  onOpenSkillsTab?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSkills(loadInstalledSkills());

    const handleUpdate = () => {
      setSkills(loadInstalledSkills());
    };

    window.addEventListener("aro:skills-changed", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("aro:skills-changed", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const enabledCount = skills.filter((s) => s.enabled).length;

  const toggleSkill = (id: string) => {
    const next = skills.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    setSkills(next);
    saveInstalledSkills(next);

    // Sync with server if configured
    fetch("/api/skills/install", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, enabled: next.find((s) => s.id === id)?.enabled }),
    }).catch(() => {
      // Retain local state
    });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-label={`Skills: ${enabledCount} active`}
        onClick={() => setOpen((prev) => !prev)}
        title="Skills: augment model with specialized workflows"
        className={`flex h-8 items-center gap-1.5 rounded-lg border border-nimbus-border bg-nimbus-surface-2 px-2.5 text-[12px] font-medium text-nimbus-text transition-[color,background-color,border-color,transform] hover:border-nimbus-border-strong hover:bg-nimbus-surface-3 active:scale-95 ${
          enabledCount > 0 ? "border-nimbus-accent/40 bg-nimbus-accent-soft text-nimbus-accent-text hover:bg-nimbus-accent-soft hover:text-nimbus-accent-text" : ""
        }`}
      >
        <Sparkles aria-hidden className="h-3.5 w-3.5 shrink-0 text-nimbus-accent" />
        <span>Skills</span>
        {enabledCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-nimbus-accent px-1 text-[10px] font-semibold text-white">
            {enabledCount}
          </span>
        )}
      </button>

      <PopoverPanel
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="top-start"
        width={320}
        label="Skills picker"
      >
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-nimbus-border">
            <div className="flex items-center gap-1.5">
              <Sparkles aria-hidden className="h-4 w-4 text-nimbus-accent" />
              <span className="text-[13px] font-medium text-nimbus-text">Installed Skills</span>
              <span className="text-[11.5px] text-nimbus-text-muted">({skills.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close skills picker"
              className="rounded p-1 text-nimbus-text-muted hover:bg-nimbus-surface-2 hover:text-nimbus-text"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>

          {skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <p className="text-[12.5px] text-nimbus-text-muted">No skills installed yet.</p>
              {onOpenSkillsTab ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenSkillsTab();
                  }}
                  className="mt-2.5 rounded-md bg-nimbus-accent px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-nimbus-accent-hover transition-colors"
                >
                  Browse GitHub Skills
                </button>
              ) : (
                <Link
                  href="/settings#skills"
                  onClick={() => setOpen(false)}
                  className="mt-2.5 rounded-md bg-nimbus-accent px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-nimbus-accent-hover transition-colors"
                >
                  Manage Skills
                </Link>
              )}
            </div>
          ) : (
            <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto py-1">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center justify-between rounded-lg border border-nimbus-border bg-nimbus-surface p-2 transition-colors hover:bg-nimbus-surface-2"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="truncate text-[12.5px] font-medium text-nimbus-text">{skill.name}</p>
                    <p className="line-clamp-1 text-[11px] text-nimbus-text-muted">{skill.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={skill.enabled}
                    onClick={() => toggleSkill(skill.id)}
                    aria-label={`Toggle ${skill.name}`}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      skill.enabled
                        ? "border-nimbus-accent bg-nimbus-accent text-white"
                        : "border-nimbus-border bg-nimbus-surface-2 text-transparent hover:border-nimbus-border-strong"
                    }`}
                  >
                    <Check aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-nimbus-border flex items-center justify-between text-[11.5px]">
            {onOpenSkillsTab ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenSkillsTab();
                }}
                className="text-nimbus-accent hover:underline flex items-center gap-1"
              >
                Browse catalog
              </button>
            ) : (
              <Link
                href="/settings#skills"
                onClick={() => setOpen(false)}
                className="text-nimbus-accent hover:underline flex items-center gap-1"
              >
                Manage in Settings
                <ExternalLink aria-hidden className="h-3 w-3" />
              </Link>
            )}
            <span className="text-nimbus-text-faint">{enabledCount} enabled</span>
          </div>
        </div>
      </PopoverPanel>
    </>
  );
}
