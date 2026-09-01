import type { Conversation } from "./types";
import { DEFAULT_MODEL } from "./types";

const CONVERSATIONS_KEY = "nimbus-conversations";
const ACTIVE_ID_KEY = "nimbus-active-conversation";
const DEFAULT_MODEL_KEY = "nimbus-default-model";
const MODEL_SOURCE_KEY = "nimbus-model-source";

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

export function createConversation(model: string = loadDefaultModel()): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    model,
    createdAt: Date.now(),
  };
}

export function loadDefaultModel(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  return window.localStorage.getItem(DEFAULT_MODEL_KEY) || DEFAULT_MODEL;
}

export function saveDefaultModel(model: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEFAULT_MODEL_KEY, model);
}

export type ModelSource = "gateway" | "omniroute";

export function loadModelSource(): ModelSource {
  if (typeof window === "undefined") return "gateway";
  return window.localStorage.getItem(MODEL_SOURCE_KEY) === "omniroute"
    ? "omniroute"
    : "gateway";
}

export function saveModelSource(source: ModelSource) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODEL_SOURCE_KEY, source);
}

export function titleFromMessage(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 48) return trimmed || "New chat";
  return `${trimmed.slice(0, 48).trimEnd()}…`;
}
