"use client";

import { useCallback, useEffect, useState } from "react";

export type GpuState = "online" | "sleeping" | "busy" | "offline";

export type GpuStatus = {
  configured: boolean;
  reachable: boolean;
  bonsai: GpuState;
  comfy: GpuState;
  imageBusy: boolean;
};

/**
 * State of the home GPU stack (Bonsai and image editing) from /api/home-gpu.
 * `allowed` is null until known, false when this account is not allow-listed,
 * so the UI can hide features the user cannot use.
 */
export function useHomeGpu({ enabled = true, pollMs = 0 }: { enabled?: boolean; pollMs?: number } = {}) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/home-gpu", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setAllowed(false);
        setStatus(null);
      } else if (res.ok) {
        setAllowed(true);
        setStatus((await res.json()) as GpuStatus);
      }
    } catch {
      // Network hiccup: keep the last known state.
    } finally {
      setChecking(false);
    }
  }, []);

  const refresh = useCallback(() => {
    setChecking(true);
    return load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    // load() only sets state after the network call resolves, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    if (!pollMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [enabled, pollMs, load]);

  return { allowed, status, checking, refresh };
}
