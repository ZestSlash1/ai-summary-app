"use client";

import { useEffect, useId, useState, type RefObject } from "react";
import { canRefract, edgeMap } from "@/lib/liquidGlass";

/*
 * Real refraction for one glass element. A displacement map shaped to the element's box
 * leaves the middle alone and bends what sits behind its rim, the way the edge of a lens
 * does. Only Chromium runs an SVG filter inside backdrop-filter, and only Chromium ships
 * User-Agent Client Hints, so that is the test; everywhere else the frosted glass stands.
 * Technique after kube.io's "Liquid Glass in the browser" and the WebTricks write-up.
 */

export function LiquidRefraction({
  target,
  bevel = 22,
  strength = 26,
  frost = "blur(20px) saturate(1.8)",
}: {
  target: RefObject<HTMLElement | null>;
  /** How far in from the rim the bending reaches, in px. */
  bevel?: number;
  /** The largest shift at the very edge, in px (the displacement scale). */
  strength?: number;
  /** The frost under the bend: the same backdrop the plain glass uses. */
  frost?: string;
}) {
  const id = `aro-refract-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = target.current;
    if (!el || !canRefract()) return;
    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  useEffect(() => {
    const el = target.current;
    if (!el || !size) return;
    const value = `${frost} url(#${id})`;
    el.style.setProperty("backdrop-filter", value);
    el.style.setProperty("-webkit-backdrop-filter", value);
    return () => {
      el.style.removeProperty("backdrop-filter");
      el.style.removeProperty("-webkit-backdrop-filter");
    };
  }, [target, size, frost, id]);

  if (!size || size.w < 8 || size.h < 8) return null;
  const { w, h } = size;
  return (
    <svg aria-hidden width="0" height="0" className="pointer-events-none absolute">
      <filter
        id={id}
        x="0"
        y="0"
        width={w}
        height={h}
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feImage href={edgeMap(w, bevel, "x")} x="0" y="0" width={w} height={h} preserveAspectRatio="none" result="dx" />
        <feImage href={edgeMap(h, bevel, "y")} x="0" y="0" width={w} height={h} preserveAspectRatio="none" result="dy" />
        <feComposite in="dx" in2="dy" operator="arithmetic" k2="1" k3="1" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale={strength} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
