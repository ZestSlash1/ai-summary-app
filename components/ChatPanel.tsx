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
import { HomeDashboard } from "./HomeDashboard";
import { extractPushableFiles } from "@/lib/codeBlocks";
import type { McpConnector } from "@/lib/mcp";
import type { Conversation, GithubRepoLink } from "@/lib/types";
import { loadModelSource } from "@/lib/storage";
import { ImagePlus, X } from "lucide-react";
import { ImageJobCard } from "./ImageJobCard";
import { useHomeGpu } from "@/lib/useHomeGpu";
import { ACCEPTED_IMAGE_TYPES, ImageError, prepareImage, type PreparedImage } from "@/lib/imageResize";

gsap.registerPlugin(useGSAP);

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n\n");
}

const IMAGE_EDIT_IDEAS = ["Remove the background", "Make it look like evening", "Turn it into a pencil sketch"];

/** A short, safe sentence for a failed chat request. Our own routes send readable errors. */
function chatErrorText(err: Error): string {
  let text = err.message || "";
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.error === "string") text = parsed.error;
  } catch {
    // Not JSON: use the message as is.
  }
  if (/sign in|not allowed|GPU|image edit/i.test(text)) return text;
  if (loadModelSource() === "bonsai") {
    return "Bonsai did not respond. Check that the home PC is on (Settings shows its state), then try again.";
  }
  return "Something went wrong. Try again.";
}

