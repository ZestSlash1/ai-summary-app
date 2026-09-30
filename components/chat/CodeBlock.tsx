"use client";

import { useMemo, useRef, useState } from "react";
import { highlight } from "sugar-high";
import { lang as normalizeLang } from "sugar-high/lang";
import { Check, ChevronDown, Copy, FileCode2 } from "lucide-react";
import { gsap, reducedMotion } from "@/lib/motion";

type LanguageName = NonNullable<Parameters<typeof highlight>[1]>["lang"];

// Long blocks start folded so a big file doesn't push the conversation off screen.
const FOLD_AFTER_LINES = 26;
// 26 lines at 12.5px * 1.65 line height, plus the 12px vertical padding on each side.
const FOLDED_HEIGHT = 560;

/** A fenced code block: file or language label, copy, syntax colors, and folding. */
export function CodeBlock({
  language,
  path,
  code,
}: {
  language: string;
  path?: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const lineCount = useMemo(() => code.split("\n").length, [code]);
  const foldable = lineCount > FOLD_AFTER_LINES;

  const html = useMemo(() => {
    const canonical = (normalizeLang(language) ?? "plaintext") as LanguageName;
    try {
      return highlight(code, { lang: canonical });
    } catch {
      return highlight(code, { lang: "plaintext" as LanguageName });
    }
  }, [code, language]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked (insecure context or permissions): nothing useful to show.
    }
  }

  function toggleFold() {
    const body = bodyRef.current;
    if (!body) return;
    const next = !expanded;
    const from = body.offsetHeight;
    setExpanded(next);
    // Measure the target height after React applies the new max-height, then tween to it.
    requestAnimationFrame(() => {
      const to = body.scrollHeight;
      const target = next ? to : FOLDED_HEIGHT;
      gsap.fromTo(
        body,
        { height: from },
        {
          height: target,
          duration: reducedMotion() ? 0 : 0.5,
          ease: "aro",
          onComplete: () => gsap.set(body, { clearProps: "height" }),
        }
      );
    });
  }

  const label = path ?? (language && language !== "text" ? language : "code");

  return (
    <div className="group/code my-3 overflow-hidden rounded-[12px] border border-nimbus-border bg-nimbus-surface">
      <div className="flex items-center gap-2 border-b border-nimbus-border py-1.5 pl-3.5 pr-1.5">
        {path && <FileCode2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-nimbus-text-muted" />}
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-nimbus-text-muted">{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-nimbus-text-muted transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text"
        >
          {copied ? (
            <Check aria-hidden className="h-3.5 w-3.5 text-nimbus-free" />
          ) : (
            <Copy aria-hidden className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div
        ref={bodyRef}
        className={`relative overflow-hidden ${foldable && !expanded ? "max-h-[560px]" : ""}`}
      >
        <pre className="aro-code aro-no-scrollbar overflow-x-auto py-3">
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
        {foldable && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-nimbus-surface to-transparent" />
        )}
      </div>
      {foldable && (
        <button
          type="button"
          onClick={toggleFold}
          aria-expanded={expanded}
          className="flex w-full items-center justify-center gap-1.5 border-t border-nimbus-border py-2 text-[12px] text-nimbus-text-muted transition-colors hover:bg-nimbus-surface-2 hover:text-nimbus-text"
        >
          <ChevronDown
            aria-hidden
            className={`h-3.5 w-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          />
          {expanded ? "Show less" : `Show all ${lineCount} lines`}
        </button>
      )}
    </div>
  );
}
