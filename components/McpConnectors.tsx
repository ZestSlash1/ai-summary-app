"use client";

import { useRef } from "react";
import { Plug } from "lucide-react";
import type { McpConnector } from "@/lib/mcp";
import { McpConnectorsList } from "./McpConnectorsList";
import { PopoverPanel, usePopoverDismiss } from "./Popover";
import { CHIP } from "./ui/classes";

/** Composer chip for MCP tool servers, with the add and toggle list in a popover. */
export function McpConnectors({
  open,
  onOpenChange,
  onConnectorsChange,
  enabledCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectorsChange: (connectors: McpConnector[]) => void;
  enabledCount: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, () => onOpenChange(false), rootRef);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={enabledCount ? `MCP connectors, ${enabledCount} on` : "MCP connectors"}
        className={CHIP}
      >
        <Plug aria-hidden className="h-3.5 w-3.5" />
        <span>MCP</span>
        {enabledCount > 0 && (
          <span className="rounded-[5px] bg-nimbus-accent-soft px-1.5 text-[11px] tabular-nums text-nimbus-accent-text">
            {enabledCount}
          </span>
        )}
      </button>
      <PopoverPanel open={open} className="bottom-full left-0 mb-2 w-80 p-3.5">
        <p className="text-[13px] font-medium text-nimbus-text">MCP connectors</p>
        <p className="mb-3 mt-0.5 text-[12.5px] text-nimbus-text-muted">
          Remote tool servers the model can call in this chat.
        </p>
        <McpConnectorsList onConnectorsChange={onConnectorsChange} />
      </PopoverPanel>
    </div>
  );
}
