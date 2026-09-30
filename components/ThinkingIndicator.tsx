"use client";

import { useEffect, useState } from "react";

/**
 * "Thinking" with a live second counter, counted from `since` (when the turn began) so the
 * timer carries on when the placeholder row hands over to the reply. On Bonsai, a long wait
 * usually means the home model is loading after a nap, so say that instead of leaving it unexplained.
 */
export function ThinkingIndicator({
  label = "Thinking",
  bonsai = false,
  since,
}: {
  label?: string;
  bonsai?: boolean;
  since?: number;
}) {
  const [start] = useState(() => since || Date.now());
  const [now, setNow] = useState(start);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const seconds = Math.max(0, Math.floor((now - start) / 1000));

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-0.5 py-1 text-[13.5px]">
      <p className="flex items-center gap-2">
        <span className="aro-shimmer font-medium">{label}</span>
        <span className="tabular-nums text-nimbus-text-faint">{seconds}s</span>
      </p>
      {bonsai && seconds >= 8 && (
        <p className="text-[12.5px] text-nimbus-text-muted">
          Bonsai is probably waking up on the home PC. The first reply after a break takes about 15 seconds.
        </p>
      )}
    </div>
  );
}
