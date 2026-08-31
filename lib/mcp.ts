export type McpConnector = {
  id: string;
  name: string;
  url: string;
  authHeader?: string;
  enabled: boolean;
  toolNames: string[];
};

const CONNECTORS_KEY = "nimbus-mcp-connectors";

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
}
