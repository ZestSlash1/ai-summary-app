// Server-only: Bonsai's real context window, as reported by the home gateway's /status.
// The chat route needs it to prune history before llama-server rejects an oversized prompt.
// Cached briefly so a busy chat does not add a gateway round trip to every message.
let cached: { at: number; value: number | null } | null = null;
const FRESH_MS = 30_000;

export async function fetchBonsaiContext(): Promise<number | null> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.value;
  const base = process.env.BONSAI_BASE_URL;
  if (!base) return null;
  let value: number | null = null;
  try {
    const res = await fetch(new URL("/status", base), {
      headers: process.env.BONSAI_API_KEY ? { Authorization: `Bearer ${process.env.BONSAI_API_KEY}` } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const body = (await res.json()) as { bonsaiContext?: unknown };
      if (typeof body.bonsaiContext === "number" && body.bonsaiContext > 0) value = body.bonsaiContext;
    }
  } catch {
    // PC off or tunnel down: the caller falls back to the safe default.
  }
  cached = { at: Date.now(), value };
  return value;
}