export function ChatPanel({
  conversationId,
  initialMessages,
  model,
  onModelChange,
  onMessagesUpdate,
  githubRepo,
  onRepoChange,
  conversations,
  userName,
  onSelectConversation,
  onNewChat,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  model: string;
  onModelChange: (model: string) => void;
  onMessagesUpdate: (messages: UIMessage[]) => void;
  githubRepo?: GithubRepoLink;
  onRepoChange: (repo: GithubRepoLink | undefined) => void;
  conversations: Conversation[];
  userName?: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
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
          modelSource: loadModelSource(),
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

  // Image editing: only shown to accounts allowed to use the home GPU.
  const { allowed: canEditImages } = useHomeGpu();
  const [attachment, setAttachment] = useState<PreparedImage | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  function trySend(text: string, image?: PreparedImage | null) {
    if (!text.trim() || isStreaming || sendingRef.current) return;
    sendingRef.current = true;
    if (image) {
      sendMessage({
        text,
        files: [{ type: "file", mediaType: image.mediaType, url: image.dataUrl, filename: image.name }],
      });
    } else {
      sendMessage({ text });
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || preparing) return;
    trySend(input, attachment);
    setInput("");
    setAttachment(null);
    setAttachError(null);
  }

  async function attachFile(file: File | undefined) {
    if (!file) return;
    setAttachError(null);
    setPreparing(true);
    try {
      setAttachment(await prepareImage(file));
    } catch (err) {
      setAttachError(err instanceof ImageError ? err.message : "That image could not be used.");
    } finally {
      setPreparing(false);
    }
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
      className="relative flex flex-1 flex-col items-center overflow-hidden px-4 pb-4 pt-20 sm:px-6 sm:pb-8 sm:pt-12 md:pt-8"
    >
      <div
        className={`relative z-10 flex w-full flex-1 flex-col gap-6 overflow-hidden ${
          messages.length === 0 ? "max-w-3xl" : "max-w-2xl"
        }`}
      >
        {messages.length === 0 ? (
          <HomeDashboard
            userName={userName}
            conversations={conversations}
            activeConversationId={conversationId}
            githubRepo={githubRepo}
            onSelectConversation={onSelectConversation}
            onNewChat={onNewChat}
            onConnectRepo={() => setRepoPromptOpen(true)}
            onSuggestion={handleSuggestion}
          />
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
                      ? "rounded-[var(--nimbus-radius-card)] rounded-br-lg bg-nimbus-accent px-4 py-3 text-sm leading-relaxed text-[var(--nimbus-on-accent)] shadow-[var(--nimbus-shadow)]"
                      : "rounded-[var(--nimbus-radius-card)] rounded-bl-lg border border-nimbus-border bg-nimbus-surface px-4 py-3 text-sm leading-relaxed text-nimbus-text shadow-[var(--nimbus-inset-highlight),var(--nimbus-shadow)]"
                  }
                >
                  {message.parts.map((part, i) => {
                    if (part.type === "reasoning") {
                      const reasoningText =
                        (part as { reasoning?: string; text?: string }).reasoning ||
                        (part as { text?: string }).text ||
                        "";
                      if (!reasoningText.trim()) return null;
                      return (
                        <details
                          key={i}
                          className="my-2 rounded-lg border border-nimbus-border/60 bg-nimbus-bg/60 px-3 py-1.5 text-xs text-nimbus-text-muted"
                        >
                          <summary className="cursor-pointer select-none font-medium text-nimbus-text-muted transition-colors hover:text-nimbus-text">
                            Thought process
                          </summary>
                          <div className="mt-1.5 whitespace-pre-wrap leading-relaxed opacity-90">
                            {reasoningText}
                          </div>
                        </details>
                      );
                    }
                    if (part.type === "file" && part.mediaType?.startsWith("image/")) {
                      return (
                        // eslint-disable-next-line @next/next/no-img-element -- user's own attachment, a data URL
                        <img
                          key={i}
                          src={part.url}
                          alt={part.filename ? `Attached image: ${part.filename}` : "Attached image"}
                          className="mb-2 block max-h-56 w-auto max-w-full rounded-xl"
                        />
                      );
                    }
                    if (part.type === "tool-editImage") {
                      const p = part as {
                        state: string;
                        input?: { instruction?: string };
                        output?: { jobId?: string; error?: string };
                        errorText?: string;
                      };
                      const canRetry = message.id === lastAssistantId && !isStreaming;
                      const onRetry = canRetry ? () => regenerate() : undefined;
                      if (p.state === "output-available" && p.output?.jobId) {
                        return (
                          <ImageJobCard
                            key={i}
                            jobId={p.output.jobId}
                            instruction={p.input?.instruction}
                            onRetry={onRetry}
                          />
                        );
                      }
                      if (p.state === "output-available" || p.state === "output-error") {
                        return (
                          <ImageJobCard
                            key={i}
                            error={p.output?.error || p.errorText || "The edit could not start."}
                            instruction={p.input?.instruction}
                            onRetry={onRetry}
                          />
                        );
                      }
                      return (
                        <div key={i} className="mt-2 flex w-full max-w-[22rem] flex-col gap-2">
                          <div className="nimbus-sheen relative aspect-square w-full overflow-hidden rounded-[var(--nimbus-radius-card)] border border-nimbus-border bg-nimbus-bg" />
                          <p role="status" aria-live="polite" className="px-1 text-sm font-medium">
                            Sending your image to the GPU
                          </p>
                        </div>
                      );
                    }
                    if (part.type === "text") {
                      const isLiveAssistantText =
                        isStreaming &&
                        message.role === "assistant" &&
                        message.id === lastMessage?.id;
                      return (
                        <MessageText key={i} text={part.text} streaming={isLiveAssistantText} />
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
            <p>{chatErrorText(error)}</p>
            {!isStreaming && (
              <button
                type="button"
                onClick={() => regenerate()}
                className="mt-2 min-h-11 rounded-[var(--nimbus-radius-pill)] border border-nimbus-border px-3.5 text-xs font-medium text-nimbus-text-muted transition-[color,transform] duration-300 ease-[var(--nimbus-ease)] hover:text-nimbus-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nimbus-accent active:scale-95 sm:min-h-9"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {canEditImages && (attachment || attachError || preparing) && (
          <div className="flex flex-col gap-2">
            {preparing && (
              <p role="status" className="px-1 text-xs text-nimbus-text-muted">
                Preparing the image…
              </p>
            )}
            {attachment && (
              <div className="flex items-center gap-3 rounded-[var(--nimbus-radius-card)] border border-nimbus-border bg-nimbus-surface p-2 pr-3 shadow-[var(--nimbus-shadow)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the picked file */}
                <img src={attachment.dataUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-nimbus-text">{attachment.name}</p>
                  <p className="text-xs text-nimbus-text-muted">Ready to edit. Describe the change below.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  aria-label="Remove the attached image"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-nimbus-text-muted transition-[color,transform] duration-300 ease-[var(--nimbus-ease)] hover:text-nimbus-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nimbus-accent active:scale-90 sm:h-9 sm:w-9"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>
            )}
            {attachment && !input.trim() && (
              <div className="flex flex-wrap gap-2">
                {IMAGE_EDIT_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => {
                      setInput(idea);
                      inputRef.current?.focus();
                    }}
                    className="min-h-11 rounded-[var(--nimbus-radius-pill)] border border-nimbus-border bg-nimbus-surface px-3.5 text-xs font-medium text-nimbus-text-muted transition-[color,transform,border-color] duration-300 ease-[var(--nimbus-ease)] hover:border-nimbus-accent/40 hover:text-nimbus-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nimbus-accent active:scale-95 sm:min-h-9"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            )}
            {attachError && (
              <p role="alert" className="px-1 text-xs text-nimbus-text">
                {attachError}
              </p>
            )}
          </div>
        )}

        <div className="nimbus-shell shadow-[var(--nimbus-shadow)]">
          <form
            onSubmit={handleSubmit}
            onDragOver={(e) => {
              if (!canEditImages) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              if (!canEditImages) return;
              e.preventDefault();
              setDragging(false);
              void attachFile(e.dataTransfer.files[0]);
            }}
            className={`nimbus-shell-inner nimbus-glass flex flex-col gap-2 border bg-nimbus-surface/90 p-2 sm:flex-row sm:items-center ${
              dragging ? "border-nimbus-accent" : "border-nimbus-border"
            }`}
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
              {canEditImages && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES.join(",")}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      void attachFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming || preparing}
                    aria-label="Attach an image to edit"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-nimbus-border bg-nimbus-surface text-nimbus-text-muted transition-[color,transform,border-color] duration-300 ease-[var(--nimbus-ease)] hover:border-nimbus-accent/40 hover:text-nimbus-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nimbus-accent active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:w-10"
                  >
                    <ImagePlus aria-hidden className="h-[18px] w-[18px]" />
                  </button>
                </>
              )}
              <input
                ref={inputRef}
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-nimbus-text placeholder:text-nimbus-text-muted focus:outline-none disabled:opacity-50"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  if (!canEditImages) return;
                  const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
                  if (file) {
                    e.preventDefault();
                    void attachFile(file);
                  }
                }}
                placeholder={attachment ? "Describe the change" : "Ask something…"}
                disabled={isStreaming}
              />
              <button
                type="submit"
                disabled={isStreaming || preparing || !input.trim()}
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
