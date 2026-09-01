"use client";

import { useEffect, useRef } from "react";

type Cell = {
  flashStart: number;
  flashDuration: number;
  color: 0 | 1 | 2; // 0 white, 1 accent blue, 2 free teal
};

type Dash = {
  x: number;
  y: number;
  w: number;
  start: number;
};

const CELL_GAP = 30;
const FLASH_CHANCE_PER_CELL_PER_FRAME = 0.012; // fast, sparse sparkle
const DASH_CHANCE_PER_FRAME = 0.05;

/** A sparse, fast-flickering grid of pixels covering the entire chat
 * surface while the assistant is thinking — full-bleed ambient texture,
 * not a small inline accent. Only animates while `active`, to keep the
 * loop off the rest of the time this stays mounted in the layout. */
export function ThinkingFieldBackground({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef(0);
  const cellsRef = useRef<Cell[]>([]);
  const dashesRef = useRef<Dash[]>([]);
  const dimsRef = useRef({ cols: 0, rows: 0, width: 0, height: 0 });

  // Mount-time setup: canvas sizing + resize observer. Runs once.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctxRef.current = ctx;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      canvas!.width = Math.max(1, width * dpr);
      canvas!.height = Math.max(1, height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.max(4, Math.round(width / CELL_GAP));
      const rows = Math.max(4, Math.round(height / CELL_GAP));
      dimsRef.current = { cols, rows, width, height };
      cellsRef.current = Array.from({ length: cols * rows }, () => ({
        flashStart: -1,
        flashDuration: 0,
        color: 0,
      }));
      dashesRef.current = [];
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    return () => ro.disconnect();
  }, []);

  // Animation loop: only runs while `active`, so this component is cheap
  // to keep mounted in the background the rest of the time.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!active || !ctx) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) return;

    function pickColor(): 0 | 1 | 2 {
      const r = Math.random();
      if (r < 0.14) return 1;
      if (r < 0.22) return 2;
      return 0;
    }

    function colorRgb(c: 0 | 1 | 2): string {
      if (c === 1) return "76, 141, 255";
      if (c === 2) return "34, 217, 160";
      return "255, 255, 255";
    }

    function frame(now: number) {
      const { cols, width, height } = dimsRef.current;
      ctx!.clearRect(0, 0, width, height);
      if (width === 0 || height === 0 || cols === 0) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const rows = dimsRef.current.rows;
      const gapX = width / cols;
      const gapY = height / rows;
      const cells = cellsRef.current;

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.flashStart < 0 && Math.random() < FLASH_CHANCE_PER_CELL_PER_FRAME) {
          cell.flashStart = now;
          cell.flashDuration = 220 + Math.random() * 260;
          cell.color = pickColor();
        }

        let alpha = 0.05;
        if (cell.flashStart >= 0) {
          const t = (now - cell.flashStart) / cell.flashDuration;
          if (t >= 1) {
            cell.flashStart = -1;
          } else {
            // fast attack, slower decay
            const intensity = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
            alpha = 0.05 + intensity * 0.75;
          }
        }

        if (alpha <= 0.051) continue;

        const col = i % cols;
        const row = (i / cols) | 0;
        const px = col * gapX + gapX / 2;
        const py = row * gapY + gapY / 2;
        const size = alpha > 0.3 ? 2.4 : 1.4;
        ctx!.fillStyle = `rgba(${colorRgb(cell.color)}, ${alpha.toFixed(3)})`;
        ctx!.fillRect(px - size / 2, py - size / 2, size, size);
      }

      if (Math.random() < DASH_CHANCE_PER_FRAME) {
        dashesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          w: 8 + Math.random() * 18,
          start: now,
        });
      }
      dashesRef.current = dashesRef.current.filter((d) => {
        const t = (now - d.start) / 140;
        if (t >= 1) return false;
        const alpha = 1 - t;
        ctx!.fillStyle = `rgba(255, 255, 255, ${(alpha * 0.5).toFixed(3)})`;
        ctx!.fillRect(d.x, d.y, d.w, 1.5);
        return true;
      });

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500 ease-[var(--nimbus-ease)] ${
        active ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
