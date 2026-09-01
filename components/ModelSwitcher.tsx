"use client";

import { useEffect, useRef, useState } from "react";
import type { ModelOption } from "@/lib/types";
import { PopoverPanel, usePopoverDismiss } from "./Popover";

export function ModelSwitcher({
  value,
  onChange,
}: {
  value: string;
  onChange: (modelId: string) => void;
}) {
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: ModelOption[]) => {
        if (!cancelled) setModels(data);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  usePopoverDismiss(open, () => setOpen(false), rootRef);

  const current = models?.find((m) => m.id === value);
  const label = current?.name ?? value.split("/").pop() ?? value;

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

      <PopoverPanel open={open} className="bottom-full left-0 mb-2 max-h-72 w-72 overflow-y-auto p-1.5">
        {models === null && (
          <p className="px-3 py-2 text-sm text-nimbus-text-muted">Loading models…</p>
        )}
        {models?.length === 0 && (
          <p className="px-3 py-2 text-sm text-nimbus-text-muted">Couldn&apos;t load models.</p>
        )}
        {models?.map((m) => (
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
      </PopoverPanel>
    </div>
  );
}
