"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState, type FormEvent } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ModelSwitcher } from "./ModelSwitcher";
import { Mascot } from "./Mascot";

gsap.registerPlugin(useGSAP);

const SUGGESTIONS = [
  "What can you help me with?",
  "What time is it right now?",
  "Calculate 128 * 47 for me",
];

export function ChatPanel({
  conversationId,
  initialMessages,
  model,
  onModelChange,
  onMessagesUpdate,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  model: string;
  onModelChange: (model: string) => void;
  onMessagesUpdate: (messages: UIMessage[]) => void;
}) {
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  // Reads modelRef at request time (not render time), so the transport
  // always sends the latest selected model without needing to be recreated.
  /* eslint-disable react-hooks/refs */
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ model: modelRef.current }),
      })
  );
  /* eslint-enable react-hooks/refs */

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
  });

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

  useEffect(() => {
    onMessagesUpdate(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  }

  function handleSuggestion(text: string) {
    sendMessage({ text });
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
          { opacity: 0, y: 10, scale: 0.985 },
          { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out" }
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
      className="flex flex-1 flex-col items-center overflow-hidden px-4 py-8 sm:py-12"
    >
      <div className="flex w-full max-w-2xl flex-1 flex-col gap-6 overflow-hidden">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <Mascot className="h-24 w-24" />
            <h1 className="text-2xl font-medium leading-snug text-nimbus-text sm:text-3xl">
              What can I <span className="font-semibold">help</span> you{" "}
              <span className="font-semibold">figure out</span> today?
            </h1>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSuggestion(s)}
                  className="rounded-[var(--nimbus-radius-pill)] border border-nimbus-border bg-nimbus-surface px-4 py-2 text-sm text-nimbus-text-muted shadow-[var(--nimbus-shadow)] transition-colors hover:border-nimbus-accent/40 hover:text-nimbus-text"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                data-message={message.id}
                className={
                  message.role === "user"
                    ? "self-end max-w-[80%] rounded-[var(--nimbus-radius-card)] rounded-br-lg bg-nimbus-accent px-4 py-3 text-sm leading-relaxed text-white shadow-[var(--nimbus-shadow)]"
                    : "self-start max-w-[80%] rounded-[var(--nimbus-radius-card)] rounded-bl-lg border border-nimbus-border bg-nimbus-surface px-4 py-3 text-sm leading-relaxed text-nimbus-text shadow-[var(--nimbus-shadow)]"
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
                        className="mt-2 flex items-center gap-1.5 text-xs text-nimbus-text-muted"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-nimbus-accent" />
                        used tool: {part.type.replace("tool-", "")}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            ))}

            {isThinking && (
              <div className="flex items-center gap-1.5 self-start rounded-[var(--nimbus-radius-card)] rounded-bl-lg border border-nimbus-border bg-nimbus-surface px-4 py-3 shadow-[var(--nimbus-shadow)]">
                <span className="nimbus-dot h-1.5 w-1.5 rounded-full bg-nimbus-text-muted [animation-delay:0ms]" />
                <span className="nimbus-dot h-1.5 w-1.5 rounded-full bg-nimbus-text-muted [animation-delay:150ms]" />
                <span className="nimbus-dot h-1.5 w-1.5 rounded-full bg-nimbus-text-muted [animation-delay:300ms]" />
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-nimbus-border bg-nimbus-surface px-4 py-3 text-sm text-nimbus-text shadow-[var(--nimbus-shadow)]"
          >
            Something went wrong. Try again.
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 rounded-[var(--nimbus-radius-card)] border border-nimbus-border bg-nimbus-surface p-2 shadow-[var(--nimbus-shadow)]"
        >
          <ModelSwitcher value={model} onChange={onModelChange} />
          <input
            className="flex-1 bg-transparent px-2 py-2 text-sm text-nimbus-text placeholder:text-nimbus-text-muted focus:outline-none disabled:opacity-50"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something…"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="flex items-center justify-center rounded-[var(--nimbus-radius-pill)] bg-nimbus-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
