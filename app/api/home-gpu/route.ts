import { auth } from "@/auth";
import { canUseBonsai, bonsaiDenied } from "@/lib/access";

// Live state of the home GPU stack, per user. Never cache.
export const dynamic = "force-dynamic";

type GpuState = "online" | "sleeping" | "busy" | "offline";
const STATES: GpuState[] = ["online", "sleeping", "busy", "offline"];

function pick(value: unknown): GpuState {
  return STATES.includes(value as GpuState) ? (value as GpuState) : "offline";
}

const OFFLINE = { bonsai: "offline", comfy: "offline", imageBusy: false, hermes: "offline", ollama: "offline" } as const;

type HermesState = "online" | "offline" | "unconfigured";
function pickHermes(value: unknown): HermesState {
  return value === "online" || value === "unconfigured" ? value : "offline";
}

export async function GET() {
  const session = await auth();
  if (!canUseBonsai(session)) return bonsaiDenied(session, "the home GPU");

  const base = process.env.BONSAI_BASE_URL;
  if (!base) return Response.json({ configured: false, reachable: false, ...OFFLINE });

  try {
    // BONSAI_BASE_URL is ".../v1"; the gateway serves /status at its root.
    const res = await fetch(new URL("/status", base), {
      headers: process.env.BONSAI_API_KEY
        ? { Authorization: `Bearer ${process.env.BONSAI_API_KEY}` }
        : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    const body = (await res.json()) as Record<string, unknown>;
    return Response.json({
      configured: true,
      reachable: true,
      bonsai: pick(body.bonsai),
      bonsaiContext: typeof body.bonsaiContext === "number" ? body.bonsaiContext : null,
      comfy: pick(body.comfy),
      imageBusy: body.imageBusy === true,
      hermes: body.hermes === undefined ? "unconfigured" : pickHermes(body.hermes),
      // Same three answers as Hermes: an older gateway that does not know Ollama says nothing.
      ollama: body.ollama === undefined ? "unconfigured" : pickHermes(body.ollama),
    });
  } catch {
    // PC off, tunnel down, or bad token: report it as offline, never as a server error.
    return Response.json({ configured: true, reachable: false, ...OFFLINE });
  }
}
