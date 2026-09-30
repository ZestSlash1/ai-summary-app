"use client";

import { forwardRef, useId } from "react";

/**
 * ARO's mark: a single-story "a" (bowl and stem) with a spark above the stem.
 * Drawn with strokes so the welcome screen can draw it on with DrawSVG.
 * Paths carry data-mark attributes for animation targets. With `aurora`, the strokes carry
 * the brand light (blue into violet) and the spark turns cyan.
 */
export const BrandMark = forwardRef<SVGSVGElement, { className?: string; strokeWidth?: number; aurora?: boolean }>(
  function BrandMark({ className, strokeWidth = 2.6, aurora = false }, ref) {
    const gradientId = `aro-mark-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
    const stroke = aurora ? `url(#${gradientId})` : "currentColor";
    return (
      <svg
        ref={ref}
        viewBox="0 0 32 32"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        {aurora && (
          <defs>
            <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="6" y1="27" x2="26" y2="9">
              <stop offset="0" stopColor="var(--aro-aurora-1)" />
              <stop offset="1" stopColor="var(--aro-aurora-2)" />
            </linearGradient>
          </defs>
        )}
        <circle
          data-mark="bowl"
          cx="14.5"
          cy="17.5"
          r="7"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          transform="rotate(-90 14.5 17.5)"
        />
        <path
          data-mark="stem"
          d="M21.5 12v12.5"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <circle data-mark="spark" cx="25.5" cy="6.5" r="2.3" fill={aurora ? "var(--aro-aurora-3)" : "var(--nimbus-accent)"} />
      </svg>
    );
  }
);

/** The mark on a filled accent tile, used as the app icon in the sidebar. */
export function BrandTile({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span
      className={`aro-gel relative flex shrink-0 items-center justify-center rounded-[8px] bg-nimbus-accent text-white ${className}`}
    >
      <svg viewBox="0 0 32 32" fill="none" className="h-[70%] w-[70%]" aria-hidden="true">
        <circle cx="14.5" cy="17.5" r="7" stroke="currentColor" strokeWidth="3" />
        <path d="M21.5 12v12.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="25.5" cy="6.5" r="2.4" fill="currentColor" />
      </svg>
    </span>
  );
}

/** Small round assistant avatar next to replies. */
export function AssistantAvatar({ live = false }: { live?: boolean }) {
  return (
    <span
      data-live={live || undefined}
      className="aro-avatar flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-transparent text-nimbus-text [background:linear-gradient(var(--nimbus-surface),var(--nimbus-surface))_padding-box,linear-gradient(135deg,var(--aro-aurora-1),var(--aro-aurora-2)_55%,var(--aro-aurora-3))_border-box]"
    >
      <BrandMark className="h-[17px] w-[17px]" strokeWidth={2.8} />
    </span>
  );
}

export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
