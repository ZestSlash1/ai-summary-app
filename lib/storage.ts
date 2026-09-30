import type { Conversation } from "./types";

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

export function createConversation(model: string): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    model,
    createdAt: Date.now(),
  };
}

export type ModelSource = "gateway" | "omniroute" | "bonsai";

/** The default model the user picked for a source, or null if they never chose one.
 * Model ids differ per source, so each source keeps its own default. The old single key
 * predates sources and held a Gateway id, so it still counts as the Gateway default. */
export function loadSavedDefaultModel(source: ModelSource): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (
      window.localStorage.getItem(`${DEFAULT_MODEL_KEY}:${source}`) ||
      (source === "gateway" ? window.localStorage.getItem(DEFAULT_MODEL_KEY) : null)
    );
  } catch {
    return null;
  }
}

export function saveDefaultModel(source: ModelSource, model: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${DEFAULT_MODEL_KEY}:${source}`, model);
  } catch {
    // Not critical: new chats fall back to the source's free model.
  }
}

export function loadModelSource(): ModelSource {
  if (typeof window === "undefined") return "gateway";
  const raw = window.localStorage.getItem(MODEL_SOURCE_KEY);
  if (raw === "omniroute" || raw === "bonsai") return raw;
  return "gateway";
}

/** Fired on window when the source changes, so every open model picker can follow. */
export const MODEL_SOURCE_EVENT = "aro:model-source";

export function saveModelSource(source: ModelSource) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODEL_SOURCE_KEY, source);
  window.dispatchEvent(new CustomEvent(MODEL_SOURCE_EVENT, { detail: source }));
}

const OPEN_TABS_KEY = "aro-open-tabs";
const SIDEBAR_COLLAPSED_KEY = "aro-sidebar-collapsed";

/** Conversation ids open as tabs, in order. Per browser, like a window layout. */
export function loadOpenTabs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OPEN_TABS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveOpenTabs(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(ids));
  } catch {
    // Not critical: tabs just reopen fresh next time.
  }
}

export function loadSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Not critical.
  }
}

export function titleFromMessage(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 48) return trimmed || "New chat";
  return `${trimmed.slice(0, 48).trimEnd()}…`;
}
