export const revalidate = 600;

type GatewayModel = {
  id: string;
  name: string;
  type: string;
  pricing?: { input?: string; output?: string };
};

type OmniRouteModel = {
  id: string;
};

export type ModelOption = {
  id: string;
  name: string;
  free: boolean;
};

async function fetchGatewayModels(): Promise<ModelOption[]> {
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

async function fetchOmniRouteModels(): Promise<ModelOption[]> {
  const baseURL = process.env.OMNIROUTE_BASE_URL;
  if (!baseURL) throw new Error("OmniRoute is not configured.");

  const res = await fetch(`${baseURL}/models`, { next: { revalidate: 600 } });
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

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("source");

  try {
    const models =
      source === "omniroute"
        ? await fetchOmniRouteModels()
        : await fetchGatewayModels();
    return Response.json(models);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to fetch models." },
      { status: 502 }
    );
  }
}
