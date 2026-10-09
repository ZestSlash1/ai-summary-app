"use client";

import { MODS, changedCount, type ChoiceMod, type ModGroup, type ToggleMod } from "@/lib/mods";
import { useMods } from "@/lib/useMods";

const GROUPS: ModGroup[] = ["Atmosphere", "Motion and reading", "Color"];

function Switch({ mod, on, onChange }: { mod: ToggleMod; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="group/mod flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-nimbus-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium text-nimbus-text">{mod.name}</span>
        <span className="block text-[11.5px] leading-snug text-nimbus-text-muted">{mod.description}</span>
      </span>
      <span
        aria-hidden
        className={`relative h-[18px] w-8 shrink-0 rounded-full border transition-colors duration-200 ${
          on ? "border-nimbus-accent/50 bg-nimbus-accent" : "border-nimbus-border-strong bg-nimbus-surface-3"
        }`}
      >
        <span
          className={`absolute top-[2px] h-3 w-3 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-[var(--nimbus-ease)] ${
            on ? "left-[16px]" : "left-[2px]"
          }`}
        />
      </span>
    </button>
  );
}

function Choice({ mod, value, onChange }: { mod: ChoiceMod; value: string; onChange: (value: string) => void }) {
  return (
    <div className="px-2 py-1.5">
      <span className="block text-[12.5px] font-medium text-nimbus-text">{mod.name}</span>
      <span className="mb-1.5 block text-[11.5px] leading-snug text-nimbus-text-muted">{mod.description}</span>
      <div role="radiogroup" aria-label={mod.name} className="flex flex-wrap gap-1.5">
        {mod.options.map((o) => {
          const picked = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={picked}
              onClick={() => onChange(o.value)}
              className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-medium transition-colors ${
                picked
                  ? "border-nimbus-accent/50 bg-nimbus-accent-soft text-nimbus-text"
                  : "border-nimbus-border bg-nimbus-surface text-nimbus-text-muted hover:border-nimbus-border-strong hover:text-nimbus-text"
              }`}
            >
              {"swatch" in o && o.swatch && (
                <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: o.swatch }} />
              )}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Every mod, grouped, with its switch or choices. Shared by the composer's Mods popover and Settings. */
export function ModsPanel() {
  const { mods, set, reset } = useMods();
  const changed = changedCount(mods);
  return (
    <div className="flex flex-col gap-3">
      {GROUPS.map((group) => (
        <section key={group} aria-label={group} className="flex flex-col gap-0.5">
          <h3 className="px-2 pb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-nimbus-text-faint">{group}</h3>
          {MODS.filter((m) => m.group === group).map((mod) =>
            mod.kind === "toggle" ? (
              <Switch key={mod.id} mod={mod} on={Boolean(mods[mod.id])} onChange={(on) => set(mod.id, on)} />
            ) : (
              <Choice key={mod.id} mod={mod} value={String(mods[mod.id])} onChange={(v) => set(mod.id, v)} />
            ),
          )}
        </section>
      ))}
      <div className="flex items-center justify-between border-t border-nimbus-border px-2 pt-2.5">
        <span className="text-[11.5px] text-nimbus-text-muted">
          {changed === 0 ? "Everything is at its default." : `${changed} changed. Saved on this device.`}
        </span>
        <button
          type="button"
          onClick={reset}
          disabled={changed === 0}
          className="rounded-md px-2 py-1 text-[11.5px] font-medium text-nimbus-accent-text transition-colors hover:bg-nimbus-accent-soft disabled:pointer-events-none disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
