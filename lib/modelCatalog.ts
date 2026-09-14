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
  const baseURL = process.env.OMNIROUTE_BASE_URL;
  if (!baseURL) throw new Error("OmniRoute is not configured.");

  const res = await fetch(`${baseURL}/models`, {
    headers: process.env.OMNIROUTE_API_KEY
      ? { Authorization: `Bearer ${process.env.OMNIROUTE_API_KEY}` }
      : undefined,
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
