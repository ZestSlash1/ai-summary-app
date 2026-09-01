"use client";

import { useEffect, useState } from "react";
import type { Theme } from "@/lib/theme";
import { loadTheme, saveTheme } from "@/lib/theme";

const ORDER: Theme[] = ["light", "dark", "system"];

export function ThemeToggleIcon({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(loadTheme());
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    saveTheme(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${theme}. Click to change.`}
      title={`Theme: ${theme}`}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-nimbus-border bg-nimbus-surface text-nimbus-text-muted shadow-[var(--nimbus-shadow)] transition-colors hover:text-nimbus-text ${className}`}
    >
      {theme === "light" && (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="7.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M7.5 0.8v1.7M7.5 12.5v1.7M14.2 7.5h-1.7M2.5 7.5H0.8M12.3 2.7l-1.2 1.2M3.9 11.1l-1.2 1.2M12.3 12.3l-1.2-1.2M3.9 3.9 2.7 2.7"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      )}
      {theme === "dark" && (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M12.5 8.2A5.7 5.7 0 0 1 5.8 1.5a5.7 5.7 0 1 0 6.7 6.7Z"
            fill="currentColor"
          />
        </svg>
      )}
      {theme === "system" && (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <rect x="1" y="2.5" width="13" height="8" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 12.5h5M7.5 10.5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
