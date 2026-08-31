"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

type Status = "idle" | "loading" | "error";

export default function Home() {
  const [text, setText] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasRevealedOutput = useRef(false);

  useGSAP(
    () => {
      gsap.fromTo(
        buttonRef.current,
        { scale: 0.96 },
        { scale: 1, duration: 0.25, ease: "power2.out" }
      );
    },
    { dependencies: [status], scope: containerRef }
  );

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Enter some text to summarize.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError("");
    setSummary("");
    hasRevealedOutput.current = false;

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong. Try again.");
        setStatus("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          setSummary((prev) => prev + chunk);
          if (!hasRevealedOutput.current) {
            hasRevealedOutput.current = true;
            gsap.fromTo(
              outputRef.current,
              { opacity: 0, y: 6 },
              { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }
            );
          }
        }
      }

      setStatus("idle");
    } catch {
      setError("Network error — check your connection and try again.");
      setStatus("error");
    }
  }

  const isLoading = status === "loading";
  const statusLabel =
    status === "loading" ? "RUNNING" : status === "error" ? "ERROR" : "READY";
  const statusColor =
    status === "loading"
      ? "bg-foreground"
      : status === "error"
        ? "bg-accent"
        : "bg-ready";

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col items-center px-4 py-12 sm:py-20"
    >
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <header className="flex items-center justify-between border-b border-border pb-4">
          <h1 className="text-sm font-semibold uppercase tracking-[0.2em]">
            SUMMARIZE
          </h1>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-muted">
            <span className={`h-2 w-2 ${statusColor}`} aria-hidden="true" />
            <span>{statusLabel}</span>
          </div>
        </header>

        <section className="flex flex-col gap-3">
          <label
            htmlFor="source-text"
            className="text-xs uppercase tracking-[0.15em] text-muted"
          >
            [ INPUT ]
          </label>
          <textarea
            id="source-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isLoading}
            placeholder="Paste text to summarize…"
            className="min-h-[220px] resize-y border border-border bg-black/40 p-4 text-sm leading-relaxed text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none disabled:opacity-50"
          />
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-muted">
            <span>{text.length} CHARS</span>
          </div>

          <button
            ref={buttonRef}
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
            className="self-start border border-border-strong px-6 py-3 text-xs uppercase tracking-[0.2em] transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? "SUMMARIZING…" : "RUN SUMMARY >>>"}
          </button>
        </section>

        {status === "error" && error && (
          <div
            role="alert"
            className="border border-accent bg-accent-dim px-4 py-3 text-xs text-accent"
          >
            [ ERROR ] {error}
          </div>
        )}

        {(summary || isLoading) && (
          <section ref={outputRef} className="border border-border p-4">
            <div className="mb-3 text-xs uppercase tracking-[0.15em] text-muted">
              [ OUTPUT ]
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {summary}
              {isLoading && <span aria-hidden="true">▍</span>}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
