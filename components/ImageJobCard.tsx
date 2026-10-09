"use client";

import { useEffect, useState } from "react";
import { Download, ImageOff, RotateCw } from "lucide-react";

// What the button on an error does: re-read the job ("poll"), start the edit again ("retry"), or nothing.
type ErrorAction = "poll" | "retry" | "none";

type Phase =
  | { kind: "pending"; queued: boolean }
  | { kind: "done" }
  | { kind: "error"; message: string; action: ErrorAction };

const POLL_MS = 2500;
const GIVE_UP_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const buttonClass =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-nimbus-border bg-nimbus-surface px-3 text-[12.5px] font-medium text-nimbus-text-muted transition-[color,background-color,transform] duration-200 hover:bg-nimbus-surface-2 hover:text-nimbus-text active:scale-95";

/**
 * Shows an image job (an edit, or a picture made from text): a placeholder while it runs, the picture when it is done,
 * and a clear message when it is not. Polls the job route until it settles.
 * `error` is a failure already known when the card mounts (the tool could not start the job).
 */
export function ImageJobCard({
  jobId,
  error,
  instruction,
  kind = "edit",
  onRetry,
}: {
  jobId?: string;
  error?: string;
  instruction?: string;
  /** "edit" changes an attached picture; "create" makes one from a description. */
  kind?: "edit" | "create";
  onRetry?: () => void;
}) {
  const noun = kind === "create" ? "image" : "edit";
  const [phase, setPhase] = useState<Phase>(
    error
      ? { kind: "error", message: error, action: "retry" }
      : { kind: "pending", queued: false },
  );
  const [elapsed, setElapsed] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const pending = phase.kind === "pending";

  // Poll the job until it is done or has failed.
  useEffect(() => {
    if (!jobId || error) return;
    let cancelled = false;
    let failures = 0;
    const started = Date.now();

    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch(`/api/image-jobs/${jobId}`, { cache: "no-store" });
          if (res.status === 401 || res.status === 403) {
            if (!cancelled) {
              setPhase({ kind: "error", message: "Sign in again to see this image.", action: "none" });
            }
            return;
          }
          if (res.status === 400) {
            if (!cancelled) {
              setPhase({ kind: "error", message: `This ${noun} could not be found.`, action: "none" });
            }
            return;
          }
          if (!res.ok) throw new Error(String(res.status));
          failures = 0;
          const body = (await res.json()) as { status: string; message?: string };
          if (cancelled) return;
          if (body.status === "done") return setPhase({ kind: "done" });
          if (body.status === "error") {
            return setPhase({ kind: "error", message: body.message || `The ${noun} failed.`, action: "retry" });
          }
          if (body.status === "unknown") {
            return setPhase({
              kind: "error",
              message: `This ${noun} is no longer available. The image server may have restarted.`,
              action: "retry",
            });
          }
          setPhase({ kind: "pending", queued: body.status === "queued" });
        } catch {
          failures += 1;
          if (failures >= MAX_FAILURES && !cancelled) {
            return setPhase({
              kind: "error",
              message: "Lost contact with the image server. Check that the PC is on.",
              action: "poll",
            });
          }
        }
        if (Date.now() - started > GIVE_UP_MS) {
          if (!cancelled) {
            setPhase({ kind: "error", message: "This is taking longer than expected.", action: "poll" });
          }
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [jobId, error, attempt]);

  // Elapsed timer, only while the job is running.
  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [pending]);

  const src = jobId ? `/api/image-jobs/${jobId}/image` : undefined;
  const alt =
    kind === "create"
      ? instruction ? `Generated image: ${instruction}` : "Generated image"
      : instruction ? `Edited image: ${instruction}` : "Edited image";

  function checkAgain() {
    setPhase({ kind: "pending", queued: false });
    setElapsed(0);
    setLoaded(false);
    setAttempt((n) => n + 1);
  }

  if (phase.kind === "error") {
    const canPoll = Boolean(jobId && !error) && phase.action === "poll";
    const canRetry = phase.action === "retry" && Boolean(onRetry);
    return (
      <div
        role="alert"
        className="mt-2 flex w-full max-w-[22rem] flex-col gap-3 rounded-[14px] border border-nimbus-danger/25 bg-nimbus-danger-soft p-4"
      >
        <div className="flex items-start gap-2.5">
          <ImageOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-nimbus-text-muted" />
          <p className="text-sm leading-relaxed text-nimbus-text">{phase.message}</p>
        </div>
        {(canPoll || canRetry) && (
          <button
            type="button"
            onClick={canPoll ? checkAgain : onRetry}
            className={`${buttonClass} self-start`}
          >
            <RotateCw aria-hidden className="h-3.5 w-3.5" />
            {canPoll ? "Check again" : "Try again"}
          </button>
        )}
      </div>
    );
  }

  return (
    <figure className="mt-2 flex w-full max-w-[22rem] flex-col gap-2 text-nimbus-text">
      <div
        className={`relative w-full overflow-hidden rounded-[14px] border border-nimbus-border bg-nimbus-surface ${
          phase.kind === "done" && loaded ? "" : "aspect-square"
        } ${phase.kind === "pending" ? "nimbus-sheen" : ""}`}
      >
        {phase.kind === "done" && src && (
          // eslint-disable-next-line @next/next/no-img-element -- private, session-gated, streamed image
          <img
            src={src}
            alt={alt}
            onLoad={() => setLoaded(true)}
            onError={() =>
              setPhase({
                kind: "error",
                message: "The image could not be loaded. It may have been cleared from the PC.",
                action: "retry",
              })
            }
            className={
              loaded
                ? "nimbus-fade-in block h-auto w-full"
                : "absolute inset-0 h-full w-full object-contain opacity-0"
            }
          />
        )}
      </div>

      {pending ? (
        <figcaption role="status" aria-live="polite" className="flex flex-col gap-0.5 px-1 text-[13px]">
          <span className="aro-shimmer font-medium">
            {phase.kind === "pending" && phase.queued ? "Waiting for the GPU" : kind === "create" ? "Creating your image" : "Editing your image"}
          </span>
          <span className="text-xs text-nimbus-text-muted">
            {clock(elapsed)} elapsed. Usually one to two minutes.
          </span>
        </figcaption>
      ) : (
        <figcaption className="flex flex-wrap items-center gap-2 px-1">
          <a href={src} download={kind === "create" ? "aro-image.png" : "aro-edit.png"} className={buttonClass}>
            <Download aria-hidden className="h-3.5 w-3.5" />
            Download
          </a>
          <a href={src} target="_blank" rel="noreferrer" className={buttonClass}>
            Open full size
          </a>
        </figcaption>
      )}
    </figure>
  );
}
