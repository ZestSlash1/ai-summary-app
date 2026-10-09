/**
 * ARO's mark: a speech-bubble character. A gradient bubble with a tail, a white ring, a black
 * screen inside, and a face of a few white strokes. The whole thing sits on a slight tilt.
 *
 * This file is the one source of the drawing. The React mark (components/BrandMark.tsx) renders
 * from it, and so does the script that makes the app icons (tools/brand/build-icons.mjs), so the
 * favicon and the in-app mark cannot drift apart. Plain strings and numbers, no React, so both can import it.
 *
 * The drawing lives in a 120 x 120 box.
 */

export type Mood = "idle" | "think" | "happy" | "cool";

export const MARK_SIZE = 120;
/** The whole bubble leans a little, as if it were looking at you. */
export const MARK_TILT = "rotate(-9 60 60)";
/** The tail pulls the bubble's weight down and left; this puts it back at the center of the box. */
export const MARK_NUDGE = "translate(3 -3)";

/** The bubble and its tail in one fill, so a single gradient runs across both. */
export const BUBBLE_PATH =
  "M40 14H80C99 14 114 29 114 48V60C114 79 99 94 80 94H50C41 98 31 102 15 102C13 102 12 100 13.5 98.5C17 95 19 90 18 83C10 77 6 69 6 60V48C6 29 21 14 40 14Z";

/** The white ring and the black screen it holds. */
export const SCREEN = { x: 19, y: 25, width: 82, height: 58, rx: 24, ringWidth: 5 } as const;
export const SCREEN_FILL = "#06060a";

/** Face strokes, in white. `fill` shapes are solid, the rest are round-capped lines. */
export const EYES: Record<Mood, readonly { d: string; fill?: boolean }[]> = {
  idle: [{ d: "M46 42L41.5 55" }, { d: "M75 42L70.5 55" }],
  think: [{ d: "M37 54L55 50" }, { d: "M65 50L83 46" }],
  happy: [{ d: "M41 45L51 52L41 59" }, { d: "M79 45L69 52L79 59" }],
  cool: [
    { d: "M31 46H58V51C58 57 53 60 47 60H42C35 60 31 56 31 51Z", fill: true },
    { d: "M63 46H90V51C90 57 85 60 79 60H74C67 60 63 56 63 51Z", fill: true },
  ],
};
export const EYE_STROKE = 5.5;

export type MarkColors = { from: string; to: string };

/** The brand blue: cyan at the top left down into royal blue. Used where CSS variables cannot reach (icons). */
export const BRAND_BLUE: MarkColors = { from: "#27c4ff", to: "#2b6bff" };

/** Gradient direction: top left, falling toward the bottom right. In bounding-box units. */
export const GRADIENT = { x1: 0.15, y1: 0, x2: 0.55, y2: 1 } as const;

/**
 * The mark as a standalone SVG string, in fixed colors. For files (icons, previews), not for the app,
 * which draws the same shapes in JSX with theme colors.
 */
export function markSvg({
  mood = "idle",
  colors = BRAND_BLUE,
  /** A background tile behind the bubble, or none for a transparent mark. */
  tile,
  /** How much of the tile the bubble fills (1 = the whole box). Keep near 0.62 for maskable icons. */
  scale = 1,
}: { mood?: Mood; colors?: MarkColors; tile?: { fill: string; radius: number }; scale?: number } = {}): string {
  const eyes = EYES[mood]
    .map((e) =>
      e.fill
        ? `<path d="${e.d}" fill="#fff"/>`
        : `<path d="${e.d}" stroke="#fff" stroke-width="${EYE_STROKE}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
    )
    .join("");
  const s = scale;
  const shift = (MARK_SIZE - MARK_SIZE * s) / 2;
  // The bubble's own center sits a touch low and left of the box center because of the tail; nudge it back.
  const nudge = `translate(${(3 * s).toFixed(2)} ${(-3 * s).toFixed(2)})`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_SIZE} ${MARK_SIZE}" width="${MARK_SIZE}" height="${MARK_SIZE}">` +
    `<defs><linearGradient id="g" x1="${GRADIENT.x1}" y1="${GRADIENT.y1}" x2="${GRADIENT.x2}" y2="${GRADIENT.y2}">` +
    `<stop offset="0" stop-color="${colors.from}"/><stop offset="1" stop-color="${colors.to}"/></linearGradient></defs>` +
    (tile ? `<rect width="${MARK_SIZE}" height="${MARK_SIZE}" rx="${tile.radius}" fill="${tile.fill}"/>` : "") +
    `<g transform="translate(${shift.toFixed(2)} ${shift.toFixed(2)}) scale(${s}) ${nudge}">` +
    `<g transform="${MARK_TILT}">` +
    `<path d="${BUBBLE_PATH}" fill="url(#g)"/>` +
    `<rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.width}" height="${SCREEN.height}" rx="${SCREEN.rx}" fill="${SCREEN_FILL}" stroke="#fff" stroke-width="${SCREEN.ringWidth}"/>` +
    eyes +
    `</g></g></svg>`
  );
}
