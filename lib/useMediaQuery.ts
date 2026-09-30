"use client";

import { useSyncExternalStore } from "react";

/** Live result of a CSS media query. `serverValue` is used during server rendering. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}

/** Desktop layout: persistent sidebar instead of a drawer. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)", true);
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere, for shortcut hints. */
export function useModKey(): string {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl"
  );
}
