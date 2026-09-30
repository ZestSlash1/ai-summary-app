"use client";

import { signIn, useSession } from "next-auth/react";
import { Lock, RotateCw } from "lucide-react";
import { useHomeGpu, bonsaiState, type GpuState } from "@/lib/useHomeGpu";
import { GithubMark } from "./BrandMark";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./ui/classes";

/**
 * Why Bonsai is locked, and the way in: signed out, sign in; signed in but not on the
 * allow list, say so plainly instead of hiding the option.
 */
export function BonsaiAccessNote({ compact = false }: { compact?: boolean }) {
  const { status } = useSession();
  const signedOut = status !== "authenticated";
  return (
    <div
      className={`flex items-start gap-2.5 rounded-[10px] border border-nimbus-border bg-nimbus-panel ${
        compact ? "px-3 py-2.5" : "px-3.5 py-3"
      }`}
    >
      <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-nimbus-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] leading-relaxed text-nimbus-text-muted">
          {signedOut
            ? "Bonsai and image editing run on the owner's home PC. Sign in with an allowed GitHub account to use them."
            : "This GitHub account is not on the allow list for Bonsai and image editing."}
        </p>
        {signedOut && (
          <button type="button" onClick={() => signIn("github")} className={`${BUTTON_PRIMARY} mt-2 h-8 px-3 text-[12.5px]`}>
            <GithubMark className="h-3.5 w-3.5" />
            Sign in with GitHub
          </button>
        )}
      </div>
    </div>
  );
}

const dotClass: Record<GpuState, string> = {
  online: "bg-nimbus-free text-nimbus-free",
  busy: "bg-nimbus-warn text-nimbus-warn aro-live-dot",
  sleeping: "bg-nimbus-text-faint text-nimbus-text-faint",
  offline: "bg-nimbus-danger text-nimbus-danger",
};

const bonsaiLabel: Record<GpuState, { label: string; hint: string }> = {
  online: { label: "Online", hint: "Ready to answer." },
  sleeping: { label: "Asleep", hint: "Wakes on your next message. The first reply takes about 15 seconds longer." },
  busy: { label: "Busy", hint: "Answering, or the GPU is in use by an image edit. Try again in a moment." },
  offline: { label: "Offline", hint: "Turn the PC on and start the stack, then check again." },
};

const imageLabel: Record<GpuState, { label: string; hint: string }> = {
  online: { label: "Ready", hint: "An edit usually takes one to two minutes." },
  sleeping: { label: "Ready", hint: "An edit usually takes one to two minutes." },
  busy: { label: "Editing an image", hint: "New edits queue behind the current one." },
  offline: { label: "Offline", hint: "ComfyUI is not running on the PC." },
};

function StateRow({
  name,
  state,
  copy,
}: {
  name: string;
  state: GpuState;
  copy: { label: string; hint: string };
}) {
  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-nimbus-border bg-nimbus-panel px-3.5 py-3">
      <span aria-hidden className={`relative mt-[7px] h-2 w-2 shrink-0 rounded-full ${dotClass[state]}`} />
      <div className="min-w-0">
        <p className="text-[13.5px] text-nimbus-text">
          {name} <span className="text-nimbus-text-muted">{copy.label}</span>
        </p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-nimbus-text-muted">{copy.hint}</p>
      </div>
    </div>
  );
}

/** Settings panel: live state of Bonsai and image editing on the home PC. */
export function GpuStatusPanel() {
  const { allowed, status, checking, refresh } = useHomeGpu({ pollMs: 15_000 });

  if (allowed === false) return <BonsaiAccessNote />;

  if (!status) {
    return (
      <p role="status" className="text-[13px] text-nimbus-text-muted">
        {checking ? "Checking the home PC" : "Could not check the home PC."}
      </p>
    );
  }

  const bonsai = bonsaiState(status);

  return (
    <div className="flex flex-col gap-2.5">
      {!status.reachable && (
        <p role="alert" className="rounded-[10px] bg-nimbus-danger-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-nimbus-text">
          {status.configured
            ? "The home PC did not answer. It may be off, or the tunnel is down."
            : "The home PC is not configured. Set BONSAI_BASE_URL and BONSAI_API_KEY."}
        </p>
      )}
      <StateRow name="Bonsai" state={bonsai} copy={bonsaiLabel[bonsai]} />
      <StateRow name="Image editing" state={status.comfy} copy={imageLabel[status.comfy]} />
      <button type="button" onClick={() => void refresh()} disabled={checking} className={`${BUTTON_SECONDARY} mt-1 self-start`}>
        <RotateCw aria-hidden className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
        {checking ? "Checking" : "Check again"}
      </button>
    </div>
  );
}

/** One line under the source toggle, shown only while Bonsai is the chosen source. */
export function BonsaiStateLine({ active }: { active: boolean }) {
  const { allowed, status } = useHomeGpu({ enabled: active, pollMs: 15_000 });
  if (!active || allowed === false || !status) return null;

  const state = bonsaiState(status);
  return (
    <p role="status" className="flex items-center gap-2 text-[12.5px] text-nimbus-text-muted">
      <span aria-hidden className={`relative h-2 w-2 shrink-0 rounded-full ${dotClass[state]}`} />
      Bonsai is {bonsaiLabel[state].label.toLowerCase()}. {bonsaiLabel[state].hint}
    </p>
  );
}
