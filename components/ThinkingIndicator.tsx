import { ThinkingWave } from "./ThinkingWave";

export function ThinkingIndicator() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex items-center gap-2.5 self-start overflow-hidden rounded-[var(--nimbus-radius-card)] rounded-bl-lg border border-nimbus-border bg-nimbus-surface px-4 py-3 shadow-[var(--nimbus-shadow)]"
    >
      <ThinkingWave />
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="nimbus-thinking-ring absolute inset-0 rounded-full [mask:radial-gradient(farthest-side,transparent_calc(100%-2px),#000_calc(100%-2px))]" />
        <span className="nimbus-thinking-core h-2.5 w-2.5 rounded-full bg-gradient-to-br from-nimbus-accent to-nimbus-free" />
      </span>
      <span className="nimbus-thinking-label relative text-sm font-medium">
        Thinking
      </span>
    </div>
  );
}
