"use client";

import { useEffect, useRef } from "react";
import { reducedMotion } from "@/lib/motion";
import { THEME_EVENT, surfaceIsLight } from "@/lib/theme";
import { createGlowDriver, createGlowRenderer, type GlowDriver, type GlowRenderer } from "@/lib/aroGlow";

/** Where the current turn is: nothing in flight, waiting on the model, or words arriving. */
export type GlowPhase = "idle" | "thinking" | "answering";

/**
 * The reply glow behind the thread (see lib/aroGlow.ts): light rises when a message is sent,
 * cycles through the palette while the model thinks, then sweeps back to blue and fades once
 * the answer starts. It draws only while a turn is in flight and the panel is on screen, at
 * the display's full resolution (capped at 2x). Without WebGL there is simply no glow.
 */
export function AroGlow({ phase }: { phase: GlowPhase }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const driverRef = useRef<GlowDriver | null>(null);
  const wakeRef = useRef<() => void>(() => {});
  const settleRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const driver = createGlowDriver({ still: reducedMotion() });
    driverRef.current = driver;
    let renderer: GlowRenderer | null = null;
    let light = surfaceIsLight(canvas);
    let raf = 0;
    let last = 0;
    let visible = true;
    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

    function build() {
      try {
        renderer = createGlowRenderer(canvas!);
        renderer?.resize(dpr());
      } catch (err) {
        console.warn(err);
        renderer = null;
      }
    }

    function frame(now: number) {
      raf = 0;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
      last = now;
      renderer?.draw(driver.step(dt), light);
      wake();
    }

    const onScreen = () => visible && !document.hidden;
    function wake() {
      if (raf || !renderer || !driver.running || !onScreen()) return;
      raf = requestAnimationFrame(frame);
    }
    // Only a turn still in flight is worth resuming. A reply that landed while nobody was
    // looking should not replay its finish when they come back: drop it to dark instead.
    function settle() {
      if (driver.thinking || onScreen()) return;
      driver.reset();
      renderer?.clear();
    }
    function sleep() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0; // a paused glow resumes where it was, not where the clock got to
      settle();
    }
    wakeRef.current = wake;
    settleRef.current = settle;
    build();

    const resizeObserver = new ResizeObserver(() => renderer?.resize(dpr()));
    resizeObserver.observe(canvas);

    // Inactive tabs keep their panel mounted but hidden: stop drawing there.
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake();
      else sleep();
    });
    visibility.observe(canvas);

    const onVisibility = () => (document.hidden ? sleep() : wake());
    document.addEventListener("visibilitychange", onVisibility);

    // The theme attribute changes first; the resolved colors are readable a frame later.
    const onTheme = () => requestAnimationFrame(() => (light = surfaceIsLight(canvas)));
    const schemeQuery = window.matchMedia("(prefers-color-scheme: light)");
    window.addEventListener(THEME_EVENT, onTheme);
    schemeQuery.addEventListener("change", onTheme);

    // GPUs reset (driver updates, switching graphics): rebuild instead of going dark for good.
    const onLost = (e: Event) => {
      e.preventDefault();
      sleep();
      renderer = null;
    };
    const onRestored = () => {
      build();
      wake();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    return () => {
      sleep();
      wakeRef.current = () => {};
      settleRef.current = () => {};
      driverRef.current = null;
      resizeObserver.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(THEME_EVENT, onTheme);
      schemeQuery.removeEventListener("change", onTheme);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      (renderer as GlowRenderer | null)?.dispose();
    };
  }, []);

  useEffect(() => {
    const driver = driverRef.current;
    if (!driver) return;
    if (phase === "idle") {
      driver.release();
      settleRef.current();
    } else {
      driver.think(); // no-op while this turn is already thinking
      if (phase === "answering") driver.answer();
    }
    wakeRef.current();
  }, [phase]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-phase={phase}
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
    />
  );
}
