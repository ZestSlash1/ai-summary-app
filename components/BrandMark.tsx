"use client";

import { forwardRef, useId } from "react";
import {
  BUBBLE_PATH,
  EYES,
  EYE_STROKE,
  GRADIENT,
  MARK_NUDGE,
  MARK_SIZE,
  MARK_TILT,
  SCREEN,
  SCREEN_FILL,
  type Mood,
} from "@/lib/aroMark";

/**
 * ARO's mark: a speech-bubble character. The drawing comes from lib/aroMark.ts, the same source
 * the app icons are built from. Its gradient runs from the brand cyan into the brand blue through
 * the aurora tokens, so it follows the accent a user picks in Mods.
 *
 * `mood` changes the face: "idle" by default, "think" while a reply is on its way, "happy", "cool".
 * Parts carry data-mark attributes for animation: the welcome screen pops the bubble in, wakes the
 * eyes, and the blink in app/globals.css runs on the eyes.
 */
export const BrandMark = forwardRef<SVGSVGElement, { className?: string; mood?: Mood }>(function BrandMark(
  { className, mood = "idle" },
  ref,
) {
  const gradientId = `aro-mark-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  return (
    <svg ref={ref} viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`} fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1={GRADIENT.x1} y1={GRADIENT.y1} x2={GRADIENT.x2} y2={GRADIENT.y2}>
          <stop offset="0" stopColor="var(--aro-aurora-3)" />
          <stop offset="1" stopColor="var(--aro-aurora-1)" />
        </linearGradient>
      </defs>
      <g transform={`${MARK_NUDGE} ${MARK_TILT}`}>
        <g data-mark="bubble">
          <path d={BUBBLE_PATH} fill={`url(#${gradientId})`} />
          <rect
            x={SCREEN.x}
            y={SCREEN.y}
            width={SCREEN.width}
            height={SCREEN.height}
            rx={SCREEN.rx}
            fill={SCREEN_FILL}
            stroke="#fff"
            strokeWidth={SCREEN.ringWidth}
          />
          <g data-mark="eyes" data-mood={mood}>
            {EYES[mood].map((eye) =>
              eye.fill ? (
                <path key={eye.d} d={eye.d} fill="#fff" />
              ) : (
                <path key={eye.d} d={eye.d} stroke="#fff" strokeWidth={EYE_STROKE} strokeLinecap="round" strokeLinejoin="round" />
              ),
            )}
          </g>
        </g>
      </g>
    </svg>
  );
});

/** The mark on a dark tile, the app icon as it shows in the sidebar and headers. */
export function BrandTile({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-[8px] bg-[#09090c] ring-1 ring-inset ring-white/10 ${className}`}
    >
      <BrandMark className="h-[84%] w-[84%]" />
    </span>
  );
}

/** The assistant beside its replies. It looks thoughtful while a reply is on its way. */
export function AssistantAvatar({ live = false }: { live?: boolean }) {
  return (
    <span data-live={live || undefined} className="aro-avatar flex h-7 w-7 shrink-0 items-center justify-center">
      <BrandMark mood={live ? "think" : "idle"} className="h-full w-full" />
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
