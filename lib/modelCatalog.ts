import { hermesEndpoint, hermesFetch } from "./hermes";
import { omnirouteEndpoint } from "./omniroute";

export type ModelOption = {
  id: string;
  name: string;
  free: boolean;
};

type GatewayModel = {
  id: string;
  name: string;
  type: string;
  pricing?: { input?: string; output?: string };
};

type OmniRouteModel = {
  id: string;
};

export async function fetchGatewayModels(): Promise<ModelOption[]> {
  const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
    headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}` },
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error("Failed to fetch models from AI Gateway.");

  const body = (await res.json()) as { data: GatewayModel[] };
  return body.data
    .filter((m) => m.type === "language")
    .map((m) => ({
      id: m.id,
      name: m.name,
      free:
        parseFloat(m.pricing?.input ?? "1") === 0 &&
        parseFloat(m.pricing?.output ?? "1") === 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchOmniRouteModels(): Promise<ModelOption[]> {
  const endpoint = omnirouteEndpoint();
  if (!endpoint) throw new Error("OmniRoute is not configured.");

  const res = await fetch(`${endpoint.baseURL}/models`, {
    headers: endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : undefined,
    // It lives on the home PC: when the PC is off, fail fast instead of holding the picker open.
    signal: AbortSignal.timeout(10_000),
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error("Failed to fetch models from OmniRoute.");

  const body = (await res.json()) as { data: OmniRouteModel[] };
  const seen = new Set<string>();
  return body.data
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))) // OmniRoute's own list contains real duplicate ids
    .map((m) => ({
      id: m.id,
      name: m.id,
      free: m.id.includes("free"),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type BonsaiModel = {
  id: string;
};

export async function fetchBonsaiModels(): Promise<ModelOption[]> {
  const baseURL = process.env.BONSAI_BASE_URL;
  if (!baseURL) return [];

  try {
    const res = await fetch(`${baseURL}/models`, {
      headers: process.env.BONSAI_API_KEY
        ? { Authorization: `Bearer ${process.env.BONSAI_API_KEY}` }
        : undefined,
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];

    const body = (await res.json()) as { data: BonsaiModel[] };
    return (body.data ?? [])
      .map((m) => ({
        id: m.id,
        name: m.id,
        free: true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // Return empty array when PC is off or tunnel unreachable (never throw 500)
    return [];
  }
}


/** Hermes profiles the home gateway exposes. Empty when Hermes is off or not set up. */
export async function fetchHermesModels(): Promise<ModelOption[]> {
  const endpoint = hermesEndpoint();
  if (!endpoint) return [];
  try {
    const res = await hermesFetch(endpoint, "/v1/models", { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: { id: string }[] };
    return (body.data ?? []).map((m) => ({
      id: m.id,
      name: m.id === "hermes-agent" ? "Hermes agent" : `Hermes · ${m.id}`,
      free: true,
    }));
  } catch {
    return [];
  }
}
