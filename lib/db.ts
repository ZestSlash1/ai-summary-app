import type { Conversation, GithubRepoLink } from "./types";
import type { UIMessage } from "ai";

/** Signed-in equivalents of lib/storage.ts, backed by Supabase via the
 * /api/conversations routes rather than localStorage. */

/** Returns null specifically on failure (Supabase unreachable/unconfigured
 * in this environment) — distinct from a successful fetch that just found
 * zero conversations — so callers can fall back to localStorage instead of
 * silently ending up with no conversations at all. */
export async function fetchConversations(): Promise<Conversation[] | null> {
  const res = await fetch("/api/conversations");
  if (!res.ok) return null;
  return res.json();
}

export async function createConversationRemote(
  model: string
): Promise<Conversation | null> {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function patchConversationRemote(
  id: string,
  patch: Partial<{
    title: string;
    messages: UIMessage[];
    model: string;
    githubRepo: GithubRepoLink | undefined;
  }>
): Promise<void> {
  await fetch(`/api/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteConversationRemote(id: string): Promise<void> {
  await fetch(`/api/conversations/${id}`, { method: "DELETE" });
}
