import type { Conversation } from "./types";
import { DEFAULT_MODEL } from "./types";

const CONVERSATIONS_KEY = "nimbus-conversations";
const ACTIVE_ID_KEY = "nimbus-active-conversation";

export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CONVERSATIONS_KEY,
      JSON.stringify(conversations)
    );
  } catch {
    // localStorage may be full or unavailable (private mode) — fail silently.
  }
}

export function loadActiveId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_ID_KEY);
}

export function saveActiveId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_ID_KEY, id);
}

export function createConversation(model: string = DEFAULT_MODEL): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    model,
    createdAt: Date.now(),
  };
}

export function titleFromMessage(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 48) return trimmed || "New chat";
  return `${trimmed.slice(0, 48).trimEnd()}…`;
}
