"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { Theme } from "@/lib/theme";
import { THEME_EVENT, loadTheme, saveTheme } from "@/lib/theme";
import { gsap, reducedMotion } from "@/lib/motion";

const ORDER: Theme[] = ["dark", "light", "system"];
const ICON = { dark: Moon, light: Sun, system: Monitor };
const NAME = { dark: "Dark", light: "Light", system: "Match system" };

/** Cycles dark, light, system. The icon turns over as it changes. */
export function ThemeToggleIcon({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const iconRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(loadTheme());
    const onTheme = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_EVENT, onTheme);
    return () => window.removeEventListener(THEME_EVENT, onTheme);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    saveTheme(next);
    if (iconRef.current && !reducedMotion()) {
      gsap.fromTo(iconRef.current, { rotate: -90, scale: 0.6, autoAlpha: 0 }, { rotate: 0, scale: 1, autoAlpha: 1, duration: 0.5, ease: "back.out(2)" });
    }
  }

  const Icon = ICON[theme];
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${NAME[theme]}. Change theme`}
      title={`Theme: ${NAME[theme]}`}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-nimbus-text-muted transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text ${className}`}
    >
      <span ref={iconRef} className="flex">
        <Icon aria-hidden className="h-4 w-4" />
      </span>
    </button>
  );
}
