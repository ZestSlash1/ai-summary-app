"use client";

import { useRef, useState } from "react";
import { Palette } from "lucide-react";
import { iconWiggle } from "@/lib/motion";
import { changedCount } from "@/lib/mods";
import { useMods } from "@/lib/useMods";
import { PopoverPanel } from "./Popover";
import { ModsPanel } from "./ModsPanel";
import { CHIP, CHIP_LABEL_EXTRA, CHIP_ON } from "./ui/classes";

/** The Mods chip in the composer's controls row. Opens every visual mod as quick switches. */
export function ModsPopover() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { mods } = useMods();
  const changed = changedCount(mods);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-label="Mods"
        onClick={() => setOpen((v) => !v)}
        title="Mods: visual touches for the chat"
        data-wiggle="nudge"
        onPointerEnter={iconWiggle}
        className={`${CHIP} ${changed > 0 ? CHIP_ON : ""}`}
      >
        <Palette aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className={CHIP_LABEL_EXTRA}>Mods</span>
        {changed > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-nimbus-accent px-1 text-[10px] font-semibold text-white">
            {changed}
          </span>
        )}
      </button>
      <PopoverPanel
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        label="Mods"
        className="max-h-[min(70dvh,34rem)] w-[calc(100vw-32px)] max-w-[360px] overflow-y-auto p-3 sm:max-w-[380px]"
      >
        <div className="mb-2 border-b border-nimbus-border px-2 pb-2.5">
          <p className="text-[13px] font-semibold text-nimbus-text">Mods</p>
          <p className="text-[11px] text-nimbus-text-muted">Visual touches for the chat. Each one switches on the spot.</p>
        </div>
        <ModsPanel />
      </PopoverPanel>
    </>
  );
}
