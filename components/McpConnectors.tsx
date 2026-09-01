"use client";

import { useRef } from "react";
import type { McpConnector } from "@/lib/mcp";
import { McpConnectorsList } from "./McpConnectorsList";
import { PopoverPanel, usePopoverDismiss } from "./Popover";

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

  usePopoverDismiss(open, () => onOpenChange(false), rootRef);

  return (
    <div ref={rootRef} className="contents">
      <PopoverPanel open={open} className="bottom-full left-0 mb-2 w-80 p-4">
        <p className="mb-2 text-sm font-medium text-nimbus-text">MCP connectors</p>
        <McpConnectorsList onConnectorsChange={onConnectorsChange} />
      </PopoverPanel>
    </div>
  );
}
