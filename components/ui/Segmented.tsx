"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap, reducedMotion } from "@/lib/motion";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Shown but not selectable; clicking calls onLocked so the caller can explain why. */
  locked?: boolean;
  hint?: string;
};

/**
 * A pill of options with an indicator that glides to the selected one, so the change
 * reads as one object moving rather than two buttons swapping colors.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  onLocked,
  label,
  size = "md",
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  onLocked?: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const indicator = indicatorRef.current;
    if (!root || !indicator) return;
    const move = (animate: boolean) => {
      const active = root.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
      if (!active) return;
      gsap.to(indicator, {
        x: active.offsetLeft,
        width: active.offsetWidth,
        autoAlpha: 1,
        duration: animate && !reducedMotion() ? 0.45 : 0,
        ease: "aro",
      });
    };
    move(placed.current);
    placed.current = true;
    // Labels can change width when fonts finish loading or the layout reflows.
    const observer = new ResizeObserver(() => move(false));
    observer.observe(root);
    return () => observer.disconnect();
  }, [value]);

  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-[13px]";

  return (
    <div
      ref={rootRef}
      role="radiogroup"
      aria-label={label}
      className="relative inline-flex rounded-[10px] border border-nimbus-border bg-nimbus-chrome p-[3px]"
    >
      <span
        ref={indicatorRef}
        aria-hidden
        style={{ visibility: "hidden" }}
        className="absolute bottom-[3px] left-0 top-[3px] rounded-[7px] border border-nimbus-border bg-nimbus-surface-2 shadow-[var(--nimbus-inset-highlight),var(--nimbus-shadow)]"
      />
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={opt.locked || undefined}
            title={opt.hint}
            data-value={opt.value}
            onClick={() => (opt.locked ? onLocked?.(opt.value) : onChange(opt.value))}
            className={`relative z-10 inline-flex items-center gap-1.5 rounded-[7px] font-medium transition-colors duration-300 ${pad} ${
              selected
                ? "text-nimbus-text"
                : opt.locked
                  ? "text-nimbus-text-faint hover:text-nimbus-text-muted"
                  : "text-nimbus-text-muted hover:text-nimbus-text"
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
