"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState, type FormEvent } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ModelSwitcher } from "./ModelSwitcher";
import { RepoConnect } from "./RepoConnect";
import { McpConnectors } from "./McpConnectors";
import { SkillPrompt } from "./SkillPrompt";
import { MessageText } from "./CodeBlock";
import { MessageActions } from "./MessageActions";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { Mascot } from "./Mascot";
import { extractPushableFiles } from "@/lib/codeBlocks";
import type { McpConnector } from "@/lib/mcp";
import type { GithubRepoLink } from "@/lib/types";

gsap.registerPlugin(useGSAP);

const SUGGESTIONS = [
  "What can you help me with?",
  "What time is it right now?",
  "Calculate 128 * 47 for me",
];

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n\n");
}

export function ChatPanel({
  conversationId,
  initialMessages,
  model,
  onModelChange,
  onMessagesUpdate,
  githubRepo,
  onRepoChange,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  model: string;
  onModelChange: (model: string) => void;
  onMessagesUpdate: (messages: UIMessage[]) => void;
  githubRepo?: GithubRepoLink;
  onRepoChange: (repo: GithubRepoLink | undefined) => void;
}) {
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const [enabledConnectors, setEnabledConnectors] = useState<McpConnector[]>([]);
  const connectorsRef = useRef(enabledConnectors);
  useEffect(() => {
    connectorsRef.current = enabledConnectors;
  }, [enabledConnectors]);

  const repoRef = useRef(githubRepo);
  useEffect(() => {
    repoRef.current = githubRepo;
  }, [githubRepo]);

  const [pushStatus, setPushStatus] = useState<
    { state: "pushed" | "error"; label: string } | undefined
  >();

  // Reads modelRef/connectorsRef at request time (not render time), so the
  // transport always sends the latest state without needing to be recreated.
  /* eslint-disable react-hooks/refs */
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          model: modelRef.current,
          mcpConnectors: connectorsRef.current
            .filter((c) => c.enabled)
            .map((c) => ({ url: c.url, authHeader: c.authHeader })),
          githubRepo: repoRef.current,
        }),
      })
  );
  /* eslint-enable react-hooks/refs */

  async function pushMessageCode(message: UIMessage) {
    const repo = repoRef.current;
    if (!repo) return;
    const texts = message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text);
    const files = extractPushableFiles(texts);
    if (files.length === 0) return;

    try {
      const res = await fetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: repo.owner,
          repo: repo.name,
          branch: repo.branch,
          files,
          message: `ARO: update ${files.length} file${files.length === 1 ? "" : "s"}`,
        }),
      });
      if (!res.ok) throw new Error();
      setPushStatus({
        state: "pushed",
        label: `Pushed ${files.length} file${files.length === 1 ? "" : "s"} to ${repo.owner}/${repo.name}`,
      });
      // Keep project memory current with what was just pushed. Best-effort:
      // a failed ingest shouldn't surface as a push failure to the user.
      fetch("/api/memory/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: `${repo.owner}/${repo.name}`, files }),
      }).catch(() => {});
    } catch {
      setPushStatus({ state: "error", label: "Push failed" });
    }
  }

  const { messages, sendMessage, status, error, regenerate } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    onFinish: ({ message }) => {
      pushMessageCode(message);
    },
  });

  const [input, setInput] = useState("");
  const [mcpOpen, setMcpOpen] = useState(false);
  const [repoPromptOpen, setRepoPromptOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendIconRef = useRef<HTMLSpanElement>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const isStreaming = status === "streaming" || status === "submitted";
  const lastMessage = messages[messages.length - 1];
  const isThinking =
    isStreaming &&
    (!lastMessage ||
      lastMessage.role !== "assistant" ||
      !lastMessage.parts.some((p) => p.type === "text" && p.text.trim()));

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText =
    lastUserMessage?.parts.find((p) => p.type === "text" && "text" in p) as
      | { text: string }
      | undefined;

  useEffect(() => {
    // Skip mid-stream: `messages` updates on every token, and for signed-in
    // users each update now triggers a real network write, not just a
    // localStorage write. Persist once a turn settles instead of on every
    // chunk — still "every message exchange", just not every token of one.
    if (isStreaming) return;
    onMessagesUpdate(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isStreaming]);

  // Guards against a double-send: `status` only updates once React
  // re-renders after sendMessage's first tick, leaving a brief window where
  // a fast double-click/double-Enter can fire the request twice. This ref
  // closes that window synchronously; the effect below releases it on the
  // very next status change of any kind (streaming, finished, OR errored —
  // must not wait specifically for "streaming", since a fast-failing
  // request can go straight to an error status and never pass through it,
  // which would otherwise latch the guard closed forever).
  const sendingRef = useRef(false);
  useEffect(() => {
    sendingRef.current = false;
  }, [status]);

  function trySend(text: string) {
    if (!text.trim() || isStreaming || sendingRef.current) return;
    sendingRef.current = true;
    sendMessage({ text });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    trySend(input);
    setInput("");
  }

  function handleSuggestion(text: string) {
    trySend(text);
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
          { opacity: 0, y: 14, scale: 0.98, filter: "blur(4px)" },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            filter: "blur(0px)",
            duration: 0.55,
            ease: "power3.out",
          }
        );
      });
    },
    { dependencies: [messages], scope: containerRef }
  );

  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isThinking]);

  function handleSendPointerEnter() {
    if (!sendIconRef.current) return;
    gsap.to(sendIconRef.current, {
      x: 1.5,
      y: -1.5,
      scale: 1.08,
      duration: 0.3,
      ease: "power2.out",
    });
  }

  function handleSendPointerLeave() {
    if (!sendIconRef.current) return;
    gsap.to(sendIconRef.current, { x: 0, y: 0, scale: 1, duration: 0.35, ease: "power2.out" });
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col items-center overflow-hidden px-4 pb-4 pt-20 sm:px-6 sm:pb-8 sm:pt-12 md:pt-8"
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
                  className="rounded-[var(--nimbus-radius-pill)] border border-nimbus-border bg-nimbus-surface px-4 py-2 text-sm text-nimbus-text-muted shadow-[var(--nimbus-shadow)] transition-[transform,color,border-color] duration-300 ease-[var(--nimbus-ease)] hover:-translate-y-0.5 hover:border-nimbus-accent/40 hover:text-nimbus-text active:translate-y-0 active:scale-[0.98]"
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
                    ? "group self-end max-w-[80%]"
                    : "group self-start max-w-[80%]"
                }
              >
                <div
                  className={
                    message.role === "user"
                      ? "rounded-[var(--nimbus-radius-card)] rounded-br-lg bg-nimbus-accent px-4 py-3 text-sm leading-relaxed text-white shadow-[var(--nimbus-shadow)]"
                      : "rounded-[var(--nimbus-radius-card)] rounded-bl-lg border border-nimbus-border bg-nimbus-surface px-4 py-3 text-sm leading-relaxed text-nimbus-text shadow-[var(--nimbus-inset-highlight),var(--nimbus-shadow)]"
                  }
                >
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return <MessageText key={i} text={part.text} />;
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
                {message.role === "assistant" && (
                  <MessageActions
                    text={textOf(message)}
                    showRegenerate={message.id === lastAssistantId && !isStreaming}
                    onRegenerate={() => regenerate()}
                  />
                )}
              </div>
            ))}

            {isThinking && <ThinkingIndicator />}

            <div ref={bottomRef} />
          </div>
        )}

        {lastUserText && !isStreaming && (
          <SkillPrompt
            latestUserText={lastUserText.text}
            githubRepo={githubRepo}
            hasEnabledMcp={enabledConnectors.some((c) => c.enabled)}
            onConnectRepo={() => setRepoPromptOpen(true)}
            onOpenMcp={() => setMcpOpen(true)}
          />
        )}

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-nimbus-border bg-nimbus-surface px-4 py-3 text-sm text-nimbus-text shadow-[var(--nimbus-shadow)]"
          >
            Something went wrong. Try again.
          </div>
        )}

        <div className="nimbus-shell shadow-[var(--nimbus-shadow)]">
          <form
            onSubmit={handleSubmit}
            className="nimbus-shell-inner nimbus-glass flex flex-col gap-2 border border-nimbus-border bg-nimbus-surface/90 p-2 sm:flex-row sm:items-center"
          >
            <div className="flex items-center gap-2 overflow-x-auto sm:overflow-visible">
              <ModelSwitcher value={model} onChange={onModelChange} />
              <RepoConnect
                value={githubRepo}
                onChange={onRepoChange}
                pushStatus={pushStatus}
                forceOpen={repoPromptOpen}
                onForceOpenHandled={() => setRepoPromptOpen(false)}
              />
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setMcpOpen((v) => !v)}
                  className="flex items-center gap-1 rounded-[var(--nimbus-radius-pill)] border border-nimbus-border bg-nimbus-surface px-3 py-2 text-xs font-medium text-nimbus-text-muted shadow-[var(--nimbus-shadow)] transition-[transform,border-color] duration-300 ease-[var(--nimbus-ease)] hover:border-nimbus-accent/40 active:scale-[0.96]"
                >
                  MCP
                  {enabledConnectors.filter((c) => c.enabled).length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-nimbus-free" />
                  )}
                </button>
                <McpConnectors
                  open={mcpOpen}
                  onOpenChange={setMcpOpen}
                  onConnectorsChange={setEnabledConnectors}
                />
              </div>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <input
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-nimbus-text placeholder:text-nimbus-text-muted focus:outline-none disabled:opacity-50"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask something…"
                disabled={isStreaming}
              />
              <button
                type="submit"
                disabled={isStreaming || !input.trim()}
                onPointerEnter={handleSendPointerEnter}
                onPointerLeave={handleSendPointerLeave}
                aria-label="Send message"
                className="group/send flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-nimbus-accent text-white shadow-[var(--nimbus-glow)] transition-[opacity,box-shadow,transform] duration-300 ease-[var(--nimbus-ease)] hover:opacity-90 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                <span ref={sendIconRef} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M7 11.5V2.5M7 2.5 3 6.5M7 2.5l4 4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
