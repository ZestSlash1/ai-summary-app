"use client";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Flip } from "gsap/Flip";
import { SplitText } from "gsap/SplitText";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { CustomEase } from "gsap/CustomEase";

// One place registers every plugin and the house eases, so components import from here
// instead of wiring GSAP up themselves.
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, Flip, SplitText, DrawSVGPlugin, CustomEase);
  // "aro": the product's signature settle. Fast start, long soft landing.
  CustomEase.create("aro", "0.32, 0.72, 0, 1");
  // "aro-in": for things leaving, so they get out of the way quickly.
  CustomEase.create("aro-in", "0.55, 0, 0.9, 0.4");
  gsap.defaults({ ease: "aro", duration: 0.45 });
}

/** True when the visitor asked the OS for less motion. Checked at animation time. */
export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A duration that collapses to zero under reduced motion. */
export function d(seconds: number): number {
  return reducedMotion() ? 0 : seconds;
}

/**
 * A small, one-shot flourish on a button's icon when the pointer arrives: the detail that
 * makes a static nav feel alive. The button's data-wiggle picks the gesture.
 */
export function iconWiggle(e: { currentTarget: HTMLElement }) {
  if (reducedMotion()) return;
  const icon = e.currentTarget.querySelector("svg");
  if (!icon) return;
  gsap.killTweensOf(icon);
  gsap.set(icon, { transformOrigin: "50% 50%" });
  switch (e.currentTarget.dataset.wiggle) {
    case "spin":
      gsap.fromTo(icon, { rotate: 0 }, { rotate: 90, duration: 0.7, ease: "aro" });
      break;
    case "pop":
      gsap.fromTo(icon, { scale: 1 }, { keyframes: { scale: [1, 1.18, 0.96, 1] }, duration: 0.5, ease: "power1.out" });
      break;
    case "nudge":
      gsap.fromTo(icon, { x: 0 }, { keyframes: { x: [0, 2, -1, 0] }, duration: 0.45, ease: "power1.out" });
      break;
    default:
      gsap.fromTo(icon, { rotate: 0 }, { keyframes: { rotate: [0, -12, 8, 0] }, duration: 0.5, ease: "power1.inOut" });
  }
}

export { gsap, useGSAP, Flip, SplitText };
