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
    // localStorage may be full or unavailable (private mode) -- fail silently.
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

export function createConversation(
  model: string,
  options?: Partial<Omit<Conversation, "id" | "createdAt" | "model">>
): Conversation {
  return {
    id: crypto.randomUUID(),
    title: options?.title ?? "New chat",
    messages: options?.messages ?? [],
    model,
    createdAt: Date.now(),
    ...(options?.githubRepo ? { githubRepo: options.githubRepo } : {}),
    ...(options?.mode ? { mode: options.mode } : {}),
    ...(options?.continuedFrom ? { continuedFrom: options.continuedFrom } : {}),
    ...(options?.continuedIn ? { continuedIn: options.continuedIn } : {}),
  };
}

export type ModelSource = "gateway" | "omniroute" | "bonsai" | "hermes";

/** The model new chats start with, as a "source::id" ref, or null if the user never chose one.
 * The old key held a bare Gateway id, so it still counts as a Gateway default. */
export function loadDefaultModelRef(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const ref = window.localStorage.getItem(`${DEFAULT_MODEL_KEY}:ref`);
    if (ref) return ref;
    const legacy = window.localStorage.getItem(DEFAULT_MODEL_KEY);
    return legacy ? `gateway::${legacy}` : null;
  } catch {
    return null;
  }
}

export function saveDefaultModelRef(ref: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${DEFAULT_MODEL_KEY}:ref`, ref);
  } catch {
    // Not critical: new chats fall back to a free model.
  }
}

/** The app-wide source from before each chat stored its own. Only used to read older chats,
 * whose model is a bare id, and to pick a first default for users who had chosen one. */
export function loadModelSource(): ModelSource {
  if (typeof window === "undefined") return "gateway";
  try {
    const raw = window.localStorage.getItem(MODEL_SOURCE_KEY);
    if (raw === "omniroute" || raw === "bonsai") return raw;
  } catch {
    // Storage unavailable.
  }
  return "gateway";
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
