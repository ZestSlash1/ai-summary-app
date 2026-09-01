"use client";

import { useEffect, useRef } from "react";
import type { McpConnector } from "@/lib/mcp";
import { McpConnectorsList } from "./McpConnectorsList";

export function McpConnectors({
  open,
  onOpenChange,
  onConnectorsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectorsChange: (connectors: McpConnector[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, onOpenChange]);

  return (
    <div
      ref={rootRef}
      className={`absolute bottom-full left-0 z-20 mb-2 w-80 rounded-2xl border border-nimbus-border bg-nimbus-surface p-4 shadow-[var(--nimbus-shadow-lift)] ${
        open ? "" : "hidden"
      }`}
    >
      <p className="mb-2 text-sm font-medium text-nimbus-text">MCP connectors</p>
      <McpConnectorsList onConnectorsChange={onConnectorsChange} />
    </div>
  );
}
