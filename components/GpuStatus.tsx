"use client";

import { useHomeGpu, type GpuState } from "@/lib/useHomeGpu";

const dotClass: Record<GpuState, string> = {
  online: "bg-nimbus-free",
  busy: "bg-nimbus-accent",
  sleeping: "bg-nimbus-text-muted",
  offline: "bg-nimbus-border",
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
    <div className="flex items-start gap-3">
      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass[state]}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-nimbus-text">
          {name}: {copy.label}
        </p>
        <p className="text-xs leading-relaxed text-nimbus-text-muted">{copy.hint}</p>
      </div>
    </div>
  );
}

/** Settings panel: live state of Bonsai and image editing on the home PC. */
export function GpuStatusPanel() {
  const { allowed, status, checking, refresh } = useHomeGpu({ pollMs: 15_000 });

  if (allowed === false) {
    return (
      <p className="text-sm leading-relaxed text-nimbus-text-muted">
        Bonsai and image editing run on the owner&apos;s PC and are limited to allowed accounts.
      </p>
    );
  }

  if (!status) {
    return (
      <p role="status" className="text-sm text-nimbus-text-muted">
        {checking ? "Checking the home PC…" : "Could not check the home PC."}
      </p>
    );
  }

  const bonsaiState: GpuState = status.imageBusy && status.bonsai !== "offline" ? "busy" : status.bonsai;

  return (
    <div className="flex flex-col gap-4">
      {!status.reachable && (
        <p role="alert" className="text-sm leading-relaxed text-nimbus-text">
          {status.configured
            ? "The home PC did not answer. It may be off, or the tunnel is down."
            : "The home PC is not configured. Set BONSAI_BASE_URL and BONSAI_API_KEY."}
        </p>
      )}
      <StateRow name="Bonsai" state={bonsaiState} copy={bonsaiLabel[bonsaiState]} />
      <StateRow name="Image editing" state={status.comfy} copy={imageLabel[status.comfy]} />
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={checking}
        className="min-h-11 self-start rounded-[var(--nimbus-radius-pill)] border border-nimbus-border px-3.5 text-xs font-medium text-nimbus-text-muted transition-[color,transform] duration-300 ease-[var(--nimbus-ease)] hover:text-nimbus-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nimbus-accent active:scale-95 disabled:opacity-50 sm:min-h-9"
      >
        {checking ? "Checking…" : "Check again"}
      </button>
    </div>
  );
}

/** One line under the source toggle, shown only while Bonsai is the chosen source. */
export function BonsaiStateLine({ active }: { active: boolean }) {
  const { allowed, status } = useHomeGpu({ enabled: active, pollMs: 15_000 });
  if (!active || allowed === false || !status) return null;

  const state: GpuState = status.imageBusy && status.bonsai !== "offline" ? "busy" : status.bonsai;
  return (
    <p role="status" className="flex items-center gap-2 text-xs text-nimbus-text-muted">
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dotClass[state]}`} />
      Bonsai: {bonsaiLabel[state].label}. {bonsaiLabel[state].hint}
    </p>
  );
}
