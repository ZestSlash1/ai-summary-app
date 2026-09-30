"use client";

import { useEffect, useRef, useState } from "react";
import {
  Cpu,
  ListChecks,
  Plus,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";

export interface SlashCommand {
  id: "plan" | "clear" | "compact" | "model" | "skills" | "new";
  label: string;
  description: string;
  icon: typeof ListChecks;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "plan",
    label: "/plan",
    description: "Toggle plan mode on or off",
    icon: ListChecks,
  },
  {
    id: "clear",
    label: "/clear",
    description: "Clear conversation history",
    icon: Trash2,
  },
  {
    id: "compact",
    label: "/compact",
    description: "Summarize and compress context",
    icon: Zap,
  },
  {
    id: "model",
    label: "/model",
    description: "Switch active model",
    icon: Cpu,
  },
  {
    id: "skills",
    label: "/skills",
    description: "Open skills catalog and tools",
    icon: Sparkles,
  },
  {
    id: "new",
    label: "/new",
    description: "Start a new conversation",
    icon: Plus,
  },
];

/** The commands a composer value such as "/mo" matches. */
export function matchSlashCommands(query: string): SlashCommand[] {
  const cleanQuery = query.startsWith("/") ? query.slice(1).trim().toLowerCase() : query.trim().toLowerCase();
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.id.toLowerCase().includes(cleanQuery) ||
      cmd.label.toLowerCase().includes(cleanQuery) ||
      cmd.description.toLowerCase().includes(cleanQuery)
  );
}

interface SlashCommandMenuProps {
  query: string;
  onSelect: (commandId: SlashCommand["id"]) => void;
  onClose: () => void;
}

export function SlashCommandMenu({
  query,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const cleanQuery = query.startsWith("/") ? query.slice(1).trim().toLowerCase() : query.trim().toLowerCase();

  const filtered = matchSlashCommands(query);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIndex(0);
  }, [cleanQuery]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (filtered.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filtered[selectedIndex]) {
          e.preventDefault();
          onSelect(filtered[selectedIndex].id);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filtered, selectedIndex, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Slash commands"
      className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-xl border border-nimbus-border bg-nimbus-surface p-1.5 shadow-[var(--nimbus-shadow-elevated)] backdrop-blur-md z-40"
    >
      <div className="px-2 py-1 text-[11px] font-medium text-nimbus-text-faint uppercase tracking-wider">
        Commands
      </div>
      <div className="flex flex-col gap-0.5">
        {filtered.map((cmd, idx) => {
          const Icon = cmd.icon;
          const active = idx === selectedIndex;
          return (
            <button
              key={cmd.id}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(cmd.id)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                active
                  ? "bg-nimbus-accent-soft text-nimbus-text"
                  : "text-nimbus-text-muted hover:bg-nimbus-surface-2 hover:text-nimbus-text"
              }`}
            >
              <Icon
                aria-hidden
                className={`h-4 w-4 shrink-0 ${
                  active ? "text-nimbus-accent" : "text-nimbus-text-muted"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[12px] font-medium text-nimbus-text">
                  {cmd.label}
                </p>
                <p className="truncate text-[11px] text-nimbus-text-muted">
                  {cmd.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
