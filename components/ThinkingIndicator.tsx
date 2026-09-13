"use client";

import { useEffect, useState } from "react";

export function ThinkingIndicator() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 self-start px-1 py-1 text-sm text-nimbus-text-muted"
    >
      <span className="nimbus-tick-dot h-1.5 w-1.5 shrink-0 rounded-full bg-nimbus-accent" />
      <span>Thinking for {seconds}s…</span>
    </div>
  );
}
