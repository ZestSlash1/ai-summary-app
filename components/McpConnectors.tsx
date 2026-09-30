"use client";

import { useRef } from "react";
import { Plug } from "lucide-react";
import type { McpConnector } from "@/lib/mcp";
import { McpConnectorsList } from "./McpConnectorsList";
import { PopoverPanel } from "./Popover";
import { CHIP, CHIP_LABEL } from "./ui/classes";
import { iconWiggle } from "@/lib/motion";

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
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={enabledCount ? `MCP connectors, ${enabledCount} on` : "MCP connectors"}
        title="MCP connectors: tool servers the model can call"
        data-wiggle="nudge"
        onPointerEnter={iconWiggle}
        className={CHIP}
      >
        <Plug aria-hidden className="h-3.5 w-3.5" />
        <span className={CHIP_LABEL}>MCP</span>
        {enabledCount > 0 && (
          <span key={enabledCount} className="aro-pop-in rounded-[5px] bg-nimbus-accent-soft px-1.5 text-[11px] tabular-nums text-nimbus-accent-text">
            {enabledCount}
          </span>
        )}
      </button>
      <PopoverPanel
        open={open}
        onClose={() => onOpenChange(false)}
        anchorRef={triggerRef}
        width={360}
        label="MCP connectors"
        className="p-3.5"
      >
        <p className="text-[13px] font-medium text-nimbus-text">MCP connectors</p>
        <p className="mb-2 mt-0.5 text-[12.5px] text-nimbus-text-muted">
          Tool servers the model can call. Turn on only what you use: each one is contacted with every message.
        </p>
        <McpConnectorsList onConnectorsChange={onConnectorsChange} />
      </PopoverPanel>
    </div>
  );
}
