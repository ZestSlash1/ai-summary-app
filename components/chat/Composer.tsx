"use client";

import { forwardRef, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { ArrowUp, Loader2, Paperclip, Square, X } from "lucide-react";
import { gsap, useGSAP, reducedMotion } from "@/lib/motion";
import { ACCEPTED_IMAGE_TYPES, type PreparedImage } from "@/lib/imageResize";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { SlashCommandMenu, type SlashCommand } from "./SlashCommandMenu";

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
  },
  ref
) {
  const sendLabelRef = useRef<HTMLSpanElement>(null);
  // On touch keyboards Enter is the only way to start a new line, so there it does not send.
  const touch = useMediaQuery("(pointer: coarse)");
  const firstRender = useRef(true);

  // Grow with the text up to a cap, then scroll inside.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [value, textareaRef]);

  // Send and Stop trade places with a short vertical roll, so the switch is noticed.
  useGSAP(
    () => {
      if (firstRender.current) {
        requestAnimationFrame(() => (firstRender.current = false));
        return;
      }
      if (!sendLabelRef.current) return;
      gsap.fromTo(
        sendLabelRef.current,
        { yPercent: streaming ? 60 : -60, autoAlpha: 0 },
        { yPercent: 0, autoAlpha: 1, duration: reducedMotion() ? 0 : 0.35, ease: "aro" }
      );
    },
    { dependencies: [streaming] }
  );

  const showSlashMenu = value.startsWith("/") && !value.slice(1).includes(" ");

  const handleSlashSelect = (cmd: SlashCommand["id"]) => {
    onValueChange("");
    onSlashCommand?.(cmd);
  };

  return (
    <div
      ref={ref}
      data-dragging={dragging || undefined}
      className="group/composer relative rounded-[16px] border border-nimbus-border-strong bg-nimbus-surface shadow-[var(--nimbus-inset-highlight),var(--nimbus-shadow)] transition-[border-color,box-shadow] duration-300 focus-within:border-nimbus-accent/50 focus-within:shadow-[0_0_0_4px_var(--nimbus-accent-soft),var(--nimbus-shadow)] data-[dragging]:border-nimbus-accent data-[dragging]:shadow-[0_0_0_4px_var(--nimbus-accent-soft)]"
    >
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
        <div className="aro-no-scrollbar -my-2 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-2 max-sm:[mask-image:linear-gradient(90deg,#000_85%,transparent)] sm:overflow-visible">
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
                disabled={streaming || preparing}
                aria-label="Attach an image to edit"
                title="Attach an image to edit"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-nimbus-border text-nimbus-text-muted transition-[color,background-color,transform] duration-200 hover:bg-nimbus-surface-2 hover:text-nimbus-text active:scale-90 disabled:opacity-40"
              >
                <Paperclip aria-hidden className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {controls}
        </div>

        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop the reply"
            className="flex h-8 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg border border-nimbus-border-strong bg-nimbus-surface-2 px-3 text-[13px] font-medium text-nimbus-text transition-[background-color,transform] duration-200 hover:bg-nimbus-surface-3 active:scale-95"
          >
            <span ref={sendLabelRef} className="flex items-center gap-1.5">
              <Square aria-hidden className="h-3 w-3 fill-current" />
              <span className="max-sm:sr-only">Stop</span>
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSend}
            aria-label="Send message"
            className="flex h-8 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg bg-nimbus-accent px-3 text-[13px] font-medium text-white shadow-[var(--nimbus-glow)] transition-[background-color,transform,opacity,box-shadow] duration-200 hover:bg-nimbus-accent-hover active:scale-95 disabled:bg-nimbus-surface-3 disabled:text-nimbus-text-faint disabled:shadow-none"
          >
            <span ref={sendLabelRef} className="flex items-center gap-1.5">
              <span className="max-sm:sr-only">Send</span>
              <ArrowUp aria-hidden className="h-3.5 w-3.5" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
});
