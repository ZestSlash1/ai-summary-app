"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Cpu, Search, Sparkles } from "lucide-react";
import type { ModelOption } from "@/lib/types";
import { MODEL_SOURCE_EVENT, loadModelSource, saveModelSource, type ModelSource } from "@/lib/storage";
import { fetchDefaultModelForSource, fetchModelCatalog } from "@/lib/models";
import { useHomeGpu } from "@/lib/useHomeGpu";
import { PopoverPanel, usePopoverDismiss } from "./Popover";
import { Segmented } from "./ui/Segmented";
import { CHIP, FIELD, MENU_ROW } from "./ui/classes";

const SOURCE_LABEL: Record<ModelSource, string> = {
  gateway: "AI Gateway",
  omniroute: "OmniRoute",
  bonsai: "Bonsai",
};

/**
 * The model picker. The source (AI Gateway, OmniRoute, or Bonsai on the home PC) is
 * switchable right here, so changing where models come from never needs a trip to Settings.
 */
export function ModelSwitcher({
  value,
  onChange,
  placement = "up",
  variant = "chip",
}: {
  value: string;
  onChange: (modelId: string) => void;
  placement?: "up" | "down";
  variant?: "chip" | "field";
}) {
  const [source, setSource] = useState<ModelSource>("gateway");
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const { allowed: bonsaiAllowed } = useHomeGpu();

  // The source is a global setting: follow it when it changes anywhere in the app.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSource(loadModelSource());
    const onSource = (e: Event) => setSource((e as CustomEvent<ModelSource>).detail);
    window.addEventListener(MODEL_SOURCE_EVENT, onSource);
    return () => window.removeEventListener(MODEL_SOURCE_EVENT, onSource);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchModelCatalog(source, open)
      .then((data) => {
        if (cancelled) return;
        setModels(data);
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setModels([]);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source, open]);

  useEffect(() => {
    if (open) window.setTimeout(() => filterRef.current?.focus(), 60);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else setFilter("");
  }, [open]);

  usePopoverDismiss(open, () => setOpen(false), rootRef);

  const current = models?.find((m) => m.id === value);
  const label = current?.name ?? value.split("/").pop() ?? value;

  const filtered = useMemo(() => {
    if (!models) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [models, filter]);

  async function changeSource(next: ModelSource) {
    if (next === source) return;
    setSource(next);
    setModels(null);
    saveModelSource(next);
    onChange(await fetchDefaultModelForSource(next));
  }

  const sources: ModelSource[] = bonsaiAllowed ? ["gateway", "omniroute", "bonsai"] : ["gateway", "omniroute"];
  const SourceIcon = source === "bonsai" ? Cpu : Sparkles;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={
          variant === "chip"
            ? CHIP
            : "flex h-10 min-w-56 items-center gap-2 rounded-lg border border-nimbus-border bg-nimbus-surface px-3 text-[13px] text-nimbus-text transition-colors hover:border-nimbus-border-strong"
        }
      >
        <SourceIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className={`truncate ${variant === "chip" ? "max-w-[9.5rem]" : "flex-1 text-left"}`}>{label}</span>
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
        origin={placement === "up" ? "bottom left" : "top left"}
        className={`${placement === "up" ? "bottom-full mb-2" : "top-full mt-2"} left-0 flex w-80 flex-col p-1.5`}
      >
        <div className="flex flex-col gap-2 p-1.5 pb-2">
          <Segmented
            label="Model source"
            size="sm"
            value={source}
            onChange={changeSource}
            options={sources.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))}
          />
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
        <div role="listbox" aria-label="Models" className="max-h-72 overflow-y-auto border-t border-nimbus-border pt-1.5">
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
                  ? `Could not load models from ${SOURCE_LABEL[source]}.`
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
