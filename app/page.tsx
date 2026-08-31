"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export default function Home() {
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const isStreaming = status === "streaming" || status === "submitted";
  const lastMessage = messages[messages.length - 1];
  const isThinking =
    isStreaming &&
    (!lastMessage ||
      lastMessage.role !== "assistant" ||
      !lastMessage.parts.some((p) => p.type === "text" && p.text.trim()));

  const statusLabel = isStreaming ? "RUNNING" : "READY";
  const statusColor = isStreaming ? "bg-foreground" : "bg-ready";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  }

  useGSAP(
    () => {
      const nodes = scrollRef.current?.querySelectorAll("[data-message]");
      nodes?.forEach((node) => {
        const id = node.getAttribute("data-message");
        if (!id || seenIds.current.has(id)) return;
        seenIds.current.add(id);
        gsap.fromTo(
          node,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" }
        );
      });
    },
    { dependencies: [messages], scope: containerRef }
  );

  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isThinking]);

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col items-center px-4 py-12 sm:py-20"
    >
      <div className="flex w-full max-w-2xl flex-1 flex-col gap-8">
        <header className="flex items-center justify-between border-b border-border pb-4">
          <h1 className="text-sm font-semibold uppercase tracking-[0.2em]">
            AGENT
          </h1>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-muted">
            <span className={`h-2 w-2 ${statusColor}`} aria-hidden="true" />
            <span>{statusLabel}</span>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-4 overflow-y-auto"
        >
          {messages.length === 0 && (
            <p className="text-xs uppercase tracking-[0.15em] text-muted">
              [ NO MESSAGES ] — ask something to begin.
            </p>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              data-message={message.id}
              className={
                message.role === "user"
                  ? "self-end max-w-[80%] border border-border-strong bg-foreground px-4 py-3 text-sm leading-relaxed text-background"
                  : "self-start max-w-[80%] border border-border bg-black/40 px-4 py-3 text-sm leading-relaxed"
              }
            >
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <span key={i} className="whitespace-pre-wrap">
                      {part.text}
                    </span>
                  );
                }
                if (part.type.startsWith("tool-")) {
                  return (
                    <div
                      key={i}
                      className="mt-2 text-[10px] uppercase tracking-[0.15em] text-muted"
                    >
                      [ TOOL: {part.type.replace("tool-", "")} ]
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ))}

          {isThinking && (
            <div className="self-start flex items-center gap-1 border border-border bg-black/40 px-4 py-3">
              <span className="h-1 w-1 animate-pulse bg-muted [animation-delay:0ms]" />
              <span className="h-1 w-1 animate-pulse bg-muted [animation-delay:150ms]" />
              <span className="h-1 w-1 animate-pulse bg-muted [animation-delay:300ms]" />
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {error && (
          <div
            role="alert"
            className="border border-accent bg-accent-dim px-4 py-3 text-xs text-accent"
          >
            [ ERROR ] Something went wrong. Try again.
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border pt-4">
          <input
            className="flex-1 border border-border bg-black/40 px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none disabled:opacity-50"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something…"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="border border-border-strong px-6 py-3 text-xs uppercase tracking-[0.2em] transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            SEND
          </button>
        </form>
      </div>
    </div>
  );
}
