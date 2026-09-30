import type { ModelSource } from "./storage";
import type { ModelOption } from "./types";
import { FALLBACK_MODEL } from "./types";

const LAST_RESORT: Record<ModelSource, string> = {
  omniroute: "auto/best-free",
  gateway: FALLBACK_MODEL,
  bonsai: "bonsai-2-27b",
};

// Every open chat tab has a model picker; share one catalog request per source.
const CATALOG_FRESH_MS = 60_000;
const catalogCache = new Map<ModelSource, { at: number; models: Promise<ModelOption[]> }>();

/** The model list for a source. Rejects when the catalog is unreachable; empty is a real answer. */
export function fetchModelCatalog(source: ModelSource, force = false): Promise<ModelOption[]> {
  const hit = catalogCache.get(source);
  if (!force && hit && Date.now() - hit.at < CATALOG_FRESH_MS) return hit.models;
  const models = fetch(`/api/models?source=${source}`).then((res) =>
    res.ok ? (res.json() as Promise<ModelOption[]>) : Promise.reject(new Error(String(res.status)))
  );
  catalogCache.set(source, { at: Date.now(), models });
  // A failure should not be cached: the next open retries.
  models.catch(() => catalogCache.delete(source));
  return models;
}

export async function fetchDefaultModelForSource(
  source: ModelSource
): Promise<string> {
  try {
    const models = await fetchModelCatalog(source);
    const free = models.find((m) => m.free);
    return (free ?? models[0])?.id ?? LAST_RESORT[source];
  } catch {
    return LAST_RESORT[source];
  }
}
