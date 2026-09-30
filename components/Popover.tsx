"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { gsap, useGSAP, reducedMotion } from "@/lib/motion";

/** Closes an open popover on an outside press or the Escape key. */
export function usePopoverDismiss(
  open: boolean,
  onClose: () => void,
  ref: RefObject<HTMLElement | null>
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, ref]);
}

// Constant object: React sets it once, then GSAP owns visibility and opacity.
const HIDDEN_STYLE = { visibility: "hidden", opacity: 0 } as const;

/**
 * A floating panel that springs out of its trigger and folds back when closed.
 * It stays mounted while closed, so children keep their state between openings.
 * `origin` is the corner nearest the trigger, used as the scale origin.
 */
export function PopoverPanel({
  open,
  className = "",
  origin = "bottom left",
  children,
}: {
  open: boolean;
  className?: string;
  origin?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  useGSAP(
    () => {
      const el = panelRef.current;
      if (!el) return;
      if (!mounted.current) {
        mounted.current = true;
        if (!open) return;
      }
      gsap.killTweensOf(el);
      gsap.set(el, { transformOrigin: origin });
      if (open) {
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: origin.startsWith("bottom") ? 6 : -6, scale: 0.97 },
          { autoAlpha: 1, y: 0, scale: 1, duration: reducedMotion() ? 0 : 0.3, ease: "aro" }
        );
      } else {
        gsap.to(el, {
          autoAlpha: 0,
          y: origin.startsWith("bottom") ? 4 : -4,
          scale: 0.98,
          duration: reducedMotion() ? 0 : 0.14,
          ease: "aro-in",
        });
      }
    },
    { dependencies: [open] }
  );

  return (
    <div
      ref={panelRef}
      style={HIDDEN_STYLE}
      aria-hidden={!open}
      className={`nimbus-glass absolute z-40 max-w-[calc(100vw-2rem)] rounded-[14px] border border-nimbus-border-strong bg-nimbus-surface/95 text-nimbus-text shadow-[var(--nimbus-shadow-lift)] ${className}`}
    >
      {children}
    </div>
  );
}
