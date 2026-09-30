"use client";

import { useEffect, useRef, type RefObject } from "react";
import { gsap, reducedMotion } from "@/lib/motion";
import { THEME_EVENT } from "@/lib/theme";

/**
 * ARO's ambient field, the sibling of getsourced.dev's pipeline hero. Particles stand for
 * what goes into a reply (your prompt, repo files, tools, the model) and stream across the
 * panel into a slow tilted vortex around the ARO mark. A few come out the other side as
 * brighter blue points: the answer. They part around the cursor.
 *
 * Canvas 2D with pre-rendered glow sprites, so there is no WebGL dependency. It only runs
 * while `active` and on screen, and settles to a single still frame under reduced motion.
 */

type Palette = { kinds: string[]; weights: number[]; out: string; additive: boolean; alpha: number };

// prompt, repo files, tools, model
const DARK: Palette = {
  kinds: ["#e6e6ea", "#7ea9ff", "#c58db0", "#57d3e0"],
  weights: [0.2, 0.44, 0.2, 0.16],
  out: "#a9c6ff",
  additive: true,
  alpha: 0.8,
};
const LIGHT: Palette = {
  kinds: ["#52525b", "#135feb", "#986384", "#0e7490"],
  weights: [0.2, 0.44, 0.2, 0.16],
  out: "#135feb",
  additive: false,
  alpha: 0.55,
};

const SPRITE_PX = 32;
const PAD = 60; // particles start and end just off the canvas edges

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function makeSprite(color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = SPRITE_PX;
  const g = c.getContext("2d")!;
  const r = SPRITE_PX / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, rgba(color, 1));
  grad.addColorStop(0.16, rgba(color, 0.95));
  grad.addColorStop(0.42, rgba(color, 0.22));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  return c;
}

/** Light theme when the surface behind the canvas is bright. Reads the resolved color. */
function surfaceIsLight(el: HTMLElement | null): boolean {
  for (let node = el; node; node = node.parentElement) {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(node).backgroundColor);
    if (m && (m[4] === undefined || Number(m[4]) > 0.5)) {
      return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 > 0.5;
    }
  }
  return false;
}

