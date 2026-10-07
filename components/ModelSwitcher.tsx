"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronDown, Cpu, Lock, Search, Sparkles } from "lucide-react";
import type { ModelOption } from "@/lib/types";
import { loadModelSource, type ModelSource } from "@/lib/storage";
import { fetchModelCatalog } from "@/lib/models";
import { SOURCE_INFO, isQualifiedRef, parseModelRef, toModelRef } from "@/lib/modelRef";
import { bonsaiState, useHomeGpu, type GpuState } from "@/lib/useHomeGpu";
import { PopoverPanel } from "./Popover";
import { AccessNote } from "./GpuStatus";
import { Segmented } from "./ui/Segmented";
import { CHIP, FIELD } from "./ui/classes";
import { iconWiggle } from "@/lib/motion";

type Catalog = { models: ModelOption[]; failed: boolean };
type Kind = "local" | "free" | "paid";
type Row = { ref: string; source: ModelSource; model: ModelOption; kind: Kind };
/**
 * A locked group shows one row that opens the reason instead of its models. Its rows are
 * never listed; they let a search say how many locked models match instead of "no match".
 */
type Locked = { subject: "bonsai" | "paid"; label: string };
type Group = { key: string; kind: Kind; title: string; note: string; rows: Row[]; locked?: Locked; state?: GpuState };
type Filter = "all" | Kind;

const BONSAI_NOTE: Record<GpuState, string> = {
  online: "Ready. Private and free: nothing leaves your network except through your tunnel.",
  sleeping: "Asleep. Wakes on your next message; the first reply takes about 15 seconds longer.",
  busy: "Busy with another reply or an image edit. Messages wait their turn.",
  offline: "Not answering. Turn the home PC on and start the stack.",
};
const HERMES_NOTE = {
  online: "Runs real tasks on your PC: terminal, files, web, and its own memory. Asks before risky commands.",
  offline: "Not answering. Start it in WSL with: hermes gateway",
} as const;

const STATE_DOT: Record<GpuState, string> = {
  online: "bg-nimbus-free",
  sleeping: "bg-nimbus-text-faint",
  busy: "bg-nimbus-warn",
  offline: "bg-nimbus-danger",
};

function pickDefault(models: ModelOption[]): ModelOption {
  return models.find((m) => m.free) ?? models[0];
}

/**
 * The model picker. One grouped list across every source you can use: models on your own
 * PC, free cloud models (and where they are free), and paid ones. Picking a model picks its
 * source, stored with the chat, so a chat can never show one source and send to another.
 */
