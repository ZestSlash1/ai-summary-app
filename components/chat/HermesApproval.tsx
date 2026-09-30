"use client";

import { useRef, useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { gsap, useGSAP, reducedMotion } from "@/lib/motion";
import type { HermesApproval } from "@/lib/hermesStream";

const CHOICE_LABEL: Record<string, string> = {
  once: "Allow once",
  session: "Allow for this chat",
  always: "Always allow",
  deny: "Deny",
};
const ANSWERED_LABEL: Record<string, string> = {
  once: "Allowed once",
  session: "Allowed for this chat",
  always: "Always allowed",
  deny: "Denied",
};

type State = { kind: "waiting" } | { kind: "sending"; choice: string } | { kind: "answered"; choice: string } | { kind: "error"; message: string };

/**
 * Hermes asks before running a command it flags as risky (deleting files, installing
 * packages, touching system settings). The turn is paused until the user answers here.
 * Once the reply has ended, an unanswered request can no longer be answered.
 */
export function HermesApprovalCard({ approval, live }: { approval: HermesApproval; live: boolean }) {
  const [state, setState] = useState<State>({ kind: "waiting" });
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from(ref.current, { autoAlpha: 0, y: 8, scale: 0.98, duration: reducedMotion() ? 0 : 0.45, ease: "aro" });
    },
    { scope: ref }
  );

  async function answer(choice: string) {
    setState({ kind: "sending", choice });
    try {
      const res = await fetch("/api/hermes/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: approval.runId, choice, requestId: approval.requestId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Hermes did not take the answer.");
      setState({ kind: "answered", choice });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Hermes did not take the answer." });
    }
  }

  const answered = state.kind === "answered" ? state.choice : null;
  const expired = !live && state.kind !== "answered";
  const Icon = answered === "deny" ? ShieldX : answered ? ShieldCheck : ShieldAlert;

  return (
    <div
      ref={ref}
      role={state.kind === "waiting" && live ? "alert" : undefined}
      className={`my-3 overflow-hidden rounded-[12px] border ${
        answered || expired ? "border-nimbus-border bg-nimbus-surface" : "border-nimbus-warn/40 bg-nimbus-surface"
      }`}
    >
      <div className="flex items-start gap-2.5 px-3.5 pt-3">
        <Icon
          aria-hidden
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            answered === "deny" ? "text-nimbus-danger" : answered ? "text-nimbus-free" : "text-nimbus-warn"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-nimbus-text">
            {answered ? ANSWERED_LABEL[answered] ?? "Answered" : expired ? "Approval request ended" : "Hermes wants to run a command"}
          </p>
          {approval.description && <p className="mt-0.5 text-[12.5px] leading-relaxed text-nimbus-text-muted">{approval.description}</p>}
        </div>
      </div>
      {approval.command && (
        <pre className="aro-no-scrollbar mx-3.5 mt-2.5 overflow-x-auto rounded-lg bg-nimbus-chrome px-3 py-2 font-mono text-[12px] leading-relaxed text-nimbus-text">
          {approval.command}
        </pre>
      )}
      {!answered && !expired && (
        <div className="flex flex-wrap gap-1.5 px-3.5 pb-3 pt-3">
          {approval.choices.map((choice) => {
            const sending = state.kind === "sending" && state.choice === choice;
            const primary = choice === "once";
            const deny = choice === "deny";
            return (
              <button
                key={choice}
                type="button"
                disabled={state.kind === "sending"}
                onClick={() => answer(choice)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium transition-[background-color,transform] duration-200 active:scale-[0.97] disabled:opacity-60 ${
                  primary
                    ? "bg-nimbus-accent text-white hover:bg-nimbus-accent-hover"
                    : deny
                      ? "border border-nimbus-danger/30 text-nimbus-danger hover:bg-nimbus-danger-soft"
                      : "border border-nimbus-border text-nimbus-text hover:bg-nimbus-surface-2"
                }`}
              >
                {sending && <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />}
                {CHOICE_LABEL[choice] ?? choice}
              </button>
            );
          })}
        </div>
      )}
      {(answered || expired) && <div className="h-3" />}
      {state.kind === "error" && (
        <p role="alert" className="border-t border-nimbus-border px-3.5 py-2 text-[12.5px] text-nimbus-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}
