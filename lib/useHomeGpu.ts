"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export type GpuState = "online" | "sleeping" | "busy" | "offline";

export type GpuStatus = {
  configured: boolean;
  reachable: boolean;
  bonsai: GpuState;
  comfy: GpuState;
  imageBusy: boolean;
  /** Hermes Agent in WSL: "unconfigured" until the gateway has its key. */
  hermes?: "online" | "offline" | "unconfigured";
};

type Snapshot = { allowed: boolean; status: GpuStatus | null };

// Several components (sidebar, every open chat tab, settings) read this at once, so
// share one request and reuse a fresh answer instead of fetching per component.
const FRESH_MS = 8_000;
let cached: { at: number; snapshot: Snapshot } | null = null;
let inflight: Promise<Snapshot | null> | null = null;

async function fetchSnapshot(force: boolean): Promise<Snapshot | null> {
  if (!force && cached && Date.now() - cached.at < FRESH_MS) return cached.snapshot;
  inflight ??= (async () => {
    try {
      const res = await fetch("/api/home-gpu", { cache: "no-store" });
      let snapshot: Snapshot | null = null;
      if (res.status === 401 || res.status === 403) snapshot = { allowed: false, status: null };
      else if (res.ok) snapshot = { allowed: true, status: (await res.json()) as GpuStatus };
      if (snapshot) cached = { at: Date.now(), snapshot };
      return snapshot;
    } catch {
      // Network hiccup: callers keep their last known state.
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** The effective Bonsai state: busy while an image edit holds the GPU. */
export function bonsaiState(status: GpuStatus): GpuState {
  return status.imageBusy && status.bonsai !== "offline" ? "busy" : status.bonsai;
}

/**
 * State of the home GPU stack (Bonsai and image editing) from /api/home-gpu.
 * `allowed` is null until known, false when this account is not allow-listed,
 * so the UI can hide features the user cannot use.
 */
export function useHomeGpu({ enabled = true, pollMs = 0 }: { enabled?: boolean; pollMs?: number } = {}) {
  const { status: sessionStatus } = useSession();
  const [allowed, setAllowed] = useState<boolean | null>(cached?.snapshot.allowed ?? null);
  const [status, setStatus] = useState<GpuStatus | null>(cached?.snapshot.status ?? null);
  const [checking, setChecking] = useState(true);
  // Signed out can never be allow-listed: answer locally instead of logging a 401 per component.
  const signedOut = sessionStatus === "unauthenticated";

  const load = useCallback(async (force = false) => {
    const snapshot = await fetchSnapshot(force);
    if (snapshot) {
      setAllowed(snapshot.allowed);
      setStatus(snapshot.status);
    }
    setChecking(false);
  }, []);

  const refresh = useCallback(() => {
    setChecking(true);
    return load(true);
  }, [load]);

  useEffect(() => {
    if (!enabled || sessionStatus === "loading" || signedOut) return;
    // load() only sets state after the network call resolves, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    if (!pollMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [enabled, pollMs, load, sessionStatus, signedOut]);

  if (signedOut) return { allowed: false, status: null, checking: false, refresh };
  return { allowed, status, checking, refresh };
}
