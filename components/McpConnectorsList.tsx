"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import type { McpConnector } from "@/lib/mcp";
import { bearerHeader, loadConnectors, saveConnectors, subscribeConnectors } from "@/lib/mcp";
import { MCP_CATALOG, MCP_CATALOG_GROUPS, catalogConnector, type McpCatalogEntry } from "@/lib/mcpCatalog";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD, MENU_LABEL } from "./ui/classes";
import { iconWiggle } from "@/lib/motion";

type Preview = { serverName?: string; tools?: { name: string }[] };

/** Connects once through the app (which refuses private addresses) and lists the server's tools. */
async function previewServer(url: string, authHeader?: string): Promise<Preview> {
  const res = await fetch("/api/mcp/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, authHeader }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not connect.");
  return data;
}

function toolCount(names: string[]) {
  return `${names.length} tool${names.length === 1 ? "" : "s"}`;
}

function Switch({ checked, label, disabled, onClick }: { checked: boolean; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`group/switch relative h-5 w-9 shrink-0 rounded-full transition-colors duration-300 disabled:opacity-50 ${
        checked ? "bg-nimbus-accent" : "bg-nimbus-surface-3 hover:bg-nimbus-border-strong"
      }`}
    >
      {/* The knob stretches while pressed, toward where it is about to go. */}
      <span
        className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[translate,width] duration-300 ease-[var(--nimbus-ease)] motion-safe:group-active/switch:w-5 ${
          checked ? "translate-x-[18px] motion-safe:group-active/switch:translate-x-[14px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

const ROW = "rounded-lg px-2.5 py-2 transition-colors duration-200 ease-[var(--nimbus-ease)] hover:bg-nimbus-surface-2";
const REMOVE =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-nimbus-text-faint transition-colors hover:bg-nimbus-danger-soft hover:text-nimbus-danger";

/**
 * MCP connectors: a catalog of ready-made servers to switch on, plus your own by URL.
 * No positioning of its own, so it sits inline (Settings) or in a popover (the composer).
 */
export function McpConnectorsList({
  onConnectorsChange,
}: {
  onConnectorsChange?: (connectors: McpConnector[]) => void;
}) {
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const currentRef = useRef<McpConnector[]>([]);
  const onChangeRef = useRef(onConnectorsChange);
  useEffect(() => {
    onChangeRef.current = onConnectorsChange;
  });

  // Catalog rows: which one is connecting, which one is asking for a key, and why one failed.
  const [pending, setPending] = useState<string | null>(null);
  const [keyFor, setKeyFor] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  // The row that just switched on glows once, so the change registers.
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  function celebrate(id: string) {
    setFlash(id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1400);
  }

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // localStorage exists only after mount. From then on, every open list (one per chat,
    // plus Settings) follows the saved connectors, so no list saves over another's change.
    function apply(next: McpConnector[]) {
      currentRef.current = next;
      setConnectors(next);
      onChangeRef.current?.(next);
    }
    apply(loadConnectors());
    return subscribeConnectors(apply);
  }, []);

  /** Saves a change made to the latest list. The change event then updates every list. */
  function update(change: (current: McpConnector[]) => McpConnector[]) {
    saveConnectors(change(currentRef.current));
  }

  async function connectCatalog(entry: McpCatalogEntry, key?: string) {
    const header = key?.trim() ? bearerHeader(key) : undefined;
    setPending(entry.id);
    setRowError(null);
    try {
      const data = await previewServer(entry.url, header);
      const connector = catalogConnector(entry, {
        authHeader: header,
        toolNames: (data.tools ?? []).map((t) => t.name),
      });
      update((current) => [...current.filter((c) => c.catalogId !== entry.id), connector]);
      celebrate(entry.id);
      setKeyFor(null);
      setKeyDraft("");
    } catch (err) {
      setRowError({ id: entry.id, message: err instanceof Error ? err.message : "Could not connect." });
    } finally {
      setPending(null);
    }
  }

  function toggleCatalog(entry: McpCatalogEntry) {
    setRowError(null);
    const saved = connectors.find((c) => c.catalogId === entry.id);
    if (saved) {
      if (!saved.enabled) celebrate(entry.id);
      update((current) => current.map((c) => (c.catalogId === entry.id ? { ...c, enabled: !c.enabled } : c)));
    } else if (entry.key) {
      setKeyFor(keyFor === entry.id ? null : entry.id);
      setKeyDraft("");
    } else {
      void connectCatalog(entry);
    }
  }

  async function addConnector() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await previewServer(url.trim(), authHeader.trim() || undefined);
      const connector: McpConnector = {
        id: crypto.randomUUID(),
        name: name.trim() || data.serverName || url.trim(),
        url: url.trim(),
        authHeader: authHeader.trim() || undefined,
        enabled: true,
        toolNames: (data.tools ?? []).map((t) => t.name),
      };
      update((current) => [...current, connector]);
      celebrate(connector.id);
      setName("");
      setUrl("");
      setAuthHeader("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  }

  const custom = connectors.filter((c) => !c.catalogId || !MCP_CATALOG.some((e) => e.id === c.catalogId));

  return (
    <div className="flex flex-col gap-2">
      {MCP_CATALOG_GROUPS.map((group) => (
        <section key={group.id} aria-label={group.title} className="flex flex-col">
          <p className={MENU_LABEL}>{group.title}</p>
          {MCP_CATALOG.filter((entry) => entry.group === group.id).map((entry) => {
            const saved = connectors.find((c) => c.catalogId === entry.id);
            const connecting = pending === entry.id;
            return (
              <div key={entry.id} className={`${ROW} ${flash === entry.id ? "aro-flash" : ""}`}>
                <div className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[13px] text-nimbus-text">
                      {entry.name}
                      {entry.key && (
                        <span className="rounded-[5px] bg-nimbus-surface-3 px-1.5 py-px text-[10.5px] font-medium text-nimbus-text-muted">
                          Key
                        </span>
                      )}
                    </p>
                    <p className="text-[11.5px] leading-snug text-nimbus-text-muted">
                      {entry.blurb}
                      {saved && <span className="nimbus-fade-in">{` ${toolCount(saved.toolNames)}.`}</span>}
                    </p>
                  </div>
                  {connecting && <Loader2 aria-label="Connecting" className="h-3.5 w-3.5 shrink-0 animate-spin text-nimbus-text-muted" />}
                  {saved?.authHeader && (
                    <button type="button" onClick={() => update((current) => current.filter((c) => c.id !== saved.id))} aria-label={`Remove ${entry.name} and its key`} title="Remove the saved key" className={REMOVE}>
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <Switch
                    checked={saved?.enabled ?? false}
                    label={entry.name}
                    disabled={connecting}
                    onClick={() => toggleCatalog(entry)}
                  />
                </div>

                {entry.key && keyFor === entry.id && !saved && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (keyDraft.trim()) void connectCatalog(entry, keyDraft);
                    }}
                    className="nimbus-fade-in mt-2 flex flex-col gap-1.5"
                  >
                    <input
                      type="password"
                      value={keyDraft}
                      onChange={(e) => setKeyDraft(e.target.value)}
                      placeholder={entry.key.placeholder}
                      aria-label={entry.key.label}
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus
                      className={FIELD}
                    />
                    <div className="flex items-center gap-2">
                      <button type="submit" disabled={!keyDraft.trim() || connecting} className={`${BUTTON_PRIMARY} h-8 px-3`}>
                        {connecting ? "Connecting" : "Connect"}
                      </button>
                      <button type="button" onClick={() => setKeyFor(null)} className={`${BUTTON_SECONDARY} h-8 px-3`}>
                        Cancel
                      </button>
                      <a
                        href={entry.key.getUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-[12px] text-nimbus-accent-text hover:underline"
                      >
                        Get a key
                        <ExternalLink aria-hidden className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="text-[11.5px] text-nimbus-text-faint">Saved only in this browser.</p>
                  </form>
                )}
                {rowError?.id === entry.id && (
                  <p role="alert" className="mt-1 text-[12px] text-nimbus-danger">
                    {rowError.message}
                  </p>
                )}
              </div>
            );
          })}
        </section>
      ))}

      <section aria-label="Your own servers" className="flex flex-col">
        <p className={MENU_LABEL}>Your own servers</p>
        {custom.map((c) => (
          <div key={c.id} className={`${ROW} flex items-center gap-2.5 ${flash === c.id ? "aro-flash" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-nimbus-text">{c.name}</p>
              <p className="truncate text-[11.5px] text-nimbus-text-muted">{toolCount(c.toolNames)}</p>
            </div>
            <Switch
              checked={c.enabled}
              label={c.name}
              onClick={() => {
                if (!c.enabled) celebrate(c.id);
                update((current) => current.map((x) => (x.id === c.id ? { ...x, enabled: !x.enabled } : x)));
              }}
            />
            <button type="button" onClick={() => update((current) => current.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`} className={REMOVE}>
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addConnector();
            }}
            className="nimbus-fade-in flex flex-col gap-1.5 px-0.5 pt-1"
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Connector name" className={FIELD} />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-mcp-server.example.com/mcp"
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
            <div className="mt-1 flex gap-2">
              <button type="submit" disabled={busy || !url.trim()} className={`${BUTTON_PRIMARY} flex-1`}>
                {busy && <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />}
                {busy ? "Connecting" : "Connect and add"}
              </button>
              <button type="button" onClick={() => setAdding(false)} className={BUTTON_SECONDARY}>
                Cancel
              </button>
            </div>
            <p className="text-[11.5px] text-nimbus-text-faint">
              The address of a remote MCP server, usually ending in /mcp. A list of servers, like a GitHub page, will not connect.
            </p>
            {error && <p role="alert" className="text-[12px] text-nimbus-danger">{error}</p>}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            data-wiggle="spin"
            onPointerEnter={iconWiggle}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-nimbus-text-muted transition-[color,background-color,scale] duration-200 ease-[var(--nimbus-ease)] hover:bg-nimbus-surface-2 hover:text-nimbus-text motion-safe:active:scale-[0.98]"
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
            Add a server by URL
          </button>
        )}
      </section>
    </div>
  );
}
