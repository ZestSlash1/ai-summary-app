/**
 * Where ARO reaches OmniRoute. It runs on the home PC, so the deployed site goes through the
 * home gateway's /omniroute prefix with the gateway token, like Hermes: by default the gateway
 * BONSAI_BASE_URL points at. The gateway lets only the model list and chat through, because
 * OmniRoute's own port answers without a login and hands out every provider key.
 *
 * OMNIROUTE_BASE_URL talks to OmniRoute directly instead (local development:
 * http://localhost:20128/v1), with OmniRoute's own OMNIROUTE_API_KEY.
 */

export type OmniRouteEndpoint = { baseURL: string; apiKey?: string };

// OmniRoute lists image, video, audio, embedding, rerank, and moderation models in the same
// /v1/models catalog, marked by type. ARO can only chat, so the picker leaves those out.
const NON_CHAT_TYPES = new Set(["image", "video", "audio", "embedding", "rerank", "moderation"]);

export function isOmniRouteChatModel(model: { type?: string }): boolean {
  return !NON_CHAT_TYPES.has(model.type ?? "");
}

export function omnirouteEndpoint(env: Record<string, string | undefined> = process.env): OmniRouteEndpoint | null {
  const direct = env.OMNIROUTE_BASE_URL;
  if (direct) return { baseURL: direct.replace(/\/$/, ""), apiKey: env.OMNIROUTE_API_KEY || undefined };
  const gateway = env.BONSAI_BASE_URL;
  if (!gateway) return null;
  // BONSAI_BASE_URL is "<gateway>/v1"; OmniRoute sits at "<gateway>/omniroute/v1". The gateway
  // wants its own token here, never OmniRoute's key.
  return { baseURL: new URL("/omniroute/v1", gateway).toString(), apiKey: env.BONSAI_API_KEY || undefined };
}
