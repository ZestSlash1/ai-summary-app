"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelOption } from "@/lib/types";
import { loadModelSource } from "@/lib/storage";
import { PopoverPanel, usePopoverDismiss } from "./Popover";

export function ModelSwitcher({
  value,
  onChange,
}: {
  value: string;
  onChange: (modelId: string) => void;
}) {
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetches on mount (so the pill shows a real label immediately) and
    // again on every open (the model source is a global setting that can
    // change on this same page — Settings, right next to the source
    // toggle — so a mount-only fetch could show a stale list once opened).
    let cancelled = false;
    const source = loadModelSource();
    fetch(`/api/models?source=${source}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Failed to load models.");
        return body as ModelOption[];
      })
      .then((data) => {
        if (!cancelled) {
          setModels(data);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setModels([]);
          setLoadError(err instanceof Error ? err.message : "Failed to load models.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  usePopoverDismiss(open, () => setOpen(false), rootRef);

  const current = models?.find((m) => m.id === value);
  const label = current?.name ?? value.split("/").pop() ?? value;

  const filtered = useMemo(() => {
    if (!models) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.name.toLowerCase().includes(q));
  }, [models, filter]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-[var(--nimbus-radius-pill)] border border-nimbus-border bg-nimbus-surface px-3.5 py-2 text-sm font-medium text-nimbus-text shadow-[var(--nimbus-shadow)] transition-[transform,border-color] duration-300 ease-[var(--nimbus-ease)] hover:border-nimbus-accent/40 active:scale-[0.97]"
      >
        <span className="max-w-[10rem] truncate">{label}</span>
        {current?.free && (
          <span className="rounded-[var(--nimbus-radius-pill)] bg-nimbus-free-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-nimbus-free">
            Free
          </span>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`text-nimbus-text-muted transition-transform duration-300 ease-[var(--nimbus-ease)] ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M1.5 3.5 5 7l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <PopoverPanel open={open} className="bottom-full left-0 mb-2 flex w-72 flex-col p-1.5">
        {models !== null && models.length > 8 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter models…"
            className="mb-1.5 shrink-0 rounded-lg border border-nimbus-border bg-nimbus-bg px-2.5 py-1.5 text-sm text-nimbus-text placeholder:text-nimbus-text-muted focus:outline-none"
          />
        )}
        <div className="max-h-64 overflow-y-auto">
          {models === null && (
            <p className="px-3 py-2 text-sm text-nimbus-text-muted">Loading models…</p>
          )}
          {models?.length === 0 && (
            <p className="px-3 py-2 text-sm text-nimbus-text-muted">
              {loadError || "Couldn't load models."}
            </p>
          )}
          {filtered?.length === 0 && models && models.length > 0 && (
            <p className="px-3 py-2 text-sm text-nimbus-text-muted">No matches.</p>
          )}
          {filtered?.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors duration-200 ease-[var(--nimbus-ease)] ${
                m.id === value
                  ? "bg-nimbus-accent-soft text-nimbus-accent"
                  : "text-nimbus-text hover:bg-nimbus-bg"
              }`}
            >
              <span className="truncate">{m.name}</span>
              {m.free && (
                <span className="shrink-0 rounded-[var(--nimbus-radius-pill)] bg-nimbus-free-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-nimbus-free">
                  Free
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverPanel>
    </div>
  );
}
