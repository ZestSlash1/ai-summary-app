"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Cpu, Lock, Search, Sparkles } from "lucide-react";
import type { ModelOption } from "@/lib/types";
import { loadSavedDefaultModel, type ModelSource } from "@/lib/storage";
import { fetchDefaultModelForSource, fetchModelCatalog } from "@/lib/models";
import { useModelSource } from "@/lib/useModelSource";
import { PopoverPanel } from "./Popover";
import { BonsaiAccessNote } from "./GpuStatus";
import { Segmented } from "./ui/Segmented";
import { CHIP, FIELD, MENU_ROW } from "./ui/classes";

export const SOURCE_LABEL: Record<ModelSource, string> = {
  gateway: "AI Gateway",
  omniroute: "OmniRoute",
  bonsai: "Bonsai",
};

/**
 * The model picker. The source (AI Gateway, OmniRoute, or Bonsai on the home PC) is
 * switchable right here, so changing where models come from never needs a trip to Settings.
 * A model that does not belong to the current source is swapped for the source's default,
 * so a chat never sends a Gateway id to OmniRoute or the other way round.
 */
export function ModelSwitcher({
  value,
  onChange,
  placement = "up",
  variant = "chip",
  showSource = true,
}: {
  value: string;
  onChange: (modelId: string) => void;
  placement?: "up" | "down";
  variant?: "chip" | "field";
  showSource?: boolean;
}) {
  const { source, setSource, bonsaiAllowed, ready } = useModelSource();
  // Tagged with its source, so a list from the previous source is never mistaken for the current one.
  const [catalog, setCatalog] = useState<{ source: ModelSource; models: ModelOption[]; failed: boolean } | null>(null);
  const models = catalog?.source === source ? catalog.models : null;
  const failed = catalog?.source === source && catalog.failed;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [lockedNote, setLockedNote] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    fetchModelCatalog(source, open)
      .then((data) => {
        if (!cancelled) setCatalog({ source, models: data, failed: false });
      })
      .catch(() => {
        if (!cancelled) setCatalog({ source, models: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [source, open, ready]);

  // Keep the chat's model inside the current source's catalog.
  useEffect(() => {
    if (!models || models.length === 0 || models.some((m) => m.id === value)) return;
    const saved = loadSavedDefaultModel(source);
    const pick = models.find((m) => m.id === saved) ?? models.find((m) => m.free) ?? models[0];
    onChangeRef.current(pick.id);
  }, [models, value, source]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilter("");
      setLockedNote(false);
      return;
    }
    // Focus the search on desktop only: on a phone it would pop the keyboard over the sheet.
    if (window.matchMedia("(pointer: fine)").matches) window.setTimeout(() => filterRef.current?.focus(), 60);
  }, [open]);

  const current = models?.find((m) => m.id === value);
  const label = current?.name ?? value.split("/").pop() ?? value;

  const filtered = useMemo(() => {
    if (!models) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [models, filter]);

  async function changeSource(next: ModelSource) {
    setLockedNote(false);
    if (next === source) return;
    setSource(next);
    onChange(loadSavedDefaultModel(next) ?? (await fetchDefaultModelForSource(next)));
  }

  const SourceIcon = source === "bonsai" ? Cpu : Sparkles;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Model: ${label}`}
        className={
          variant === "chip"
            ? CHIP
            : "flex h-10 w-full min-w-56 items-center gap-2 rounded-lg border border-nimbus-border bg-nimbus-surface px-3 text-[13px] text-nimbus-text transition-colors hover:border-nimbus-border-strong sm:w-auto"
        }
      >
        <SourceIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className={`truncate ${variant === "chip" ? "max-w-[9.5rem]" : "flex-1 text-left"}`}>
          {models === null && !current ? "Loading" : label}
        </span>
        {current?.free && (
          <span className="rounded-[5px] bg-nimbus-free-soft px-1.5 py-px text-[10.5px] font-medium text-nimbus-free">
            Free
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <PopoverPanel
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement={placement === "up" ? "top-start" : "bottom-start"}
        width={320}
        label="Choose a model"
        className="p-1.5"
      >
        <div className="flex flex-col gap-2 p-1.5 pb-2">
          {showSource && (
            <Segmented
              label="Model source"
              size="sm"
              value={source}
              onChange={changeSource}
              onLocked={() => setLockedNote(true)}
              options={(["gateway", "omniroute", "bonsai"] as const).map((s) => ({
                value: s,
                label: SOURCE_LABEL[s],
                locked: s === "bonsai" && bonsaiAllowed === false,
                hint: s === "bonsai" && bonsaiAllowed === false ? "Bonsai needs an allowed GitHub account" : undefined,
                icon: s === "bonsai" && bonsaiAllowed === false ? <Lock aria-hidden className="h-3 w-3" /> : undefined,
              }))}
            />
          )}
          {lockedNote && <BonsaiAccessNote compact />}
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-nimbus-text-faint" />
            <input
              ref={filterRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Search ${SOURCE_LABEL[source]} models`}
              aria-label="Search models"
              className={`${FIELD} pl-8`}
            />
          </div>
        </div>
        <div role="listbox" aria-label="Models" className="min-h-0 flex-1 overflow-y-auto border-t border-nimbus-border pt-1.5 sm:max-h-72">
          {models === null && (
            <div className="flex flex-col gap-1.5 p-2.5" aria-label="Loading models">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="h-4 animate-pulse rounded bg-nimbus-surface-2" style={{ width: `${80 - i * 12}%` }} />
              ))}
            </div>
          )}
          {models?.length === 0 && (
            <p className="px-2.5 py-3 text-[13px] leading-relaxed text-nimbus-text-muted">
              {source === "bonsai"
                ? "Bonsai is not answering. Check that the home PC is on."
                : failed
                  ? `Could not load models from ${SOURCE_LABEL[source]}. Try again in a moment.`
                  : "No models available."}
            </p>
          )}
          {filtered?.length === 0 && models && models.length > 0 && (
            <p className="px-2.5 py-3 text-[13px] text-nimbus-text-muted">No models match.</p>
          )}
          {filtered?.map((m) => {
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`${MENU_ROW} ${selected ? "bg-nimbus-surface-2" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                {m.free && <span className="text-[11px] text-nimbus-free">Free</span>}
                <Check aria-hidden className={`h-3.5 w-3.5 shrink-0 text-nimbus-accent-text ${selected ? "" : "invisible"}`} />
              </button>
            );
          })}
        </div>
      </PopoverPanel>
    </div>
  );
}
