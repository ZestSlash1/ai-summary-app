"use client";

import { useState, type ReactNode } from "react";

export function MessageActions({
  text,
  onRegenerate,
  showRegenerate,
}: {
  text: string;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-200 ease-[var(--nimbus-ease)] group-hover:opacity-100 focus-within:opacity-100">
      <ActionButton label={copied ? "Copied" : "Copy"} onClick={handleCopy}>
        {copied ? (
          <path
            d="M2.5 6.5 5 9l6-6.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : (
          <path
            d="M4 4.5V2.5A.5.5 0 0 1 4.5 2H9a.5.5 0 0 1 .5.5V7a.5.5 0 0 1-.5.5H7.5M2.5 4.5h4A.5.5 0 0 1 7 5v4a.5.5 0 0 1-.5.5h-4A.5.5 0 0 1 2 9V5a.5.5 0 0 1 .5-.5Z"
            stroke="currentColor"
            strokeWidth="1.1"
            fill="none"
          />
        )}
      </ActionButton>

      {showRegenerate && onRegenerate && (
        <ActionButton label="Regenerate" onClick={onRegenerate}>
          <path
            d="M9.5 3.5v2.4h-2.4M2.5 8.5v-2.4h2.4M3.2 5.6A4 4 0 0 1 9.7 4M8.8 6.4A4 4 0 0 1 2.3 8"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            fill="none"
          />
        </ActionButton>
      )}
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
      title={label}
      className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-nimbus-text-muted transition-[color,transform] duration-200 ease-[var(--nimbus-ease)] hover:text-nimbus-text active:scale-90"
    >
      <svg width="11" height="11" viewBox="0 0 12 12">
        {children}
      </svg>
      {label}
    </button>
  );
}
