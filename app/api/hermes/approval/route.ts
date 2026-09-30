import { auth } from "@/auth";
import { canUseBonsai, bonsaiDenied } from "@/lib/access";
import { hermesEndpoint, hermesErrorText, hermesFetch } from "@/lib/hermes";

const CHOICES = new Set(["once", "session", "always", "deny"]);

/**
 * Answers a Hermes approval request (a risky command it wants to run) from the card in the
 * chat. Hermes pauses the turn until this arrives, then carries on or skips the command.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!canUseBonsai(session)) return bonsaiDenied(session, "Hermes");

  const { runId, choice, requestId } = (await request.json().catch(() => ({}))) as {
    runId?: string;
    choice?: string;
    requestId?: string;
  };
  if (!runId || !/^[A-Za-z0-9_-]{1,100}$/.test(runId) || !choice || !CHOICES.has(choice)) {
    return Response.json({ error: "Invalid approval." }, { status: 400 });
  }
  if (requestId !== undefined && (typeof requestId !== "string" || requestId.length > 256)) {
    return Response.json({ error: "Invalid approval." }, { status: 400 });
  }

  const endpoint = hermesEndpoint();
  if (!endpoint) return Response.json({ error: hermesErrorText(503) }, { status: 503 });

  try {
    const res = await hermesFetch(endpoint, `/v1/runs/${runId}/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice, ...(requestId ? { request_id: requestId } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 409) {
      return Response.json({ error: "That request already ended, so there is nothing to answer." }, { status: 409 });
    }
    if (!res.ok) return Response.json({ error: hermesErrorText(res.status) }, { status: 502 });
    return Response.json({ ok: true, choice });
  } catch {
    return Response.json({ error: hermesErrorText(502) }, { status: 502 });
  }
}
