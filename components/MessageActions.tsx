"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { Check, Copy, History, RotateCcw } from "lucide-react";
import { iconSpin, iconWiggle } from "@/lib/motion";

/** Copy, restore, and regenerate under a reply. Visible on hover, always visible on touch. */
export function MessageActions({
  text,
  onRegenerate,
  showRegenerate,
  onRestore,
  meta,
}: {
  text: string;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
  onRestore?: () => void;
  meta?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard unavailable.
    }
  }

  return (
    <div className="mt-2 flex items-center gap-0.5 opacity-100 transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 md:group-data-[last=true]:opacity-100">
      {text.trim() && (
        <ActionButton label={copied ? "Copied" : "Copy"} wiggle="pop" onClick={handleCopy}>
          {copied ? (
            <Check key="copied" aria-hidden className="aro-pop-in h-3.5 w-3.5 text-nimbus-free" />
          ) : (
            <Copy key="copy" aria-hidden className="h-3.5 w-3.5" />
          )}
        </ActionButton>
      )}
      {showRegenerate && onRegenerate && (
        <ActionButton
          label="Regenerate"
          wiggle="rewind"
          onClick={(e) => {
            iconSpin(e.currentTarget, -1);
            onRegenerate();
          }}
        >
          <RotateCcw aria-hidden className="h-3.5 w-3.5" />
        </ActionButton>
      )}
      {onRestore && (
        <ActionButton label="Restore to here" wiggle="rewind" onClick={onRestore}>
          <History aria-hidden className="h-3.5 w-3.5" />
        </ActionButton>
      )}
      {meta && <span className="ml-1.5 truncate text-[11.5px] text-nimbus-text-faint">{meta}</span>}
    </div>
  );
}

function ActionButton({
  label,
  wiggle,
  onClick,
  children,
}: {
  label: string;
  wiggle?: "pop" | "rewind";
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-wiggle={wiggle}
      onPointerEnter={iconWiggle}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-md text-nimbus-text-muted transition-[color,background-color,scale] duration-200 ease-[var(--nimbus-ease)] hover:bg-nimbus-surface-2 hover:text-nimbus-text motion-safe:active:scale-90 motion-safe:active:duration-100"
    >
      {children}
    </button>
  );
}