export function AroField({
  active,
  scopeRef,
}: {
  active: boolean;
  /** Element to search for [data-field-focus], the point the vortex turns around. */
  scopeRef: RefObject<HTMLElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const controlRef = useRef<{ setActive: (on: boolean) => void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const still = reducedMotion();
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);

    let W = 0;
    let H = 0;
    let cx = 0;
    let cy = 0;
    let band = 0;
    let pullW = 0;
    let ringR = 0;
    let count = 0;

    // Particle state in flat typed arrays: cheap to iterate every frame.
    let t = new Float32Array(0);
    let speed = new Float32Array(0);
    let lane = new Float32Array(0);
    let seed = new Float32Array(0);
    let size = new Float32Array(0);
    let kind = new Uint8Array(0);
    let survives = new Uint8Array(0);

    let palette = surfaceIsLight(canvas) ? LIGHT : DARK;
    let sprites = palette.kinds.map(makeSprite);
    let outSprite = makeSprite(palette.out);

    const pointer = { x: -9999, y: -9999, on: false, sx: -9999, sy: -9999 };

    function seedParticles(n: number) {
      count = n;
      t = new Float32Array(n);
      speed = new Float32Array(n);
      lane = new Float32Array(n);
      seed = new Float32Array(n);
      size = new Float32Array(n);
      kind = new Uint8Array(n);
      survives = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        t[i] = Math.random();
        speed[i] = 0.028 + Math.random() * 0.04;
        // Denser near the middle of the band, like a stream rather than a sheet.
        lane[i] = (Math.random() + Math.random() + Math.random() - 1.5) * 0.85;
        seed[i] = Math.random() * 1000;
        survives[i] = Math.random() < 0.16 ? 1 : 0;
        size[i] = survives[i] ? 1.9 + Math.random() * 1.4 : 1.1 + Math.random() * 1.3;
        let r = Math.random();
        let k = 0;
        while (k < palette.weights.length - 1 && r > palette.weights[k]) r -= palette.weights[k++];
        kind[i] = k;
      }
    }

    function measureFocus() {
      const rect = canvas!.getBoundingClientRect();
      const focus = scopeRef.current?.querySelector<HTMLElement>("[data-field-focus]");
      if (focus) {
        const f = focus.getBoundingClientRect();
        cx = f.left + f.width / 2 - rect.left;
        cy = f.top + f.height / 2 - rect.top;
      } else {
        cx = W * 0.5;
        cy = H * 0.4;
      }
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      W = rect.width;
      H = rect.height;
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      band = Math.min(H * 0.46, 380);
      pullW = Math.min(Math.max(W * 0.15, 90), 200);
      ringR = Math.min(Math.max(Math.min(W, H) * 0.13, 62), 118);
      const target = Math.round(Math.min(Math.max((W * H) / 950, 260), coarse ? 420 : 1100));
      if (Math.abs(target - count) > 40) seedParticles(target);
      measureFocus();
      return true;
    }

    let elapsed = 0;

    function step(dt: number) {
      elapsed += dt;
      pointer.sx += (pointer.x - pointer.sx) * 0.12;
      pointer.sy += (pointer.y - pointer.sy) * 0.12;
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      ctx!.globalCompositeOperation = palette.additive ? "lighter" : "source-over";
      const span = W + PAD * 2;
      const exitSpan = Math.max(W + PAD - cx, 1);
      const repelR = 110;

      for (let i = 0; i < count; i++) {
        const s = seed[i];
        const xBase = -PAD + t[i] * span;
        let x = xBase;
        let y = cy + lane[i] * band * 0.5;
        y += Math.sin(elapsed * 0.6 + s) * 7 + Math.sin(elapsed * 0.23 + s * 1.7) * 5;

        // The vortex: a tilted ring around the mark, pulling hardest at the center.
        const d = (xBase - cx) / pullW;
        const pull = Math.exp(-d * d);
        const angle = elapsed * 1.25 + s;
        const r = ringR * (0.72 + 0.56 * ((s * 7.13) % 1));
        const ox = Math.cos(angle) * r;
        const oy = Math.sin(angle) * r * 0.38;
        x = x * (1 - pull) + (cx + ox) * pull;
        y = y * (1 - pull * 0.9) + (cy + oy) * pull * 0.9;
        const depth = Math.sin(angle) * pull; // -1 behind the mark, 1 in front

        let bright = 1;
        let mix = 0;
        if (xBase > cx) {
          const past = Math.min((xBase - cx) / exitSpan, 1);
          if (survives[i]) {
            mix = Math.min(past * 2.4, 1);
            y -= past * H * 0.07;
          } else {
            bright = Math.max(0, 1 - past * 1.7);
          }
        }
        if (t[i] < 0.05) bright *= t[i] / 0.05;
        if (bright <= 0.01) continue;

        if (pointer.on) {
          const dx = x - pointer.sx;
          const dy = y - pointer.sy;
          const dist = Math.hypot(dx, dy);
          if (dist < repelR) {
            const force = (1 - dist / repelR) * 26;
            x += (dx / (dist + 0.001)) * force;
            y += (dy / (dist + 0.001)) * force;
          }
        }

        const radius = size[i] * (1 + depth * 0.35) * 2.6;
        const alpha = bright * palette.alpha * (0.7 + depth * 0.3);
        if (mix < 1) {
          ctx!.globalAlpha = alpha * (1 - mix);
          ctx!.drawImage(sprites[kind[i]], x - radius, y - radius, radius * 2, radius * 2);
        }
        if (mix > 0) {
          ctx!.globalAlpha = alpha * mix;
          ctx!.drawImage(outSprite, x - radius * 1.15, y - radius * 1.15, radius * 2.3, radius * 2.3);
        }
      }
      ctx!.globalAlpha = 1;
    }

    function advance(dt: number) {
      for (let i = 0; i < count; i++) {
        t[i] += dt * speed[i];
        if (t[i] > 1) t[i] -= 1;
      }
      step(dt);
    }

    // --- run loop, only while wanted and visible ---
    let raf = 0;
    let last = 0;
    let frame = 0;
    let visible = true;
    let wanted = activeRef.current;

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      if (++frame % 30 === 0) measureFocus();
      advance(dt);
      draw();
    }

    function sync() {
      const run = wanted && visible && !document.hidden && !still;
      if (run && !raf) {
        last = 0;
        raf = requestAnimationFrame(loop);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function renderStill() {
      // Reduced motion: let the stream develop off screen, then show one calm frame.
      if (!resize()) return;
      for (let k = 0; k < 120; k++) advance(1 / 30);
      draw();
    }

    resize();
    if (still) renderStill();

    gsap.set(canvas, { autoAlpha: wanted ? 1 : 0 });
    controlRef.current = {
      setActive(on: boolean) {
        gsap.killTweensOf(canvas);
        if (on) {
          wanted = true;
          sync();
          gsap.to(canvas, { autoAlpha: 1, duration: still ? 0 : 1.2, ease: "power1.out" });
        } else {
          // Keep drawing through the fade, then stop the loop.
          gsap.to(canvas, {
            autoAlpha: 0,
            duration: still ? 0 : 0.6,
            ease: "power1.in",
            onComplete: () => {
              wanted = false;
              sync();
            },
          });
        }
      },
    };
    sync();

    const onResize = () => {
      if (resize() && still) renderStill();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(canvas);

    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) resize();
      sync();
    });
    visibility.observe(canvas);

    const onVisibility = () => sync();
    document.addEventListener("visibilitychange", onVisibility);

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      if (!pointer.on) {
        pointer.sx = pointer.x;
        pointer.sy = pointer.y;
      }
      pointer.on = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= W && pointer.y <= H;
    };
    const onPointerLeave = () => (pointer.on = false);
    if (!coarse && !still) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
    }

    const retheme = () => {
      palette = surfaceIsLight(canvas) ? LIGHT : DARK;
      sprites = palette.kinds.map(makeSprite);
      outSprite = makeSprite(palette.out);
      if (still) renderStill();
    };
    // The theme attribute changes first; the resolved colors are readable a frame later.
    const onTheme = () => requestAnimationFrame(retheme);
    const schemeQuery = window.matchMedia("(prefers-color-scheme: light)");
    window.addEventListener(THEME_EVENT, onTheme);
    schemeQuery.addEventListener("change", onTheme);

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      controlRef.current = null;
      resizeObserver.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener(THEME_EVENT, onTheme);
      schemeQuery.removeEventListener("change", onTheme);
      gsap.killTweensOf(canvas);
    };
  }, [scopeRef]);

  useEffect(() => {
    activeRef.current = active;
    controlRef.current?.setActive(active);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
      style={{ visibility: "hidden", opacity: 0 }}
    />
  );
}

