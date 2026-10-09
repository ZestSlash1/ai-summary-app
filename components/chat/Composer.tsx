"use client";

import { forwardRef, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { ArrowUp, Loader2, Paperclip, Square, WandSparkles, X } from "lucide-react";
import { gsap, useGSAP, iconWiggle, reducedMotion } from "@/lib/motion";
import { ACCEPTED_IMAGE_TYPES, type PreparedImage } from "@/lib/imageResize";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { CHIP } from "../ui/classes";
import { LiquidRefraction } from "../LiquidRefraction";
import { SlashCommandMenu, matchSlashCommands, type SlashCommand } from "./SlashCommandMenu";

const MAX_TEXTAREA_PX = 220;

/**
 * The prompt box: a growing textarea on top, controls along the bottom, and Send that
 * turns into Stop while a reply streams. Presentational; ChatPanel owns the state.
 */
export const Composer = forwardRef<
  HTMLDivElement,
  {
    value: string;
    onValueChange: (value: string) => void;
    onSubmit: () => void;
    onStop: () => void;
    streaming: boolean;
    canSend: boolean;
    placeholder: string;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
    fileInputRef: RefObject<HTMLInputElement | null>;
    controls: ReactNode;
    attachment: PreparedImage | null;
    preparing: boolean;
    canAttach: boolean;
    onAttachFile: (file: File | undefined) => void;
    onRemoveAttachment: () => void;
    dragging: boolean;
    contextUsage?: { tokens: number; limit: number; percent: number; level: "normal" | "warning" | "danger" } | null;
    onSlashCommand?: (command: SlashCommand["id"]) => void;
    /** Starts a "create an image" prompt. Offered only where the image generator is reachable. */
    onCreateImage?: () => void;
  }
>(function Composer(
  {
    value,
    onValueChange,
    onSubmit,
    onStop,
    streaming,
    canSend,
    placeholder,
    textareaRef,
    fileInputRef,
    controls,
    attachment,
    preparing,
    canAttach,
    onAttachFile,
    onRemoveAttachment,
    dragging,
    contextUsage,
    onSlashCommand,
    onCreateImage,
  },
  ref
) {
  const sendLayerRef = useRef<HTMLSpanElement>(null);
  const stopLayerRef = useRef<HTMLSpanElement>(null);
  const arrowRef = useRef<SVGSVGElement>(null);
  const shownStreaming = useRef<boolean | null>(null);
  const wasReady = useRef(canSend);
  const controlsRef = useRef<HTMLDivElement>(null);
  const glassRef = useRef<HTMLDivElement | null>(null);
  // On touch keyboards Enter is the only way to start a new line, so there it does not send.
  const touch = useMediaQuery("(pointer: coarse)");

  // Grow with the text up to a cap, then scroll inside.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [value, textareaRef]);

  // Send and Stop are one button. When a reply starts, the arrow takes off and Stop rises
  // into its place; when the reply ends, Send drops back in. The colors cross-fade in CSS.
  useGSAP(
    () => {
      const send = sendLayerRef.current;
      const stop = stopLayerRef.current;
      const arrow = arrowRef.current;
      if (!send || !stop || !arrow) return;
      const previous = shownStreaming.current;
      shownStreaming.current = streaming;
      const [shown, hidden] = streaming ? [stop, send] : [send, stop];
      gsap.killTweensOf([send, stop, arrow]);
      if (previous === null || previous === streaming || reducedMotion()) {
        gsap.set(shown, { autoAlpha: 1, yPercent: 0 });
        gsap.set(hidden, { autoAlpha: 0 });
        gsap.set(arrow, { y: 0, autoAlpha: 1 });
        return;
      }
      if (streaming) {
        gsap
          .timeline()
          .to(arrow, { y: -16, autoAlpha: 0, duration: 0.22, ease: "aro-in" })
          .to(send, { yPercent: -80, autoAlpha: 0, duration: 0.2, ease: "aro-in" }, 0.05)
          .fromTo(stop, { yPercent: 80, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.42, ease: "aro" }, 0.12)
          .set(arrow, { y: 0, autoAlpha: 1 });
      } else {
        gsap
          .timeline()
          .to(stop, { yPercent: 80, autoAlpha: 0, duration: 0.18, ease: "aro-in" })
          .fromTo(send, { yPercent: -80, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.42, ease: "aro" }, 0.08);
      }
    },
    { dependencies: [streaming] }
  );

  // Send wakes up the moment there is something to send: a small swell and the arrow lifts.
  useGSAP(
    () => {
      const ready = canSend && !streaming;
      const woke = ready && !wasReady.current;
      wasReady.current = ready;
      if (!woke || reducedMotion() || !sendLayerRef.current || !arrowRef.current) return;
      gsap.fromTo(sendLayerRef.current, { scale: 0.9 }, { scale: 1, duration: 0.45, ease: "aro" });
      gsap.fromTo(arrowRef.current, { y: 5 }, { y: 0, duration: 0.5, ease: "aro" });
    },
    { dependencies: [canSend, streaming] }
  );

  // The controls row scrolls only when its chips still do not fit after folding their labels,
  // and then fades the edge that hides more of them.
  useLayoutEffect(() => {
    const row = controlsRef.current;
    if (!row) return;
    const update = () => {
      const overflow = row.scrollWidth - row.clientWidth > 1;
      const atStart = row.scrollLeft <= 1;
      const atEnd = row.scrollLeft >= row.scrollWidth - row.clientWidth - 1;
      row.dataset.fade = !overflow ? "none" : atStart ? "end" : atEnd ? "start" : "both";
    };
    const resize = new ResizeObserver(update);
    const watch = () => {
      resize.disconnect();
      resize.observe(row);
      for (const child of Array.from(row.children)) resize.observe(child);
      update();
    };
    // Chips come and go (Workspace in coding chats, the attach button with image models).
    const mutations = new MutationObserver(watch);
    mutations.observe(row, { childList: true });
    watch();
    row.addEventListener("scroll", update, { passive: true });
    return () => {
      resize.disconnect();
      mutations.disconnect();
      row.removeEventListener("scroll", update);
    };
  }, []);

  const showSlashMenu = value.startsWith("/") && !value.slice(1).includes(" ");
  // While the menu lists commands, Enter is its to pick one: the menu listens on window,
  // after this textarea, so sending here would post "/model" and unmount the menu first.
  const slashMenuHasCommands = showSlashMenu && matchSlashCommands(value).length > 0;

  const handleSlashSelect = (cmd: SlashCommand["id"]) => {
    onValueChange("");
    onSlashCommand?.(cmd);
  };

  return (
    <div
      ref={(node) => {
        glassRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      data-dragging={dragging || undefined}
      data-streaming={streaming || undefined}
      className="aro-glass group/composer relative rounded-[18px] border transition-[border-color,box-shadow] duration-500 ease-[var(--nimbus-ease)] focus-within:border-nimbus-accent/45 focus-within:shadow-[var(--glass-rim),0_0_0_4px_var(--nimbus-accent-soft),0_18px_50px_-16px_rgba(19,95,235,0.5)] data-[dragging]:border-nimbus-accent data-[dragging]:shadow-[var(--glass-rim),0_0_0_4px_var(--nimbus-accent-soft)]"
    >
      {/* The composer is glass over the conversation: it bends what passes behind its rim. */}
      <LiquidRefraction target={glassRef} />
      {/* While ARO replies, two lights run the rim: the composer is working, not waiting. */}
      <span aria-hidden data-on={streaming || undefined} className="aro-beam" style={{ ["--beam-radius" as string]: "18px" }}>
        <span />
        <span />
      </span>
      {showSlashMenu && (
        <SlashCommandMenu
          query={value}
          onSelect={handleSlashSelect}
          onClose={() => onValueChange("")}
        />
      )}
      {contextUsage && contextUsage.percent > 5 && (
        <div
          role="progressbar"
          aria-valuenow={Math.round(contextUsage.percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Context used: ${Math.round(contextUsage.percent)}% (${contextUsage.tokens} of ${contextUsage.limit} tokens)`}
          title={`Context: ${Math.round(contextUsage.percent)}% (${contextUsage.tokens.toLocaleString()} / ${contextUsage.limit.toLocaleString()} tokens)`}
          className="relative h-[2px] w-full overflow-hidden rounded-t-[16px] bg-nimbus-border/30"
        >
          <div
            style={{ width: `${contextUsage.percent}%` }}
            className={`h-full transition-all duration-300 ${
              contextUsage.level === "danger"
                ? "bg-rose-500"
                : contextUsage.level === "warning"
                  ? "bg-amber-500"
                  : "bg-nimbus-accent/60"
            }`}
          />
        </div>
      )}
      {(attachment || preparing) && (
        <div className="flex items-center gap-3 px-3 pt-3">
          {preparing ? (
            <div role="status" className="flex h-14 items-center gap-2 text-[13px] text-nimbus-text-muted">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              Preparing the image
            </div>
          ) : (
            attachment && (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the picked file */}
                <img
                  src={attachment.dataUrl}
                  alt={`Attached: ${attachment.name}`}
                  className="h-14 w-14 rounded-lg border border-nimbus-border object-cover"
                />
                <button
                  type="button"
                  onClick={onRemoveAttachment}
                  aria-label="Remove the attached image"
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-nimbus-border-strong bg-nimbus-surface-2 text-nimbus-text-muted shadow-[var(--nimbus-shadow)] transition-[color,transform] hover:text-nimbus-text active:scale-90"
                >
                  <X aria-hidden className="h-3 w-3" />
                </button>
              </div>
            )
          )}
        </div>
      )}

      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
            if (slashMenuHasCommands) return;
            e.preventDefault();
            if (canSend) onSubmit();
          }
        }}
        onPaste={(e) => {
          if (!canAttach) return;
          const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
          if (file) {
            e.preventDefault();
            onAttachFile(file);
          }
        }}
        placeholder={placeholder}
        aria-label="Message ARO"
        enterKeyHint={touch ? "enter" : "send"}
        className="aro-bare-focus block max-h-[220px] min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[16px] leading-6 sm:text-[14.5px] text-nimbus-text placeholder:text-nimbus-text-faint focus:outline-none"
      />

      <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-1">
        <div
          ref={controlsRef}
          data-fade="none"
          className="aro-no-scrollbar @container/controls -mx-1 -my-2 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 py-2 data-[fade=both]:[mask-image:linear-gradient(90deg,transparent,#000_28px,#000_calc(100%_-_28px),transparent)] data-[fade=end]:[mask-image:linear-gradient(90deg,#000_calc(100%_-_28px),transparent)] data-[fade=start]:[mask-image:linear-gradient(90deg,transparent,#000_28px)]"
        >
          {canAttach && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(",")}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  onAttachFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onPointerEnter={iconWiggle}
                disabled={streaming || preparing}
                aria-label="Attach an image to edit"
                title="Attach an image to edit"
                className={`${CHIP} w-8 justify-center px-0 disabled:pointer-events-none disabled:opacity-40`}
              >
                <Paperclip aria-hidden className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {onCreateImage && (
            <button
              type="button"
              onClick={onCreateImage}
              onPointerEnter={iconWiggle}
              disabled={streaming}
              aria-label="Create an image from a description"
              title="Create an image from a description"
              className={`${CHIP} disabled:pointer-events-none disabled:opacity-40 max-sm:w-8 max-sm:justify-center max-sm:px-0`}
            >
              <WandSparkles aria-hidden className="h-3.5 w-3.5" />
              <span className="max-sm:sr-only">Create image</span>
            </button>
          )}
          {controls}
        </div>

        {/* One button that is Send, or Stop while a reply streams. Both faces sit in the same grid
            cell, so it keeps its size, and the swap animates in the effect above. */}
        <button
          type="button"
          onClick={streaming ? onStop : onSubmit}
          disabled={!streaming && !canSend}
          aria-label={streaming ? "Stop the reply" : "Send message"}
          data-streaming={streaming || undefined}
          className="aro-gel group/send grid h-8 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-transparent bg-nimbus-accent px-3 text-[13px] font-medium text-white transition-[background-color,border-color,color,box-shadow,scale,filter] duration-300 ease-[var(--nimbus-ease)] motion-safe:active:scale-[0.94] motion-safe:active:duration-100 disabled:bg-nimbus-surface-3 disabled:text-nimbus-text-faint data-[streaming]:border-nimbus-border-strong data-[streaming]:bg-nimbus-surface-2 data-[streaming]:bg-none data-[streaming]:text-nimbus-text data-[streaming]:shadow-none data-[streaming]:hover:bg-nimbus-surface-3"
        >
          <span
            ref={sendLayerRef}
            aria-hidden={streaming}
            className={`col-start-1 row-start-1 flex items-center gap-1.5 ${streaming ? "invisible opacity-0" : ""}`}
          >
            <span className="max-sm:sr-only">Send</span>
            <span className="flex transition-[translate] duration-300 ease-[var(--nimbus-ease)] motion-safe:group-enabled/send:group-hover/send:-translate-y-0.5">
              <ArrowUp ref={arrowRef} aria-hidden className="h-3.5 w-3.5" />
            </span>
          </span>
          <span
            ref={stopLayerRef}
            aria-hidden={!streaming}
            className={`col-start-1 row-start-1 flex items-center gap-1.5 ${streaming ? "" : "invisible opacity-0"}`}
          >
            <Square aria-hidden className="h-3 w-3 fill-current" />
            <span className="max-sm:sr-only">Stop</span>
          </span>
        </button>
      </div>
    </div>
  );
});
