"use client";

import { useRef, type ComponentType } from "react";
import {
  Brain,
  Calculator,
  Check,
  Clock,
  FileText,
  FolderTree,
  Globe,
  ListChecks,
  Plug,
  Search,
  Sparkles,
  SquareTerminal,
  Users,
} from "lucide-react";
import { gsap, useGSAP, reducedMotion } from "@/lib/motion";

/** One tool call as the AI SDK stores it on a message part. */
export type ToolCall = {
  id: string;
  name: string;
  state: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
};

type Described = { icon: ComponentType<{ className?: string }>; label: string; detail?: string };

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Icon for a Hermes Agent tool, by the family its name belongs to. */
function hermesIcon(name: string): Described["icon"] {
  if (/terminal|shell|process|execute_code|command/.test(name)) return SquareTerminal;
  if (/web|browser|search_web|fetch|url/.test(name)) return Globe;
  if (/file|patch|read|write|search_files|directory/.test(name)) return FileText;
  if (/memory|session_search|recall/.test(name)) return Brain;
  if (/skill/.test(name)) return Sparkles;
  if (/delegate|subagent/.test(name)) return Users;
  if (/todo|plan/.test(name)) return ListChecks;
  return Plug;
}

/** Plain-language row for a tool call, in the running or finished tense. */
function describe(call: ToolCall, running: boolean): Described {
  const input = call.input ?? {};
  const output = call.output ?? {};
  // Hermes sends its own readable label ("terminal: npm test"), already in the right words.
  const hermesLabel = str(input.label);
  if (hermesLabel) return { icon: hermesIcon(call.name), label: hermesLabel };
  switch (call.name) {
    case "listRepoFiles": {
      const folder = str(input.path);
      const total = num(output.total);
      const where = folder ? ` in ${folder}` : "";
      return {
        icon: FolderTree,
        label: running
          ? `Listing files${where}`
          : `Listed ${total !== undefined ? `${total} ` : ""}files${where}`,
      };
    }
    case "readRepoFile": {
      const path = str(input.path) ?? "a file";
      const start = num(output.startLine);
      const end = num(output.endLine);
      const total = num(output.totalLines);
      return {
        icon: FileText,
        label: running ? `Reading ${path}` : `Read ${path}`,
        detail:
          !running && start && end && total
            ? start === 1 && end === total
              ? `${total} lines`
              : `lines ${start} to ${end} of ${total}`
            : undefined,
      };
    }
    case "searchRepo": {
      const query = str(input.query) ?? "";
      const hits = Array.isArray(output.matches) ? output.matches.length : undefined;
      return {
        icon: Search,
        label: running ? `Searching for "${query}"` : `Searched for "${query}"`,
        detail: hits !== undefined ? `${hits} match${hits === 1 ? "" : "es"}` : undefined,
      };
    }
    case "getCurrentTime":
      return { icon: Clock, label: running ? "Checking the time" : "Checked the time" };
    case "calculate": {
      const expression = str(input.expression) ?? "";
      const result = output.result;
      return {
        icon: Calculator,
        label: running ? `Calculating ${expression}` : `Calculated ${expression}`,
        detail: result !== undefined ? `= ${String(result)}` : undefined,
      };
    }
    default:
      return { icon: Plug, label: running ? `Running ${call.name}` : `Used ${call.name}` };
  }
}

/**
 * The agent's work as a quiet vertical timeline: what it listed, read, and searched.
 * Running steps shimmer; finished ones settle with a check.
 */
export function ToolActivity({ calls }: { calls: ToolCall[] }) {
  const rootRef = useRef<HTMLOListElement>(null);
  const seen = useRef(new Set<string>());

  useGSAP(
    () => {
      const rows = rootRef.current?.querySelectorAll<HTMLElement>("[data-tool-row]");
      rows?.forEach((row) => {
        const id = row.dataset.toolRow!;
        if (seen.current.has(id)) return;
        seen.current.add(id);
        gsap.from(row, { autoAlpha: 0, x: -6, duration: reducedMotion() ? 0 : 0.4, ease: "aro" });
      });
    },
    { dependencies: [calls.length], scope: rootRef }
  );

  return (
    <ol ref={rootRef} className="relative my-2 flex flex-col gap-0.5" aria-label="Steps taken">
      {calls.length > 1 && (
        <span
          aria-hidden
          className="absolute bottom-3 left-[9.5px] top-3 w-px bg-nimbus-border"
        />
      )}
      {calls.map((call) => {
        const failed =
          call.state === "output-error" || typeof call.output?.error === "string";
        const running = !failed && call.state !== "output-available";
        const { icon: Icon, label, detail } = describe(call, running);
        const errorText = failed ? str(call.output?.error) ?? call.errorText : undefined;
        return (
          <li key={call.id} data-tool-row={call.id} className="relative flex min-h-7 items-start gap-2.5 py-1">
            <span
              className={`relative z-10 mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-nimbus-panel ${
                failed ? "border-nimbus-danger/40 text-nimbus-danger" : "border-nimbus-border text-nimbus-text-muted"
              }`}
            >
              <Icon aria-hidden className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1 text-[13px] leading-5">
              <span className={running ? "aro-shimmer" : failed ? "text-nimbus-text" : "text-nimbus-text-muted"}>
                {label}
              </span>
              {detail && !failed && <span className="ml-2 text-nimbus-text-faint">{detail}</span>}
              {!running && !failed && (
                <Check aria-hidden className="ml-1.5 inline h-3.5 w-3.5 -translate-y-px text-nimbus-free/80" />
              )}
              {errorText && <p className="text-[12.5px] text-nimbus-danger">{errorText}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