export function ModelSwitcher({
  value,
  onChange,
  open: openProp,
  onOpenChange,
  placement = "up",
  variant = "chip",
}: {
  /** A "source::id" ref. Bare ids from older chats read with the old app-wide source. */
  value: string;
  onChange: (modelRef: string) => void;
  /** Set to control the picker from outside (the composer's /model command). Unset, it opens itself. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: "up" | "down";
  variant?: "chip" | "field";
}) {
  const { allowed: homeAllowed, status: gpu } = useHomeGpu({ pollMs: 30_000 });
  // The home PC and paid models share one allow list; the server enforces both.
  const paidLocked = homeAllowed === false;
  const [legacySource, setLegacySource] = useState<ModelSource | null>(null);
  const [catalogs, setCatalogs] = useState<Partial<Record<ModelSource, Catalog>>>({});
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  function setOpen(next: boolean) {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  }
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [lockedNote, setLockedNote] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    // Old chats store a bare id; the app-wide source they were made with lives in storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLegacySource(loadModelSource());
  }, []);

  const qualified = isQualifiedRef(value);
  const current = parseModelRef(value, legacySource ?? "gateway");
  const bonsaiNow = gpu ? bonsaiState(gpu) : null;

  // Hermes shows up once the gateway reports it set up (online or not).
  const hermesState = gpu?.hermes && gpu.hermes !== "unconfigured" ? gpu.hermes : null;
  const sources = useMemo<ModelSource[]>(
    () =>
      homeAllowed
        ? ["bonsai", ...(hermesState ? (["hermes"] as const) : []), "gateway", "omniroute"]
        : ["gateway", "omniroute"],
    [homeAllowed, hermesState]
  );

  useEffect(() => {
    let cancelled = false;
    for (const source of sources) {
      fetchModelCatalog(source, open)
        .then((models) => !cancelled && setCatalogs((prev) => ({ ...prev, [source]: { models, failed: false } })))
        .catch(() => !cancelled && setCatalogs((prev) => ({ ...prev, [source]: { models: [], failed: true } })));
    }
    return () => {
      cancelled = true;
    };
  }, [sources, open]);

  // Keep the chat's model real: inside its source's catalog, on a source this account can
  // use, and stored with its source so it never depends on the old app-wide setting.
  useEffect(() => {
    if (!qualified && legacySource === null) return;
    if (SOURCE_INFO[current.source].local && homeAllowed === false) {
      const gateway = catalogs.gateway?.models;
      if (gateway?.length) onChangeRef.current(toModelRef("gateway", pickDefault(gateway).id));
      return;
    }
    const catalog = catalogs[current.source];
    if (!catalog || catalog.models.length === 0) return; // unknown yet, or the PC is off: keep the choice
    const usable = paidLocked ? catalog.models.filter((m) => m.free) : catalog.models;
    if (usable.some((m) => m.id === current.id)) {
      if (!qualified) onChangeRef.current(toModelRef(current.source, current.id));
      return;
    }
    // Gone from the catalog, or paid on an account limited to free models.
    if (usable.length > 0) {
      onChangeRef.current(toModelRef(current.source, pickDefault(usable).id));
      return;
    }
    const freeGateway = catalogs.gateway?.models.find((m) => m.free);
    if (freeGateway) onChangeRef.current(toModelRef("gateway", freeGateway.id));
  }, [catalogs, qualified, legacySource, current.source, current.id, homeAllowed, paidLocked]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setLockedNote(null);
      return;
    }
    if (window.matchMedia("(pointer: fine)").matches) window.setTimeout(() => searchRef.current?.focus(), 60);
  }, [open]);

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];
    const rows = (source: ModelSource, kind: Kind, list: ModelOption[]) =>
      list.map((model) => ({ ref: toModelRef(source, model.id), source, model, kind }));

    if (homeAllowed === false) {
      out.push({
        key: "local",
        kind: "local",
        title: "On your PC",
        note: "Bonsai runs on the owner's home PC.",
        rows: [],
        locked: { subject: "bonsai", label: "Bonsai" },
      });
    } else if (catalogs.bonsai) {
      const state = bonsaiNow ?? (catalogs.bonsai.failed ? "offline" : undefined);
      const ctxLabel = gpu?.bonsaiContext ? `${Math.round(gpu.bonsaiContext / 1024)}k context` : null;
      const baseNote = state ? BONSAI_NOTE[state] : "Runs on your home PC. Private and free.";
      const note = ctxLabel && state !== "offline" ? `${baseNote} · ${ctxLabel}` : baseNote;
      out.push({
        key: "local",
        kind: "local",
        title: "On your PC · Bonsai",
        note,
        rows: rows("bonsai", "local", catalogs.bonsai.models),
        state,
      });
    }
    if (homeAllowed && hermesState) {
      out.push({
        key: "agent",
        kind: "local",
        title: "On your PC · Hermes agent",
        note: HERMES_NOTE[hermesState],
        rows: rows("hermes", "local", catalogs.hermes?.models ?? []),
        state: hermesState,
      });
    }
    const gateway = catalogs.gateway?.models ?? [];
    const omni = catalogs.omniroute?.models ?? [];
    out.push(
      {
        key: "free-gateway",
        kind: "free",
        title: "Free on AI Gateway",
        note: "No token charges on your AI Gateway account. Rate limits apply.",
        rows: rows("gateway", "free", gateway.filter((m) => m.free)),
      },
      {
        key: "free-omni",
        kind: "free",
        title: "Free on OmniRoute",
        note: "Free tiers routed through your OmniRoute server.",
        rows: rows("omniroute", "free", omni.filter((m) => m.free)),
      }
    );
    if (paidLocked) {
      out.push({
        key: "paid",
        kind: "paid",
        title: "Paid models",
        note: "Billed per token to the owner's AI Gateway and OmniRoute accounts.",
        rows: [...rows("gateway", "paid", gateway.filter((m) => !m.free)), ...rows("omniroute", "paid", omni.filter((m) => !m.free))],
        locked: { subject: "paid", label: "Paid models" },
      });
    } else {
      out.push(
        {
          key: "paid-gateway",
          kind: "paid",
          title: "AI Gateway · paid per token",
          note: "Billed to your AI Gateway credits for every message.",
          rows: rows("gateway", "paid", gateway.filter((m) => !m.free)),
        },
        {
          key: "paid-omni",
          kind: "paid",
          title: "OmniRoute · your providers",
          note: "Uses the accounts connected to your OmniRoute server.",
          rows: rows("omniroute", "paid", omni.filter((m) => !m.free)),
        }
      );
    }
    return out;
  }, [catalogs, homeAllowed, paidLocked, bonsaiNow, hermesState, gpu]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .filter((g) => filter === "all" || g.kind === filter)
      .map((g) => ({
        ...g,
        rows: q ? g.rows.filter((r) => r.model.name.toLowerCase().includes(q) || r.model.id.toLowerCase().includes(q)) : g.rows,
      }))
      .filter((g) => g.rows.length > 0 || (!q && (g.locked || (g.kind === "local" && g.state))));
  }, [groups, filter, query]);

  const entry = catalogs[current.source]?.models.find((m) => m.id === current.id);
  const local = SOURCE_INFO[current.source].local;
  // A local model shows its source's name until its catalog answers, never a stale cloud id.
  const label = entry?.name ?? (local ? SOURCE_INFO[current.source].name : (current.id.split("/").pop() ?? current.id));
  const loading = sources.some((s) => !catalogs[s]);
  const gatewayFailed = catalogs.gateway?.failed;
  const agent = current.source === "hermes";
  const ChipIcon = agent ? Bot : local ? Cpu : Sparkles;
  const selectedRef = toModelRef(current.source, current.id);
  const chipTitle = `${label}: ${local ? "runs on " : entry?.free ? "free on " : "via "}${SOURCE_INFO[current.source].runs}`;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Model: ${label}${local ? ", local" : entry?.free ? ", free" : ""}`}
        title={chipTitle}
        data-wiggle="pop"
        onPointerEnter={iconWiggle}
        className={
          variant === "chip"
            ? CHIP
            : "flex h-10 w-full min-w-60 items-center gap-2 rounded-lg border border-nimbus-border bg-nimbus-surface px-3 text-[13px] text-nimbus-text transition-colors hover:border-nimbus-border-strong sm:w-auto"
        }
      >
        <ChipIcon
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 ${agent ? "text-nimbus-agent" : local ? "text-nimbus-local" : entry?.free ? "text-nimbus-free" : ""}`}
        />
        <span className={`truncate ${variant === "chip" ? "max-w-[9rem] @max-[34rem]/controls:max-w-[6.5rem]" : "flex-1 text-left"}`}>{label}</span>
        {local ? (
          <span
            className={`rounded-[5px] px-1.5 py-px text-[10.5px] font-medium @max-[34rem]/controls:hidden ${
              agent ? "bg-nimbus-agent-soft text-nimbus-agent" : "bg-nimbus-local-soft text-nimbus-local"
            }`}
          >
            {agent ? "Agent" : "Local"}
          </span>
        ) : entry?.free ? (
          <span className="rounded-[5px] bg-nimbus-free-soft px-1.5 py-px text-[10.5px] font-medium text-nimbus-free @max-[34rem]/controls:hidden">Free</span>
        ) : null}
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-300 ease-[var(--nimbus-ease)] ${open ? "rotate-180" : ""}`}
        />
      </button>

      <PopoverPanel
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement={placement === "up" ? "top-start" : "bottom-start"}
        width={360}
        label="Choose a model"
        className="p-1.5"
      >
        <div className="flex flex-col gap-2 p-1.5 pb-2">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-nimbus-text-faint" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models"
              aria-label="Search models"
              className={`${FIELD} pl-8`}
            />
          </div>
          <Segmented
            label="Show"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "local", label: "Local" },
              { value: "free", label: "Free" },
              { value: "paid", label: "Paid" },
            ]}
          />
        </div>

        <div role="listbox" aria-label="Models" className="min-h-0 flex-1 overflow-y-auto border-t border-nimbus-border sm:max-h-[22rem]">
          {visibleGroups.map((group) => (
            <section key={group.key} aria-label={group.title} className="pb-1">
              <div className="sticky top-0 z-10 bg-nimbus-surface px-2.5 pb-1.5 pt-2.5">
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-nimbus-text">
                  {group.locked && <Lock aria-hidden className="h-3 w-3 text-nimbus-text-muted" />}
                  {group.state && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[group.state]}`} />}
                  {group.title}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-nimbus-text-muted">{group.note}</p>
              </div>
              {group.locked ? (
                lockedNote === group.key ? (
                  <div className="px-1.5 pb-1.5">
                    <AccessNote subject={group.locked.subject} compact />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setLockedNote(group.key)}
                    className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-nimbus-text-faint transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text-muted"
                  >
                    {group.locked.subject === "paid" ? (
                      <Sparkles aria-hidden className="h-3.5 w-3.5" />
                    ) : (
                      <Cpu aria-hidden className="h-3.5 w-3.5" />
                    )}
                    <span className="flex-1">
                      {group.rows.length > 0 ? `${group.rows.length} model${group.rows.length === 1 ? "" : "s"}` : group.locked.label}
                    </span>
                    <span className="text-[11px]">Why locked?</span>
                  </button>
                )
              ) : (
                group.rows.map((row) => {
                  const selected = row.ref === selectedRef;
                  return (
                    <button
                      key={row.ref}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange(row.ref);
                        setOpen(false);
                      }}
                      className={`mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-nimbus-text transition-[background-color,scale] duration-150 ease-[var(--nimbus-ease)] hover:bg-nimbus-surface-2 motion-safe:active:scale-[0.985] ${
                        selected ? "bg-nimbus-surface-2" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{row.model.name}</span>
                      {row.kind === "local" && (
                        <span className={`text-[11px] ${row.source === "hermes" ? "text-nimbus-agent" : "text-nimbus-local"}`}>
                          {row.source === "hermes" ? "Agent" : "Local"}
                        </span>
                      )}
                      {row.kind === "free" && <span className="text-[11px] text-nimbus-free">Free</span>}
                      <Check
                        key={selected ? "on" : "off"}
                        aria-hidden
                        className={`h-3.5 w-3.5 shrink-0 text-nimbus-accent-text ${selected ? "aro-pop-in" : "invisible"}`}
                      />
                    </button>
                  );
                })
              )}
            </section>
          ))}

          {loading && (
            <div className="flex flex-col gap-1.5 p-3" aria-label="Loading models">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-4 animate-pulse rounded bg-nimbus-surface-2" style={{ width: `${78 - i * 14}%` }} />
              ))}
            </div>
          )}
          {!loading && visibleGroups.length === 0 && (
            <p className="px-3 py-4 text-[13px] text-nimbus-text-muted">
              {query ? "No models match." : gatewayFailed ? "Could not load models. Try again in a moment." : "Nothing in this group."}
            </p>
          )}
        </div>
      </PopoverPanel>
    </div>
  );
}
