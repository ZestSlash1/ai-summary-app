"use client";

import { useEffect, useState } from "react";
import { MODEL_SOURCE_EVENT, loadModelSource, saveModelSource, type ModelSource } from "./storage";
import { useHomeGpu } from "./useHomeGpu";

/**
 * The app-wide model source, kept in step across every picker. An account that cannot
 * use Bonsai is moved back to AI Gateway: left pointed at Bonsai, every message would fail.
 */
export function useModelSource() {
  const [stored, setStored] = useState<ModelSource>("gateway");
  const [ready, setReady] = useState(false);
  const { allowed: bonsaiAllowed } = useHomeGpu();

  useEffect(() => {
    // Hydrates from localStorage after mount; the server never sees it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStored(loadModelSource());
    setReady(true);
    const onSource = (e: Event) => setStored((e as CustomEvent<ModelSource>).detail);
    window.addEventListener(MODEL_SOURCE_EVENT, onSource);
    return () => window.removeEventListener(MODEL_SOURCE_EVENT, onSource);
  }, []);

  const blocked = bonsaiAllowed === false && stored === "bonsai";
  useEffect(() => {
    if (blocked) saveModelSource("gateway");
  }, [blocked]);

  return {
    source: blocked ? ("gateway" as const) : stored,
    setSource: saveModelSource,
    /** False until the saved source is read; act on `source` only once this is true. */
    ready,
    /** null while unknown, false when this account cannot use the home GPU. */
    bonsaiAllowed,
  };
}
