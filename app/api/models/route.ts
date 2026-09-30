import { auth } from "@/auth";
import { canUseBonsai, bonsaiDenied } from "@/lib/access";
import {
  fetchGatewayModels,
  fetchOmniRouteModels,
  fetchBonsaiModels,
  fetchHermesModels,
} from "@/lib/modelCatalog";

// Not statically cached: the Bonsai list is per-user (allow-listed only), so a route-level
// revalidate could serve one user's response to another. Each catalog fetch still sets its
// own `next: { revalidate }`, so upstream calls stay cached.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("source");

  if (source === "bonsai" || source === "hermes") {
    const session = await auth();
    if (!canUseBonsai(session)) return bonsaiDenied(session, source === "hermes" ? "Hermes" : "Bonsai");
  }

  try {
    let models;
    if (source === "hermes") {
      models = await fetchHermesModels();
    } else if (source === "bonsai") {
      models = await fetchBonsaiModels();
    } else if (source === "omniroute") {
      models = await fetchOmniRouteModels();
    } else {
      models = await fetchGatewayModels();
    }
    return Response.json(models);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to fetch models." },
      { status: 502 }
    );
  }
}
