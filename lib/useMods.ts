"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_MODS, MODS_KEY, parseStoredMods, setMod, type ModId, type ModState, type ModValue } from "./mods";

/*
 * One shared copy of the mod state per tab. Every chat tab, the popover, and the settings page
 * read the same object, and a change in another browser tab arrives through the storage event.
 * Storage may be unavailable (private windows, blocked site data): the mods then still work for
 * the session, they just are not remembered.
 */
let current: ModState | null = null;
const listeners = new Set<() => void>();

function read(): ModState {
  if (current) return current;
  try {
    current = parseStoredMods(window.localStorage.getItem(MODS_KEY));
  } catch {
    current = { ...DEFAULT_MODS };
  }
  return current;
}

function write(next: ModState) {
  current = next;
  try {
    window.localStorage.setItem(MODS_KEY, JSON.stringify(next));
  } catch {
    // Not remembered, still applied.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== MODS_KEY) return;
    current = parseStoredMods(e.newValue);
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

/** The mod state, and how to change it. Before hydration it reads as DEFAULT_MODS (the same object each time). */
export function useMods() {
  const mods = useSyncExternalStore(subscribe, read, () => DEFAULT_MODS as ModState);
  return {
    mods,
    set: (id: ModId, value: ModValue) => write(setMod(read(), id, value)),
    reset: () => write({ ...DEFAULT_MODS }),
  };
}
