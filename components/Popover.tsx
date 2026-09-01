"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** Closes an open popover on an outside click. */
export function usePopoverDismiss(
  open: boolean,
  onClose: () => void,
  ref: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, onClose, ref]);
}

/** A floating glass panel that springs in above its trigger. Stays mounted
 * while closed (hidden via CSS) so children don't lose state on toggle. */
export function PopoverPanel({
  open,
  className = "",
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!open || !panelRef.current) return;
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: 8, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "power3.out" }
      );
    },
    { dependencies: [open] }
  );

  return (
    <div
      ref={panelRef}
      className={`nimbus-glass absolute z-20 max-w-[calc(100vw-2rem)] rounded-2xl border border-nimbus-border bg-nimbus-surface/90 shadow-[var(--nimbus-shadow-lift)] ${
        open ? "" : "hidden"
      } ${className}`}
    >
      {children}
    </div>
  );
}
