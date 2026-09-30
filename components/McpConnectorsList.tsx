"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { McpConnector } from "@/lib/mcp";
import { loadConnectors, saveConnectors } from "@/lib/mcp";
import { BUTTON_PRIMARY, FIELD } from "./ui/classes";

/** Core add/list/toggle UI for MCP connectors, with no positioning of its
 * own. Embeddable inline (Settings page) or inside a popover (the composer). */
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
      if (!res.ok) throw new Error(data.error ?? "Could not connect.");

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
      setError(err instanceof Error ? err.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    persist(connectors.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  }

  function remove(id: string) {
    persist(connectors.filter((c) => c.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {connectors.length === 0 && (
          <p className="rounded-lg border border-dashed border-nimbus-border px-3 py-2.5 text-[12.5px] text-nimbus-text-muted">
            No connectors yet. Add a server URL below.
          </p>
        )}
        {connectors.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-2.5 rounded-lg border border-nimbus-border bg-nimbus-panel px-2.5 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-nimbus-text">{c.name}</p>
              <p className="truncate text-[11.5px] text-nimbus-text-muted">
                {c.toolNames.length} tool{c.toolNames.length === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={c.enabled}
              aria-label={`${c.name} ${c.enabled ? "on" : "off"}`}
              onClick={() => toggle(c.id)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ${
                c.enabled ? "bg-nimbus-accent" : "bg-nimbus-surface-3"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-300 ease-[var(--nimbus-ease)] ${
                  c.enabled ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => remove(c.id)}
              aria-label={`Remove ${c.name}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-nimbus-text-faint transition-colors hover:bg-nimbus-danger-soft hover:text-nimbus-danger"
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void addConnector();
        }}
        className="flex flex-col gap-1.5"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Connector name" className={FIELD} />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-mcp-server.example.com"
          aria-label="Server URL"
          inputMode="url"
          className={FIELD}
        />
        <input
          value={authHeader}
          onChange={(e) => setAuthHeader(e.target.value)}
          placeholder="Authorization header (optional)"
          aria-label="Authorization header"
          className={FIELD}
        />
        <button type="submit" disabled={busy || !url.trim()} className={`${BUTTON_PRIMARY} mt-1`}>
          {busy && <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />}
          {busy ? "Connecting" : "Connect and add"}
        </button>
        {error && <p role="alert" className="text-[12px] text-nimbus-danger">{error}</p>}
      </form>
    </div>
  );
}
