export type McpConnector = {
  id: string;
  name: string;
  url: string;
  authHeader?: string;
  enabled: boolean;
  toolNames: string[];
  /** Set when the connector came from the built-in catalog (lib/mcpCatalog.ts). */
  catalogId?: string;
};

const CONNECTORS_KEY = "nimbus-mcp-connectors";
const CHANGE_EVENT = "nimbus-mcp-connectors-change";

export function loadConnectors(): McpConnector[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CONNECTORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConnectors(connectors: McpConnector[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONNECTORS_KEY, JSON.stringify(connectors));
  } catch {
    // localStorage may be full or unavailable — fail silently.
  }
  // Every open chat keeps its own connector list: tell them all, so none saves over this change.
  window.dispatchEvent(new CustomEvent<McpConnector[]>(CHANGE_EVENT, { detail: connectors }));
}

/** Calls back with the new list whenever connectors change here or in another browser tab. */
export function subscribeConnectors(onChange: (connectors: McpConnector[]) => void): () => void {
  const onLocal = (e: Event) => onChange((e as CustomEvent<McpConnector[]>).detail);
  const onStorage = (e: StorageEvent) => {
    if (e.key === CONNECTORS_KEY) onChange(loadConnectors());
  };
  window.addEventListener(CHANGE_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

/** "Authorization" value for a pasted key, whether or not it was pasted with "Bearer ". */
export function bearerHeader(key: string): string {
  return `Bearer ${key.trim().replace(/^bearer\s+/i, "")}`;
}

/**
 * A short reason a server could not connect. Transport errors can carry a whole HTML page
 * (a GitHub list of servers answers with one) or just "fetch failed".
 */
export function describeMcpError(err: unknown, { sentKey }: { sentKey: boolean }): string {
  const message = err instanceof Error ? err.message : "";
  if (/<!doctype html|<html/i.test(message)) {
    return "That address is a web page, not an MCP server. Use the server's own address, which usually ends in /mcp.";
  }
  const status = /\(HTTP (\d{3})\)/.exec(message)?.[1];
  if (status === "401" || status === "403") {
    return sentKey ? "The server turned down that key." : "This server needs a key.";
  }
  if (status === "404") return "Nothing answers at that address. MCP server addresses usually end in /mcp.";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(message)) {
    return "Couldn't reach that address. Check it, or try again later if the server is down.";
  }
  return message ? `Couldn't connect: ${message.slice(0, 200)}` : "Couldn't connect to that MCP server.";
}

/**
 * Joins the tool sets of several MCP servers. A tool whose name an earlier server already
 * took (GitHub and Linear both have list_issues) gets the server's name as a prefix, so
 * neither silently replaces the other. Each tool still calls its server by its own name.
 */
export function mergeMcpToolSets<T>(sets: { name?: string; tools: Record<string, T> }[]): Record<string, T> {
  const merged: Record<string, T> = {};
  sets.forEach(({ name, tools }, i) => {
    const prefix =
      (name ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 24) || `mcp${i + 1}`;
    for (const [toolName, tool] of Object.entries(tools)) {
      let key = toolName;
      for (let n = 1; key in merged; n++) {
        // Model APIs cap tool names at 64 characters.
        key = `${n === 1 ? prefix : `${prefix}${n}`}_${toolName}`.slice(0, 64);
      }
      merged[key] = tool;
    }
  });
  return merged;
}
