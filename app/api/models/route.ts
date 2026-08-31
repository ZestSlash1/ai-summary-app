export const revalidate = 600;

type GatewayModel = {
  id: string;
  name: string;
  type: string;
  pricing?: { input?: string; output?: string };
};

export type ModelOption = {
  id: string;
  name: string;
  free: boolean;
};

export async function GET() {
  const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
    headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}` },
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    return Response.json(
      { error: "Failed to fetch models from AI Gateway." },
      { status: 502 }
    );
  }

  const body = (await res.json()) as { data: GatewayModel[] };

  const models: ModelOption[] = body.data
    .filter((m) => m.type === "language")
    .map((m) => ({
      id: m.id,
      name: m.name,
      free:
        parseFloat(m.pricing?.input ?? "1") === 0 &&
        parseFloat(m.pricing?.output ?? "1") === 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return Response.json(models);
}
