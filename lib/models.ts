import type { ModelSource } from "./storage";
import type { ModelOption } from "./types";
import { FALLBACK_MODEL } from "./types";

const LAST_RESORT: Record<ModelSource, string> = {
  omniroute: "auto/best-free",
  gateway: FALLBACK_MODEL,
  bonsai: "bonsai-2-27b",
};

export async function fetchDefaultModelForSource(
  source: ModelSource
): Promise<string> {
  try {
    const res = await fetch(`/api/models?source=${source}`);
    if (!res.ok) return LAST_RESORT[source];
    const models: ModelOption[] = await res.json();
    const free = models.find((m) => m.free);
    return (free ?? models[0])?.id ?? LAST_RESORT[source];
  } catch {
    return LAST_RESORT[source];
  }
}
