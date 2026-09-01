"use client";

import { useEffect, useState } from "react";
import type { Theme } from "@/lib/theme";
import { loadTheme, saveTheme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(loadTheme());
  }, []);

  function select(value: Theme) {
    setTheme(value);
    saveTheme(value);
  }

  return (
    <div className="inline-flex rounded-[var(--nimbus-radius-pill)] border border-nimbus-border bg-nimbus-bg p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => select(opt.value)}
          className={`rounded-[var(--nimbus-radius-pill)] px-3.5 py-1.5 text-sm font-medium transition-colors ${
            theme === opt.value
              ? "bg-nimbus-surface text-nimbus-text shadow-[var(--nimbus-shadow)]"
              : "text-nimbus-text-muted hover:text-nimbus-text"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
