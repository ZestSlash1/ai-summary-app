"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { Theme } from "@/lib/theme";
import { THEME_EVENT, loadTheme, saveTheme } from "@/lib/theme";
import { Segmented } from "@/components/ui/Segmented";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(loadTheme());
    const onTheme = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_EVENT, onTheme);
    return () => window.removeEventListener(THEME_EVENT, onTheme);
  }, []);

  function select(value: Theme) {
    setTheme(value);
    saveTheme(value);
  }

  return (
    <Segmented
      label="Theme"
      value={theme}
      onChange={select}
      options={[
        { value: "dark", label: "Dark", icon: <Moon aria-hidden className="h-3.5 w-3.5" /> },
        { value: "light", label: "Light", icon: <Sun aria-hidden className="h-3.5 w-3.5" /> },
        { value: "system", label: "System", icon: <Monitor aria-hidden className="h-3.5 w-3.5" /> },
      ]}
    />
  );
}
