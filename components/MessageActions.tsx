"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";

/** Copy and regenerate under a reply. Visible on hover, always visible on touch. */
export function MessageActions({
  text,
  onRegenerate,
  showRegenerate,
  meta,
}: {
  text: string;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
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
        <ActionButton label={copied ? "Copied" : "Copy"} onClick={handleCopy}>
          {copied ? (
            <Check aria-hidden className="h-3.5 w-3.5 text-nimbus-free" />
          ) : (
            <Copy aria-hidden className="h-3.5 w-3.5" />
          )}
        </ActionButton>
      )}
      {showRegenerate && onRegenerate && (
        <ActionButton label="Regenerate" onClick={onRegenerate}>
          <RotateCcw aria-hidden className="h-3.5 w-3.5" />
        </ActionButton>
      )}
      {meta && <span className="ml-1.5 truncate text-[11.5px] text-nimbus-text-faint">{meta}</span>}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-md text-nimbus-text-muted transition-[color,background-color,transform] duration-200 hover:bg-nimbus-surface-2 hover:text-nimbus-text active:scale-90"
    >
      {children}
    </button>
  );
}
