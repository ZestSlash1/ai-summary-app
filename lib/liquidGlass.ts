/**
 * Only Chromium runs an SVG filter inside backdrop-filter, and only Chromium ships User-Agent
 * Client Hints, so that is the test. A visitor who asked for less transparency gets none.
 */
export function canRefract(): boolean {
  if (typeof window === "undefined" || !("userAgentData" in navigator)) return false;
  return !window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
}

/**
 * A one-axis displacement map as an SVG data URL: full push at the leading edge (255), easing
 * to neutral (128) over the bevel, and the opposite push (0) at the trailing edge. The x map
 * lives in the red channel and the y map in the green one, so the two add into one map.
 */
export function edgeMap(length: number, bevel: number, axis: "x" | "y"): string {
  const b = Math.min(bevel, length / 2) / length;
  const color = (v: number) => (axis === "x" ? `rgb(${v},0,0)` : `rgb(0,${v},0)`);
  const [w, h] = axis === "x" ? [length, 1] : [1, length];
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' preserveAspectRatio='none'>` +
    `<linearGradient id='g' x1='0' y1='0' x2='${axis === "x" ? 1 : 0}' y2='${axis === "y" ? 1 : 0}'>` +
    `<stop offset='0' stop-color='${color(255)}'/>` +
    `<stop offset='${(b * 0.35).toFixed(4)}' stop-color='${color(176)}'/>` +
    `<stop offset='${b.toFixed(4)}' stop-color='${color(128)}'/>` +
    `<stop offset='${(1 - b).toFixed(4)}' stop-color='${color(128)}'/>` +
    `<stop offset='${(1 - b * 0.35).toFixed(4)}' stop-color='${color(80)}'/>` +
    `<stop offset='1' stop-color='${color(0)}'/>` +
    `</linearGradient><rect width='${w}' height='${h}' fill='url(%23g)'/></svg>`;
  return `data:image/svg+xml,${svg.replace(/</g, "%3C").replace(/>/g, "%3E")}`;
}
