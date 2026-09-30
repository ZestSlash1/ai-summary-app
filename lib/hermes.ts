/**
 * Server-side access to Hermes Agent. ARO never talks to Hermes directly: it goes through
 * the home gateway's /hermes prefix with the gateway token, and the gateway swaps in
 * Hermes's own API_SERVER_KEY. By default the gateway is the one BONSAI_BASE_URL points at.
 */

export type HermesEndpoint = { base: string; token: string };

export function hermesEndpoint(): HermesEndpoint | null {
  const token = process.env.HERMES_GATEWAY_TOKEN || process.env.BONSAI_API_KEY || "";
  const explicit = process.env.HERMES_BASE_URL;
  if (explicit) return { base: explicit.replace(/\/$/, ""), token };
  const bonsai = process.env.BONSAI_BASE_URL;
  if (!bonsai) return null;
  // BONSAI_BASE_URL is "<gateway>/v1"; Hermes sits at "<gateway>/hermes".
  return { base: new URL("/hermes", bonsai).toString().replace(/\/$/, ""), token };
}

export function hermesFetch(endpoint: HermesEndpoint, path: string, init: RequestInit = {}) {
  return fetch(`${endpoint.base}${path}`, {
    ...init,
    headers: {
      ...(endpoint.token ? { Authorization: `Bearer ${endpoint.token}` } : {}),
      ...init.headers,
    },
  });
}

/** Hermes session ids end up in file names on the PC, so only a safe shape is sent. */
export function hermesSessionId(chatId: unknown): string | null {
  return typeof chatId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(chatId) ? `aro-${chatId}` : null;
}

/** One long-term memory scope per GitHub account, shared by all of that user's chats. */
export function hermesMemoryKey(githubUserId: string): string {
  return `aro-gh-${githubUserId.replace(/[^A-Za-z0-9-]/g, "")}`.slice(0, 200);
}

/** A readable sentence for a failed Hermes call, by status. */
export function hermesErrorText(status: number, type?: string): string {
  if (type === "hermes_unconfigured" || status === 503) {
    return "Hermes is not set up on the home PC yet. See tools/hermes/README.md.";
  }
  if (status === 401 || status === 403) return "The home gateway rejected ARO's token for Hermes.";
  if (status === 429) return "Hermes is busy with other runs. Try again in a moment.";
  return "Hermes is not answering. Check that it is running in WSL on the home PC.";
}
