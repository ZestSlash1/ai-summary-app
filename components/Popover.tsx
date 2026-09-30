"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { gsap, useGSAP, reducedMotion } from "@/lib/motion";

export type PopoverPlacement = "top-start" | "top-end" | "bottom-start" | "bottom-end";

const GAP = 8;
const EDGE = 8;
// Below this width a popover becomes a bottom sheet: easier to reach, never off screen.
const SHEET_QUERY = "(max-width: 639px)";

function subscribeNothing() {
  return () => {};
}

/** True once on the client, so the portal is only created where `document` exists. */
function useIsClient() {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

// Constant object: React sets it once, then GSAP owns visibility and opacity.
const HIDDEN_STYLE = { visibility: "hidden", opacity: 0, top: 0, left: 0 } as const;

/**
 * A floating panel anchored to a trigger. It renders into document.body, so a scrolling
 * or clipped parent (a chip row, a sidebar list) can never cut it off, and it flips to
 * the other side when there is no room. On phones it slides up as a bottom sheet.
 * It stays mounted while closed, so its contents keep their state between openings.
 */
export function PopoverPanel({
  open,
  onClose,
  anchorRef,
  placement = "top-start",
  width = 288,
  className = "",
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  placement?: PopoverPlacement;
  width?: number;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const isClient = useIsClient();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef(false);
  const mounted = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  /** Places the panel next to its anchor, flipping sides and clamping to the viewport. */
  function position() {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;
    const sheet = window.matchMedia(SHEET_QUERY).matches;
    sheetRef.current = sheet;
    panel.dataset.sheet = sheet ? "true" : "false";
    if (sheet) {
      gsap.set(panel, { left: EDGE, right: EDGE, top: "auto", bottom: EDGE, width: "auto", maxHeight: "78dvh" });
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - EDGE * 2);
    gsap.set(panel, { width: w, right: "auto", bottom: "auto" });
    const h = panel.offsetHeight;
    const wantsTop = placement.startsWith("top");
    const roomAbove = rect.top - GAP - EDGE;
    const roomBelow = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = wantsTop ? h <= roomAbove || roomAbove > roomBelow : !(h <= roomBelow) && roomAbove > roomBelow;
    const maxH = Math.max(160, above ? roomAbove : roomBelow);
    const top = above ? rect.top - GAP - Math.min(h, maxH) : rect.bottom + GAP;
    const rawLeft = placement.endsWith("end") ? rect.right - w : rect.left;
    const left = Math.min(Math.max(rawLeft, EDGE), window.innerWidth - w - EDGE);
    // With a unit: GSAP left a bare number off max-height (it starts as "none"), so tall panels ran off screen.
    gsap.set(panel, { top, left, maxHeight: `${maxH}px`, transformOrigin: `${placement.endsWith("end") ? "right" : "left"} ${above ? "bottom" : "top"}` });
  }

  useGSAP(
    () => {
      const panel = panelRef.current;
      const backdrop = backdropRef.current;
      if (!panel || !backdrop) return;
      if (!mounted.current) {
        mounted.current = true;
        if (!open) return;
      }
      const fast = reducedMotion();
      gsap.killTweensOf([panel, backdrop]);
      if (open) {
        position();
        if (sheetRef.current) {
          gsap.to(backdrop, { autoAlpha: 1, duration: fast ? 0 : 0.3 });
          gsap.fromTo(panel, { autoAlpha: 1, yPercent: 100, y: 0, scale: 1 }, { yPercent: 0, duration: fast ? 0 : 0.5, ease: "aro" });
        } else {
          gsap.set(backdrop, { autoAlpha: 0 });
          gsap.fromTo(
            panel,
            { autoAlpha: 0, yPercent: 0, y: placement.startsWith("top") ? 6 : -6, scale: 0.97 },
            { autoAlpha: 1, y: 0, scale: 1, duration: fast ? 0 : 0.3, ease: "aro" }
          );
        }
      } else if (sheetRef.current) {
        gsap.to(backdrop, { autoAlpha: 0, duration: fast ? 0 : 0.25 });
        gsap.to(panel, { yPercent: 100, duration: fast ? 0 : 0.3, ease: "aro-in", onComplete: () => gsap.set(panel, { autoAlpha: 0 }) });
      } else {
        gsap.to(panel, { autoAlpha: 0, scale: 0.98, duration: fast ? 0 : 0.14, ease: "aro-in" });
      }
    },
    { dependencies: [open, isClient] }
  );

  // While open: follow the anchor on scroll and resize, and close on an outside press or Escape.
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => position();
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCloseRef.current();
      anchorRef.current?.focus();
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    const observer = new ResizeObserver(reposition);
    if (panelRef.current) observer.observe(panelRef.current);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!isClient) return null;

  return createPortal(
    <>
      <div
        ref={backdropRef}
        aria-hidden
        style={{ visibility: "hidden", opacity: 0 }}
        className="fixed inset-0 z-[58] bg-black/45 backdrop-blur-[2px] sm:hidden"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={label}
        aria-hidden={!open}
        style={HIDDEN_STYLE}
        className={`aro-glass aro-glass-thick fixed z-[59] flex flex-col overflow-y-auto overscroll-contain rounded-[16px] border text-nimbus-text data-[sheet=true]:rounded-[22px] data-[sheet=true]:pb-[max(0.5rem,env(safe-area-inset-bottom))] ${className}`}
      >
        <span aria-hidden className="mx-auto mb-1 mt-2 hidden h-1 w-9 shrink-0 rounded-full bg-nimbus-border-strong [[data-sheet=true]>&]:block" />
        {children}
      </div>
    </>,
    document.body
  );
}
