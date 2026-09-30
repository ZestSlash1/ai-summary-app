"use client";

import { useRef, useState } from "react";
import {
  Check,
  Cpu,
  FileText,
  Footprints,
  Shield,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { PopoverPanel } from "@/components/Popover";
import { CHIP, CHIP_LABEL_EXTRA, CHIP_ON } from "@/components/ui/classes";
import { iconWiggle } from "@/lib/motion";
import type {
  AgentEffort,
  AgentOptions,
  AgentPermission,
  AgentToolToggles,
} from "@/lib/types";

interface AgentOptionsPopoverProps {
  options: AgentOptions;
  onChange: (options: AgentOptions) => void;
}

const DEFAULT_TOOLS: AgentToolToggles = {
  repo: true,
  web: true,
  calculate: true,
  imageEdit: true,
};

export function AgentOptionsPopover({
  options,
  onChange,
}: AgentOptionsPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const effort = options.effort ?? "medium";
  const permission = options.permission ?? "ask";
  const tools = { ...DEFAULT_TOOLS, ...options.tools };
  const maxSteps = options.maxSteps ?? 10;
  const customInstructions = options.customInstructions ?? "";

  const isCustomized = Boolean(
    options.effort ||
      options.permission ||
      options.tools ||
      options.maxSteps ||
      options.customInstructions?.trim()
  );

  const updateOptions = (patch: Partial<AgentOptions>) => {
    onChange({
      ...options,
      ...patch,
    });
  };

  const handleToolToggle = (key: keyof AgentToolToggles) => {
    const nextTools = {
      ...tools,
      [key]: !tools[key],
    };
    updateOptions({ tools: nextTools });
  };

  const resetToDefaults = () => {
    onChange({});
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-label="Agent options"
        onClick={() => setOpen((prev) => !prev)}
        title="Agent options: effort, permissions, tools, and max steps"
        data-wiggle="nudge"
        onPointerEnter={iconWiggle}
        className={`${CHIP} ${isCustomized ? CHIP_ON : ""}`}
      >
        <SlidersHorizontal aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className={CHIP_LABEL_EXTRA}>Options</span>
        {isCustomized && <span aria-hidden className="aro-pop-in h-1.5 w-1.5 rounded-full bg-nimbus-accent" />}
      </button>

      <PopoverPanel
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        className="w-[calc(100vw-32px)] max-w-[340px] p-3.5 sm:max-w-[380px]"
      >
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-nimbus-border pb-2.5">
            <div>
              <p className="text-[13px] font-semibold text-nimbus-text">
                Agent Options
              </p>
              <p className="text-[11px] text-nimbus-text-muted">
                Reasoning effort, safety permissions, and tool access.
              </p>
            </div>
            {isCustomized && (
              <button
                type="button"
                onClick={resetToDefaults}
                className="text-[11px] font-medium text-nimbus-accent hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          {/* Effort / Thinking */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-nimbus-text">
              <Cpu aria-hidden className="h-3.5 w-3.5 text-nimbus-accent" />
              <span>Reasoning Effort</span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-nimbus-border bg-nimbus-surface p-1">
              {(["low", "medium", "high"] as AgentEffort[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => updateOptions({ effort: level })}
                  className={`rounded-md py-1 text-[11.5px] font-medium capitalize transition-colors ${
                    effort === level
                      ? "bg-nimbus-accent text-white"
                      : "text-nimbus-text-muted hover:text-nimbus-text"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Permission Mode */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-nimbus-text">
              <Shield aria-hidden className="h-3.5 w-3.5 text-nimbus-accent" />
              <span>Permission Mode</span>
            </div>
            <div className="flex flex-col gap-1">
              {[
                {
                  id: "ask" as AgentPermission,
                  label: "Ask before writes",
                  desc: "Push is a button you press, and Hermes asks before risky commands",
                },
                {
                  id: "auto" as AgentPermission,
                  label: "Auto-accept edits",
                  desc: "Hermes applies file edits without asking. Risky commands and pushes still need your OK",
                },
                {
                  id: "readonly" as AgentPermission,
                  label: "Read-only",
                  desc: "No pushes or image edits. Hermes is told not to change anything and risky commands are denied",
                },
              ].map((perm) => (
                <button
                  key={perm.id}
                  type="button"
                  onClick={() => updateOptions({ permission: perm.id })}
                  className={`flex items-start justify-between rounded-lg border p-2 text-left transition-colors ${
                    permission === perm.id
                      ? "border-nimbus-accent/50 bg-nimbus-accent-soft text-nimbus-text"
                      : "border-nimbus-border bg-nimbus-surface hover:bg-nimbus-surface-2"
                  }`}
                >
                  <div>
                    <p className="text-[12px] font-medium text-nimbus-text">
                      {perm.label}
                    </p>
                    <p className="text-[11px] text-nimbus-text-muted">
                      {perm.desc}
                    </p>
                  </div>
                  {permission === perm.id && (
                    <Check
                      aria-hidden
                      className="h-3.5 w-3.5 shrink-0 text-nimbus-accent"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tools Toggles */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-nimbus-text">
              <Wrench aria-hidden className="h-3.5 w-3.5 text-nimbus-accent" />
              <span>Tools Enabled</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { key: "repo" as keyof AgentToolToggles, label: "Repo access" },
                { key: "web" as keyof AgentToolToggles, label: "Web and search" },
                { key: "calculate" as keyof AgentToolToggles, label: "Calculator" },
                { key: "imageEdit" as keyof AgentToolToggles, label: "Image edit" },
              ].map(({ key, label }) => {
                const active = tools[key] !== false;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleToolToggle(key)}
                    className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] transition-colors ${
                      active
                        ? "border-nimbus-accent/40 bg-nimbus-accent-soft text-nimbus-text"
                        : "border-nimbus-border bg-nimbus-surface text-nimbus-text-faint hover:text-nimbus-text"
                    }`}
                  >
                    <span>{label}</span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        active ? "bg-nimbus-accent" : "bg-nimbus-text-faint/30"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Max Steps */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-nimbus-text">
              <Footprints aria-hidden className="h-3.5 w-3.5 text-nimbus-accent" />
              <span>Max Autonomous Steps</span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-nimbus-border bg-nimbus-surface p-1">
              {[5, 10, 25].map((steps) => (
                <button
                  key={steps}
                  type="button"
                  onClick={() => updateOptions({ maxSteps: steps })}
                  className={`rounded-md py-1 text-[11.5px] font-medium transition-colors ${
                    maxSteps === steps
                      ? "bg-nimbus-accent text-white"
                      : "text-nimbus-text-muted hover:text-nimbus-text"
                  }`}
                >
                  {steps} steps
                </button>
              ))}
            </div>
          </div>

          {/* Custom Instructions */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-nimbus-text">
              <FileText aria-hidden className="h-3.5 w-3.5 text-nimbus-accent" />
              <span>Session Custom Instructions</span>
            </div>
            <textarea
              value={customInstructions}
              onChange={(e) =>
                updateOptions({ customInstructions: e.target.value })
              }
              placeholder="Specific guidelines for this session (e.g. Always generate TypeScript strict types)"
              rows={2}
              className="w-full resize-none rounded-lg border border-nimbus-border bg-nimbus-surface p-2 text-[16px] text-nimbus-text placeholder:text-nimbus-text-faint focus:border-nimbus-accent focus:outline-none md:text-[12px]"
            />
          </div>
        </div>
      </PopoverPanel>
    </>
  );
}
