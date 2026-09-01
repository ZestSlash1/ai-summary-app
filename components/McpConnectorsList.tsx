"use client";

import { useEffect, useState } from "react";
import type { McpConnector } from "@/lib/mcp";
import { loadConnectors, saveConnectors } from "@/lib/mcp";

/** Core add/list/toggle UI for MCP connectors, with no positioning of its
 * own — embeddable inline (Settings page) or inside a popover (ChatPanel). */
export function McpConnectorsList({
  onConnectorsChange,
}: {
  onConnectorsChange?: (connectors: McpConnector[]) => void;
}) {
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // One-time hydration from localStorage: must run after mount since
    // localStorage isn't available during server rendering.
    /* eslint-disable react-hooks/set-state-in-effect */
    const loaded = loadConnectors();
    setConnectors(loaded);
    onConnectorsChange?.(loaded);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(next: McpConnector[]) {
    setConnectors(next);
    saveConnectors(next);
    onConnectorsChange?.(next);
  }

  async function addConnector() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), authHeader: authHeader.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't connect.");

      const connector: McpConnector = {
        id: crypto.randomUUID(),
        name: name.trim() || data.serverName || url.trim(),
        url: url.trim(),
        authHeader: authHeader.trim() || undefined,
        enabled: true,
        toolNames: (data.tools ?? []).map((t: { name: string }) => t.name),
      };
      persist([...connectors, connector]);
      setName("");
      setUrl("");
      setAuthHeader("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    persist(
      connectors.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  }

  function remove(id: string) {
    persist(connectors.filter((c) => c.id !== id));
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-1.5">
        {connectors.length === 0 && (
          <p className="text-sm text-nimbus-text-muted">None added yet.</p>
        )}
        {connectors.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-nimbus-border px-2.5 py-1.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-nimbus-text">{c.name}</p>
              <p className="truncate text-xs text-nimbus-text-muted">
                {c.toolNames.length} tool{c.toolNames.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className={`rounded-[var(--nimbus-radius-pill)] px-2 py-1 text-[11px] font-medium ${
                  c.enabled
                    ? "bg-nimbus-free-soft text-nimbus-free"
                    : "bg-nimbus-bg text-nimbus-text-muted"
                }`}
              >
                {c.enabled ? "On" : "Off"}
              </button>
              <button
                type="button"
                onClick={() => remove(c.id)}
                className="text-xs text-nimbus-text-muted hover:text-nimbus-text"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-nimbus-text-muted">
        Add a connector
      </p>
      <div className="flex flex-col gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="rounded-lg border border-nimbus-border bg-nimbus-bg px-2 py-1.5 text-sm text-nimbus-text placeholder:text-nimbus-text-muted focus:outline-none"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-mcp-server.example.com"
          className="rounded-lg border border-nimbus-border bg-nimbus-bg px-2 py-1.5 text-sm text-nimbus-text placeholder:text-nimbus-text-muted focus:outline-none"
        />
        <input
          value={authHeader}
          onChange={(e) => setAuthHeader(e.target.value)}
          placeholder="Authorization header (optional)"
          className="rounded-lg border border-nimbus-border bg-nimbus-bg px-2 py-1.5 text-sm text-nimbus-text placeholder:text-nimbus-text-muted focus:outline-none"
        />
        <button
          type="button"
          onClick={addConnector}
          disabled={busy || !url.trim()}
          className="rounded-lg bg-nimbus-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "Connecting…" : "Connect & add"}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
