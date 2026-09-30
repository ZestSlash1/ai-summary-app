import { auth } from "@/auth";
import { canUseBonsai, bonsaiDenied } from "@/lib/access";
import { hermesEndpoint } from "@/lib/hermes";

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_BYTES = 200 * 1024;

/**
 * Copies an installed skill into Hermes's skills folder on the home PC, through the gateway.
 * Owner-only: a skill is instructions for an agent that can run commands on that PC, so it is
 * never reachable by an ordinary signed-in user, and the browser never sees the gateway token.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!canUseBonsai(session)) return bonsaiDenied(session, "Hermes");

  const { name, files } = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    files?: unknown;
  };
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    return Response.json({ error: "Invalid skill name." }, { status: 400 });
  }
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    return Response.json({ error: "Missing skill files." }, { status: 400 });
  }
  let bytes = 0;
  for (const value of Object.values(files)) {
    if (typeof value !== "string") return Response.json({ error: "Skill files must be text." }, { status: 400 });
    bytes += Buffer.byteLength(value, "utf8");
  }
  if (bytes > MAX_BYTES) return Response.json({ error: "Skill is over the 200 KB limit." }, { status: 413 });

  const endpoint = hermesEndpoint();
  if (!endpoint) return Response.json({ error: "Hermes is not set up on this deployment." }, { status: 503 });

  try {
    // The gateway serves this beside /hermes, not under it.
    const res = await fetch(new URL("/hermes-skills/install", endpoint.base), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(endpoint.token ? { Authorization: `Bearer ${endpoint.token}` } : {}),
      },
      body: JSON.stringify({ name, files }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      replaced?: boolean;
      error?: { message?: string };
    };
    if (!res.ok) {
      // These messages are the gateway's own (folder not set, name taken, bad path).
      return Response.json(
        { error: body.error?.message || "The home PC did not accept the skill." },
        { status: res.status === 409 || res.status === 503 || res.status === 400 ? res.status : 502 }
      );
    }
    return Response.json({ ok: true, replaced: body.replaced === true });
  } catch {
    return Response.json({ error: "The home PC did not answer. Check that it is on." }, { status: 502 });
  }
}
