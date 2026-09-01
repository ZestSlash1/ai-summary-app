"use client";

import { useEffect, useRef } from "react";

/** A subtle, responsive canvas of accent-colored dots displaced by a
 * layered sine wave — a lightweight, brand-colored take on a generative
 * noise-field, used as a quiet background texture while thinking. */
export function ThinkingWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let raf = 0;
    const start = performance.now();

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.max(1, width * dpr);
      canvas!.height = Math.max(1, height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const cols = 16;
    const rows = 3;

    function frame(now: number) {
      const t = (now - start) / 1000;
      ctx!.clearRect(0, 0, width, height);
      if (width === 0 || height === 0) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const gapX = width / (cols - 1);
      const gapY = height / Math.max(1, rows - 1);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = x * gapX;
          const wave =
            Math.sin(x * 0.55 + t * 1.3) * 0.5 +
            Math.sin(y * 0.9 - t * 0.9) * 0.5;
          const py = height / 2 + (rows > 1 ? (y - (rows - 1) / 2) * gapY : 0) + wave * (height * 0.28);
          const r = 1 + Math.sin(x * 0.5 + y * 0.7 + t * 1.5) * 0.5;
          const mint = (Math.sin(x * 0.35 + t * 0.6) + 1) / 2 > 0.5;
          ctx!.beginPath();
          ctx!.arc(px, py, Math.max(0.6, r), 0, Math.PI * 2);
          ctx!.fillStyle = mint
            ? "rgba(34, 217, 160, 0.3)"
            : "rgba(76, 141, 255, 0.32)";
          ctx!.fill();
        }
      }
      raf = requestAnimationFrame(frame);
    }

    if (prefersReducedMotion) {
      frame(start);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
