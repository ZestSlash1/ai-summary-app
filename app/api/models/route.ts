import { fetchGatewayModels, fetchOmniRouteModels } from "@/lib/modelCatalog";

export const revalidate = 600;

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
