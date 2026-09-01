import type { Conversation, GithubRepoLink } from "./types";
import type { UIMessage } from "ai";

/** Signed-in equivalents of lib/storage.ts, backed by Supabase via the
 * /api/conversations routes rather than localStorage. */

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch("/api/conversations");
  if (!res.ok) return [];
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
