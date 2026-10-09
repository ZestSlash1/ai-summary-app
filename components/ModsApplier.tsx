"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_MODS, modAttributes } from "@/lib/mods";
import { useMods } from "@/lib/useMods";

/**
 * Puts the mod state on <html> as data-mod-* attributes, which app/globals.css styles from, and
 * runs the one mod that needs the pointer: the spotlight. Renders no content of its own besides
 * the spotlight layer, which stays hidden unless that mod is on.
 */
export function ModsApplier() {
  const { mods } = useMods();
  const spotlight = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Until the saved state has been read, `mods` is the shared defaults object. The boot script
    // in the page head has already applied the saved choices, so do not paint the defaults over them.
    if (mods === DEFAULT_MODS) return;
    const root = document.documentElement;
    for (const [name, value] of Object.entries(modAttributes(mods))) root.setAttribute(name, value);
  }, [mods]);

  useEffect(() => {
    const layer = spotlight.current;
    if (!mods.spotlight || !layer) return;
    let frame = 0;
    const follow = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        layer.style.setProperty("--spot-x", `${e.clientX}px`);
        layer.style.setProperty("--spot-y", `${e.clientY}px`);
      });
    };
    window.addEventListener("pointermove", follow, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", follow);
    };
  }, [mods.spotlight]);

  return <div ref={spotlight} aria-hidden className="aro-spotlight" />;
}
