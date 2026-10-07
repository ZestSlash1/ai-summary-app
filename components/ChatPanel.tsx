"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ChatStatus, type UIMessage } from "ai";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowDown, Brain, ChevronRight, ImagePlus, Layers, ListChecks, RotateCw } from "lucide-react";
import { gsap, useGSAP, Flip, iconWiggle, reducedMotion } from "@/lib/motion";
import { ModelSwitcher } from "./ModelSwitcher";
import { RepoConnect } from "./RepoConnect";
import { McpConnectors } from "./McpConnectors";
import { WorkspaceRail } from "./workspace/WorkspaceRail";
import { SkillPrompt } from "./SkillPrompt";
import { MessageActions } from "./MessageActions";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { AssistantAvatar } from "./BrandMark";
import { AroField } from "./AroField";
import { AroGlow, type GlowPhase } from "./AroGlow";
import { ImageJobCard } from "./ImageJobCard";
import { MessageText } from "./chat/Markdown";
import { ToolActivity, type ToolCall } from "./chat/ToolActivity";
import { PushCard } from "./chat/PushCard";
import { HermesApprovalCard } from "./chat/HermesApproval";
import type { HermesApproval } from "@/lib/hermesStream";
import { Composer } from "./chat/Composer";
import { SkillsPicker } from "./chat/SkillsPicker";
import { AgentOptionsPopover } from "./chat/AgentOptionsPopover";
import {
  WelcomeBanner,
  WelcomeHero,
  WelcomeSuggestions,
  suggestionsFor,
  useWelcomeIntro,
} from "./chat/Welcome";
import { CHIP, CHIP_LABEL, CHIP_LABEL_EXTRA, CHIP_ON } from "./ui/classes";
import { extractPushableFiles } from "@/lib/codeBlocks";
import type { McpConnector } from "@/lib/mcp";
import type { AgentOptions, Conversation, GithubRepoLink } from "@/lib/types";
import { useToast } from "./Toaster";
import {
  createConversation,
  loadModelSource,
  loadConversations,
  saveConversations,
  loadOpenTabs,
  saveOpenTabs,
  saveActiveId,
  titleFromMessage,
  type ModelSource,
} from "@/lib/storage";
import { parseModelRef } from "@/lib/modelRef";
import { useHomeGpu } from "@/lib/useHomeGpu";
import { ImageError, prepareImage, type PreparedImage } from "@/lib/imageResize";
import { estimateConversationTokens, getModelContextLimit, calculateContextUsage } from "@/lib/tokenEstimate";

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n\n");
}

const IMAGE_EDIT_IDEAS = ["Remove the background", "Make it look like evening", "Turn it into a pencil sketch"];

/** A short, safe sentence for a failed chat request. Our own routes send readable errors. */
function chatErrorText(err: Error, source: ModelSource): string {
  let text = err.message || "";
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.error === "string") text = parsed.error;
  } catch {
    // Not JSON: use the message as is.
  }
  if (/sign in|not allowed|GPU|image edit|Hermes|could not run/i.test(text)) return text;
  if (source === "bonsai") {
    return "Bonsai did not respond. Check that the home PC is on (Settings shows its state), then try again.";
  }
  return "Something went wrong. Try again.";
}

type Part = UIMessage["parts"][number];

/** A reply regrouped for display: consecutive tool calls become one timeline. */
type Block =
  | { kind: "text"; key: string; text: string }
  | { kind: "reasoning"; key: string; text: string; live: boolean }
  | { kind: "tools"; key: string; calls: ToolCall[] }
  | { kind: "image"; key: string; url: string; filename?: string }
  | { kind: "editImage"; key: string; part: Part }
  | { kind: "approval"; key: string; approval: HermesApproval };

function toBlocks(parts: Part[]): Block[] {
  const blocks: Block[] = [];
  let tools: ToolCall[] | null = null;
  const flush = () => {
    if (tools?.length) blocks.push({ kind: "tools", key: `tools-${tools[0].id}`, calls: tools });
    tools = null;
  };

  parts.forEach((part, i) => {
    if (part.type === "step-start") return;
    if (part.type === "data-hermes-approval") {
      flush();
      const p = part as { id?: string; data: HermesApproval };
      blocks.push({ kind: "approval", key: p.id ?? `a-${i}`, approval: p.data });
      return;
    }
    if (part.type === "reasoning") {
      const p = part as { text?: string; reasoning?: string; state?: string };
      const text = p.reasoning || p.text || "";
      if (!text.trim()) return;
      flush();
      blocks.push({ kind: "reasoning", key: `r-${i}`, text, live: p.state === "streaming" });
      return;
    }
    if (part.type === "tool-editImage") {
      flush();
      blocks.push({ kind: "editImage", key: `e-${i}`, part });
      return;
    }
    if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
      const p = part as {
        type: string;
        toolName?: string;
        toolCallId?: string;
        state: string;
        input?: Record<string, unknown>;
        output?: unknown;
        errorText?: string;
      };
      (tools ??= []).push({
        id: p.toolCallId ?? `t-${i}`,
        name: p.type === "dynamic-tool" ? (p.toolName ?? "tool") : p.type.slice(5),
        state: p.state,
        input: p.input,
        output: p.output && typeof p.output === "object" ? (p.output as Record<string, unknown>) : undefined,
        errorText: p.errorText,
      });
      return;
    }
    flush();
    if (part.type === "text") {
      if (part.text.trim()) blocks.push({ kind: "text", key: `x-${i}`, text: part.text });
    } else if (part.type === "file" && part.mediaType?.startsWith("image/")) {
      blocks.push({ kind: "image", key: `f-${i}`, url: part.url, filename: part.filename });
    }
  });
  flush();
  return blocks;
}

/**
 * Which part of the turn the reply glow shows. It keeps cycling while the model works
 * (reasoning and tool calls included, as the "Thinking" row does) and lands once the reply
 * has something for the user: words, a picture, or an approval to give.
 */
function glowPhaseFor(status: ChatStatus, last: UIMessage | undefined): GlowPhase {
  if (status === "submitted") return "thinking";
  if (status !== "streaming") return "idle";
  const answered =
    last?.role === "assistant" &&
    toBlocks(last.parts).some((b) => b.kind === "text" || b.kind === "image" || b.kind === "approval");
  return answered ? "answering" : "thinking";
}

/** The model's private reasoning, folded away by default. Opens and closes with a height tween. */
function Reasoning({ text, live }: { text: string; live: boolean }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    const details = detailsRef.current;
    const body = bodyRef.current;
    if (!details || !body) return;
    const fast = reducedMotion();
    gsap.killTweensOf(body);
    if (!details.open) {
      details.open = true;
      gsap.fromTo(
        body,
        { height: 0, autoAlpha: 0 },
        { height: "auto", autoAlpha: 1, duration: fast ? 0 : 0.45, ease: "aro", clearProps: "height" }
      );
    } else {
      gsap.to(body, {
        height: 0,
        autoAlpha: 0,
        duration: fast ? 0 : 0.25,
        ease: "aro-in",
        onComplete: () => {
          details.open = false;
          gsap.set(body, { clearProps: "all" });
        },
      });
    }
  }

  return (
    <details ref={detailsRef} className="group/reason my-1.5">
      <summary
        onClick={toggle}
        className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md py-0.5 text-[13px] text-nimbus-text-muted transition-colors hover:text-nimbus-text [&::-webkit-details-marker]:hidden"
      >
        <Brain aria-hidden className="h-3.5 w-3.5" />
        <span className={live ? "aro-shimmer" : ""}>{live ? "Thinking" : "Thought process"}</span>
        <ChevronRight
          aria-hidden
          className="h-3.5 w-3.5 transition-transform duration-300 group-open/reason:rotate-90"
        />
      </summary>
      <div ref={bodyRef} className="overflow-hidden">
        <div className="mb-2 mt-2 whitespace-pre-wrap border-l border-nimbus-border-strong pl-3.5 text-[13px] leading-relaxed text-nimbus-text-muted">
          {text}
        </div>
      </div>
    </details>
  );
}

export function ChatPanel({
  conversationId,
  mode,
  active,
  initialMessages,
  model,
  onModelChange,
  onMessagesUpdate,
  githubRepo,
  onRepoChange,
  lastConversation,
  userName,
  signedIn,
  onSelectConversation,
  onStreamingChange,
  continuedFrom,
  continuedIn,
}: {
  conversationId: string;
  mode?: "chat" | "code";
  active: boolean;
  initialMessages: UIMessage[];
  model: string;
  onModelChange: (conversationId: string, model: string) => void;
  onMessagesUpdate: (conversationId: string, messages: UIMessage[]) => void;
  githubRepo?: GithubRepoLink;
  onRepoChange: (conversationId: string, repo: GithubRepoLink | undefined) => void;
  lastConversation?: Conversation;
  userName?: string | null;
  signedIn: boolean;
  onSelectConversation: (id: string) => void;
  onStreamingChange: (conversationId: string, streaming: boolean) => void;
  continuedFrom?: { id: string; title: string };
  continuedIn?: { id: string; title: string };
}) {
  const links = useMemo(() => {
    if (continuedFrom || continuedIn) {
      return { continuedFrom, continuedIn };
    }
    if (typeof window !== "undefined") {
      const conv = loadConversations().find((c) => c.id === conversationId);
      return {
        continuedFrom: conv?.continuedFrom,
        continuedIn: conv?.continuedIn,
      };
    }
    return {};
  }, [conversationId, continuedFrom, continuedIn]);

  const modelRef = useRef(model);
  const repoRef = useRef(githubRepo);
  const [enabledConnectors, setEnabledConnectors] = useState<McpConnector[]>([]);
  const connectorsRef = useRef(enabledConnectors);
  const [plan, setPlan] = useState(false);
  const planRef = useRef(plan);
  const [agentOptions, setAgentOptions] = useState<AgentOptions>(() => {
    if (typeof window === "undefined") return {};
    try {
      const conv = loadConversations().find((c) => c.id === conversationId);
      return conv?.agentOptions ?? {};
    } catch {
      return {};
    }
  });
  const agentOptionsRef = useRef(agentOptions);

  useEffect(() => {
    modelRef.current = model;
    repoRef.current = githubRepo;
    connectorsRef.current = enabledConnectors;
    planRef.current = plan;
    agentOptionsRef.current = agentOptions;
  }, [model, githubRepo, enabledConnectors, plan, agentOptions]);

  const handleAgentOptionsChange = (newOptions: AgentOptions) => {
    setAgentOptions(newOptions);
    if (typeof window !== "undefined") {
      const all = loadConversations();
      const updated = all.map((c) => (c.id === conversationId ? { ...c, agentOptions: newOptions } : c));
      saveConversations(updated);
    }
  };

  // Reads the refs at request time (not render time), so the transport always sends
  // the latest settings without being recreated.
  /* eslint-disable react-hooks/refs */
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => {
          // The chat's model carries its source; older chats fall back to the old app-wide one.
          const ref = parseModelRef(modelRef.current, loadModelSource());
          return {
          model: ref.id,
          modelSource: ref.source,
          mcpConnectors: connectorsRef.current
            .filter((c) => c.enabled)
            .map((c) => ({ name: c.name, url: c.url, authHeader: c.authHeader })),
          githubRepo: repoRef.current,
          plan: planRef.current,
          agentOptions: agentOptionsRef.current,
          customInstructions:
            typeof window !== "undefined"
              ? window.localStorage.getItem("aro-custom-instructions") ?? undefined
              : undefined,
          skills: (() => {
            if (typeof window === "undefined") return [];
            try {
              const raw = localStorage.getItem("aro-installed-skills");
              const list = raw ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
              // Only what the model can use. The installed skills also hold every bundled file
              // (up to 200 KB each), which would swell every request for nothing.
              return list
                .filter((s) => s.enabled !== false)
                .map((s) => ({ name: s.name, description: s.description, skillMd: s.skillMd, enabled: true }));
            } catch {
              return [];
            }
          })(),
          };
        },
      })
  );
  /* eslint-enable react-hooks/refs */

  const toast = useToast();
  const { messages, setMessages, sendMessage, status, error, regenerate, stop } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
  });

  const isStreaming = status === "streaming" || status === "submitted";
  const isEmpty = messages.length === 0;
  const lastMessage = messages[messages.length - 1];
  const awaitingReply = isStreaming && lastMessage?.role === "user";
  const glowPhase = glowPhaseFor(status, lastMessage);
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const lastUserText = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "user");
    return last ? textOf(last) : "";
  }, [messages]);

  // Persist when a turn starts (so the title and the user's message land right away)
  // and when it settles. Never per token: signed-in users write to the database.
  const persistRef = useRef(onMessagesUpdate);
  const messagesRef = useRef(messages);
  const statusRef = useRef(status);
  const stopRef = useRef(stop);
  const streamingChangeRef = useRef(onStreamingChange);
  useEffect(() => {
    persistRef.current = onMessagesUpdate;
    messagesRef.current = messages;
    stopRef.current = stop;
    streamingChangeRef.current = onStreamingChange;
  });
  useEffect(() => {
    const prev = statusRef.current;
    statusRef.current = status;
    if (prev === status) return;
    const started = status === "submitted";
    const settled = (prev === "streaming" || prev === "submitted") && (status === "ready" || status === "error");
    if (started || settled) persistRef.current(conversationId, messages);
  }, [status, messages, conversationId]);

  useEffect(() => {
    streamingChangeRef.current(conversationId, isStreaming);
  }, [isStreaming, conversationId]);

  // Closing a tab mid-reply keeps what arrived so far instead of losing it.
  useEffect(
    () => () => {
      streamingChangeRef.current(conversationId, false);
      if (statusRef.current === "streaming" || statusRef.current === "submitted") {
        persistRef.current(conversationId, messagesRef.current);
        stopRef.current();
      }
    },
    [conversationId]
  );

  // Guards against a double send: `status` only updates after a re-render, which leaves
  // a brief window where a fast double Enter fires twice. Released on any status change.
  const sendingRef = useRef(false);
  useEffect(() => {
    sendingRef.current = false;
  }, [status]);

  const [input, setInput] = useState("");
  const [mcpOpen, setMcpOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [repoPromptOpen, setRepoPromptOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(mode === "code");

  const pendingChangesCount = useMemo(() => {
    if (mode !== "code") return 0;
    return extractPushableFiles(messages.map(textOf)).length;
  }, [mode, messages]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (mode === "code" && !githubRepo && signedIn && active && isEmpty) {
      setRepoPromptOpen(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [mode, githubRepo, signedIn, active, isEmpty]);

  // When the current turn began, and whether it went to Bonsai (slow first reply after a nap).
  const [turn, setTurn] = useState({ startedAt: 0, bonsai: false });

  // Image editing: only offered to accounts allowed to use the home GPU.
  const { allowed: canEditImages, status: gpu } = useHomeGpu();
  const contextUsage = useMemo(() => {
    const tokens = estimateConversationTokens(messages);
    const limit = getModelContextLimit(model, gpu?.bonsaiContext);
    return calculateContextUsage(tokens, limit);
  }, [messages, model, gpu?.bonsaiContext]);
  const [attachment, setAttachment] = useState<PreparedImage | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const flipState = useRef<ReturnType<typeof Flip.getState> | null>(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  function trySend(text: string, image?: PreparedImage | null) {
    if (!text.trim() || isStreaming || sendingRef.current) return;
    sendingRef.current = true;
    // The composer glides from the middle of the empty screen to its docked spot.
    if (isEmpty && composerRef.current) flipState.current = Flip.getState(composerRef.current);
    stickToBottom.current = true;
    setTurn({ startedAt: Date.now(), bonsai: parseModelRef(model, loadModelSource()).source === "bonsai" });
    if (image) {
      sendMessage({
        text,
        files: [{ type: "file", mediaType: image.mediaType, url: image.dataUrl, filename: image.name }],
      });
    } else {
      sendMessage({ text });
    }
  }

  const trySendRef = useRef(trySend);
  useEffect(() => {
    trySendRef.current = trySend;
  });

  const [isSwitching, setIsSwitching] = useState(false);

  // Pick up any pending message queued by auto-continuation
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `aro-pending-prompt:${conversationId}`;
    const pendingRaw = window.sessionStorage.getItem(key);
    if (!pendingRaw) return;
    window.sessionStorage.removeItem(key);
    try {
      const parsed = JSON.parse(pendingRaw);
      if (parsed?.text) {
        // A timer, not requestAnimationFrame: frames stop in a background tab, so a user who
        // switched tabs while the summary loaded came back to a message that never went out.
        window.setTimeout(() => {
          trySendRef.current(parsed.text, parsed.image);
        }, 0);
      }
    } catch {
      // Ignore
    }
  }, [conversationId]);

  async function autoSwitchConversation(pendingText: string, pendingImage?: PreparedImage | null) {
    if (sendingRef.current || isStreaming || isSwitching) return;
    sendingRef.current = true;
    setIsSwitching(true);

    try {
      const modelRefParsed = parseModelRef(model, loadModelSource());

      // 1. Fetch handoff summary via /api/chat/summary
      let summaryText = "";
      try {
        const res = await fetch("/api/chat/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            model: modelRefParsed.id,
            modelSource: modelRefParsed.source,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          summaryText = typeof data.summary === "string" ? data.summary : "";
        }
      } catch {
        // Fall back to continuing without summary if endpoint fails
      }

      // 2. Identify current conversation info
      const allConvs = loadConversations();
      const currentConv = allConvs.find((c) => c.id === conversationId);
      const currentTitle = currentConv?.title || "Previous chat";

      // 3. Create new conversation with same model, repo, mode
      const newId = crypto.randomUUID();
      const newTitle = titleFromMessage(pendingText) || "Continued chat";
      const summaryPrefix = `Continued from ${currentTitle}`;
      const summaryContent = summaryText
        ? `${summaryPrefix}\n\n${summaryText}`
        : summaryPrefix;

      const handoffMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: "system",
        parts: [{ type: "text", text: summaryContent }],
      };

      const newConversation: Conversation = {
        id: newId,
        title: newTitle,
        messages: [handoffMessage],
        model,
        createdAt: Date.now(),
        githubRepo,
        mode: currentConv?.mode,
        continuedFrom: { id: conversationId, title: currentTitle },
      };

      // 4. Update current conversation with continuedIn link
      let foundCurrent = false;
      const updatedConvs = allConvs.map((c) => {
        if (c.id === conversationId) {
          foundCurrent = true;
          return {
            ...c,
            continuedIn: { id: newId, title: newTitle },
          };
        }
        return c;
      });
      if (!foundCurrent) {
        updatedConvs.push({
          id: conversationId,
          title: currentTitle,
          messages,
          model,
          createdAt: Date.now(),
          githubRepo,
          continuedIn: { id: newId, title: newTitle },
        });
      }
      updatedConvs.push(newConversation);

      // Persist to storage
      saveConversations(updatedConvs);

      // Update open tabs and set active conversation
      const openTabs = loadOpenTabs();
      if (!openTabs.includes(newId)) {
        saveOpenTabs([...openTabs, newId]);
      }
      saveActiveId(newId);

      // Store pending prompt to be automatically sent in the new conversation
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          `aro-pending-prompt:${newId}`,
          JSON.stringify({ text: pendingText, image: pendingImage })
        );
      }

      // Reset input state in current panel
      setInput("");
      setAttachment(null);
      setAttachError(null);

      // Switch to new tab smoothly without page reload
      onSelectConversation(newId);
    } catch {
      sendingRef.current = false;
      setIsSwitching(false);
    }
  }

  function submit() {
    if (!input.trim() || preparing || isSwitching) return;
    const modelRefParsed = parseModelRef(model, loadModelSource());
    const isHermes = modelRefParsed.source === "hermes";
    if (!isHermes && contextUsage.percent >= 80 && messages.length > 0) {
      void autoSwitchConversation(input, attachment);
      return;
    }
    trySend(input, attachment);
    setInput("");
    setAttachment(null);
    setAttachError(null);
  }

  const handleRestoreCheckpoint = (messageIndex: number) => {
    if (messageIndex < 0 || messageIndex >= messages.length) return;
    const truncated = messages.slice(0, messageIndex + 1);
    setMessages(truncated);
    // The normal save path: it updates the app's state and, when signed in, the database.
    // Writing localStorage directly left signed-in chats (and the page's own copy) unchanged.
    persistRef.current(conversationId, truncated);
    toast({ title: "Restored conversation to this checkpoint.", tone: "success" });
  };

  const handleSlashCommand = async (cmd: "plan" | "clear" | "compact" | "model" | "skills" | "new") => {
    switch (cmd) {
      case "plan": {
        setPlan((prev) => {
          const next = !prev;
          toast({ title: next ? "Plan mode enabled" : "Plan mode disabled", tone: "info" });
          return next;
        });
        break;
      }
      case "clear": {
        setMessages([]);
        persistRef.current(conversationId, []);
        toast({ title: "Conversation cleared", tone: "info" });
        break;
      }
      case "compact": {
        if (messages.length === 0) {
          toast({ title: "No messages to compact", tone: "info" });
          return;
        }
        try {
          toast({ title: "Compacting conversation...", tone: "info" });
          const res = await fetch("/api/chat/summary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages, model }),
          });
          if (!res.ok) throw new Error("Compaction failed");
          const { summary } = (await res.json()) as { summary: string };
          toast({ title: "Summary generated: creating continuation", tone: "success" });
          void autoSwitchConversation(summary);
        } catch {
          toast({ title: "Failed to compact conversation", tone: "error" });
        }
        break;
      }
      case "model": {
        setModelOpen(true);
        break;
      }
      case "skills": {
        if (mode === "code") {
          setWorkspaceOpen(true);
        } else {
          toast({ title: "Skills can be configured in the controls bar or in Coding sessions", tone: "info" });
        }
        break;
      }
      case "new": {
        if (typeof window !== "undefined") {
          const newConv = createConversation(model, { mode });
          const all = loadConversations();
          saveConversations([newConv, ...all]);
          onSelectConversation(newConv.id);
        }
        break;
      }
    }
  };

  async function attachFile(file: File | undefined) {
    if (!file || !canEditImages) return;
    setAttachError(null);
    setPreparing(true);
    try {
      setAttachment(await prepareImage(file));
      textareaRef.current?.focus();
    } catch (err) {
      setAttachError(err instanceof ImageError ? err.message : "That image could not be used.");
    } finally {
      setPreparing(false);
    }
  }

  function retry() {
    setTurn({ startedAt: Date.now(), bonsai: parseModelRef(model, loadModelSource()).source === "bonsai" });
    void regenerate();
  }

  useWelcomeIntro(containerRef, composerRef, isEmpty);

  // First message: play the composer's glide recorded in trySend, then fade the thread in.
  useLayoutEffect(() => {
    if (isEmpty || !flipState.current) return;
    const state = flipState.current;
    flipState.current = null;
    const fast = reducedMotion();
    Flip.from(state, { targets: composerRef.current, duration: fast ? 0 : 0.8, ease: "aro" });
    gsap.from(listRef.current, { autoAlpha: 0, y: 12, duration: fast ? 0 : 0.6, delay: fast ? 0 : 0.2, ease: "aro" });
  }, [isEmpty]);

  // Messages rise in as they arrive. Ones already on screen when a chat opens get a short stagger.
  const seenIds = useRef<Set<string> | null>(null);
  useGSAP(
    () => {
      const nodes = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-message]") ?? []);
      const fast = reducedMotion();
      if (seenIds.current === null) {
        // Recorded after a frame so React's dev double-run replays this intro instead of skipping it.
        const ids = new Set(nodes.map((n) => n.dataset.message!));
        requestAnimationFrame(() => (seenIds.current ??= ids));
        if (!fast && nodes.length) {
          gsap.from(nodes.slice(-6), { autoAlpha: 0, y: 10, duration: 0.5, stagger: 0.05, ease: "aro" });
        }
        return;
      }
      for (const node of nodes) {
        const id = node.dataset.message!;
        if (seenIds.current.has(id)) continue;
        seenIds.current.add(id);
        if (fast) continue;
        if (node.dataset.role === "user") {
          gsap.from(node, { autoAlpha: 0, y: 16, scale: 0.97, transformOrigin: "100% 100%", duration: 0.55, ease: "aro" });
        } else {
          gsap.from(node, { autoAlpha: 0, y: 8, duration: 0.5, ease: "aro" });
        }
      }
    },
    { dependencies: [messages.length], scope: listRef }
  );

  // Follow the bottom while the reply grows, unless the reader scrolled up to look at something.
  useEffect(() => {
    const scroller = scrollRef.current;
    const list = listRef.current;
    if (!scroller || !list || isEmpty) return;
    const pin = () => {
      if (stickToBottom.current) scroller.scrollTop = scroller.scrollHeight;
    };
    pin();
    const observer = new ResizeObserver(pin);
    observer.observe(list);
    return () => observer.disconnect();
  }, [isEmpty]);

  // The composer floats over the conversation as glass. Its height becomes --dock-h, which
  // pulls the dock up over the list and pads the list so the last message clears it.
  useLayoutEffect(() => {
    const dock = dockRef.current;
    const container = containerRef.current;
    if (!dock || !container) return;
    const measure = () => container.style.setProperty("--dock-h", `${dock.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (awaitingReply && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
    }
  }, [awaitingReply]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance < 80;
    setShowJump(distance > 240);
  }

  function jumpToLatest() {
    stickToBottom.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  }

  // "/" focuses the composer from anywhere in the active tab, like most chat apps.
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      textareaRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);

  // Focus the composer when this tab comes to the front (not on touch, where it opens the keyboard).
  useEffect(() => {
    if (active && window.matchMedia("(pointer: fine)").matches) textareaRef.current?.focus();
  }, [active]);

  function onDragOver(e: DragEvent) {
    if (!canEditImages || !Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    setDragging(true);
  }
  function onDragLeave(e: DragEvent) {
    if (!containerRef.current?.contains(e.relatedTarget as Node | null)) setDragging(false);
  }
  function onDrop(e: DragEvent) {
    if (!canEditImages) return;
    e.preventDefault();
    setDragging(false);
    void attachFile(e.dataTransfer.files[0]);
  }

  const firstName = userName?.trim().split(/\s+/)[0];
  const enabledCount = enabledConnectors.filter((c) => c.enabled).length;
  const onHermes = parseModelRef(model, loadModelSource()).source === "hermes";
  const placeholder = attachment
    ? "Describe the change you want"
    : onHermes
      ? "Give Hermes a task to run on your PC"
      : mode === "code"
        ? githubRepo
          ? `Ask about ${githubRepo.name}, or have ARO write code`
          : "Connect a repo or ask ARO to write code"
        : githubRepo
          ? `Ask about ${githubRepo.name}, or have ARO write code`
          : "Ask ARO to write, explain, or fix code";

  const controls = (
    <>
      {mode === "code" && (
        <RepoConnect
          value={githubRepo}
          onChange={(repo) => onRepoChange(conversationId, repo)}
          forceOpen={repoPromptOpen}
          onForceOpenHandled={() => setRepoPromptOpen(false)}
        />
      )}
      <ModelSwitcher
        value={model}
        onChange={(m) => onModelChange(conversationId, m)}
        open={modelOpen}
        onOpenChange={setModelOpen}
      />
      {mode !== "code" && (
        <RepoConnect
          value={githubRepo}
          onChange={(repo) => onRepoChange(conversationId, repo)}
          forceOpen={repoPromptOpen}
          onForceOpenHandled={() => setRepoPromptOpen(false)}
        />
      )}
      <McpConnectors
        open={mcpOpen}
        onOpenChange={setMcpOpen}
        onConnectorsChange={setEnabledConnectors}
        enabledCount={enabledCount}
      />
      <button
        type="button"
        aria-pressed={plan}
        onClick={() => setPlan((p) => !p)}
        title="Plan mode: ARO outlines the steps before doing the work"
        data-wiggle="pop"
        onPointerEnter={iconWiggle}
        className={`${CHIP} ${plan ? CHIP_ON : ""}`}
      >
        <ListChecks aria-hidden className="h-3.5 w-3.5" />
        <span className={CHIP_LABEL}>Plan</span>
      </button>
      <AgentOptionsPopover options={agentOptions} onChange={handleAgentOptionsChange} />
      <SkillsPicker onOpenSkillsTab={mode === "code" ? () => setWorkspaceOpen(true) : undefined} />
      {mode === "code" && (
        <button
          type="button"
          aria-pressed={workspaceOpen}
          onClick={() => setWorkspaceOpen((v) => !v)}
          title="Toggle workspace rail"
          data-wiggle="pop"
          onPointerEnter={iconWiggle}
          className={`${CHIP} ${workspaceOpen ? CHIP_ON : ""}`}
        >
          <Layers aria-hidden className="h-3.5 w-3.5" />
          <span className={CHIP_LABEL_EXTRA}>Workspace</span>
          {pendingChangesCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-nimbus-accent px-1 text-[10px] font-semibold text-white">
              {pendingChangesCount}
            </span>
          )}
        </button>
      )}
    </>
  );

  return (
    <div
      ref={containerRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative isolate flex h-full min-h-0 flex-row overflow-hidden"
    >
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* The welcome screen's light: an aurora under the particles, gone once the chat starts. */}
        <div
          aria-hidden
          className={`aro-aurora -z-10 inset-x-[-15%] top-[8%] h-[80%] transition-opacity duration-700 ${isEmpty ? "opacity-100" : "opacity-0"}`}
        />
        {/* Ambient particles behind the welcome screen; fades away once the chat starts. */}
        <AroField active={isEmpty && active} scopeRef={containerRef} />
        {/* Light behind the thread while a reply is on its way; see lib/aroGlow.ts. */}
        <AroGlow phase={glowPhase} />

      {isEmpty && (
        <div className="absolute inset-x-0 top-4 z-10 flex justify-center">
          <WelcomeBanner signedIn={signedIn} repo={githubRepo} onConnectRepo={() => setRepoPromptOpen(true)} />
        </div>
      )}

      {/* Header continuation links */}
      {(links.continuedFrom || links.continuedIn) && (
        <header
          role="region"
          aria-label="Conversation continuity links"
          className="relative z-20 flex shrink-0 items-center justify-between border-b border-nimbus-border/50 bg-nimbus-panel/60 px-4 py-2 text-[12.5px] text-nimbus-text-muted backdrop-blur-xs sm:px-6"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {links.continuedFrom && (
              <span className="flex min-w-0 items-center gap-1">
                <span>Continued from</span>
                <button
                  type="button"
                  onClick={() => onSelectConversation(links.continuedFrom!.id)}
                  className="truncate font-medium text-nimbus-accent-text hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-nimbus-accent"
                  aria-label={`Continued from ${links.continuedFrom.title}`}
                >
                  {links.continuedFrom.title}
                </button>
              </span>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            {links.continuedIn && (
              <span className="flex min-w-0 items-center gap-1">
                <span>Continued in</span>
                <button
                  type="button"
                  onClick={() => onSelectConversation(links.continuedIn!.id)}
                  className="truncate font-medium text-nimbus-accent-text hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-nimbus-accent"
                  aria-label={`Continued in ${links.continuedIn.title}`}
                >
                  {links.continuedIn.title}
                </button>
              </span>
            )}
          </div>
        </header>
      )}

      <div
        ref={scrollRef}
        onScroll={isEmpty ? undefined : onScroll}
        className={
          isEmpty
            ? "flex flex-[1.1] flex-col justify-end pb-7 pt-16"
            : "relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
        }
      >
        {isEmpty ? (
          <WelcomeHero firstName={firstName} />
        ) : (
          <div
            ref={listRef}
            style={{ paddingBottom: "calc(var(--dock-h, 0px) + 2rem)" }}
            className="mx-auto flex w-full max-w-[740px] flex-col gap-8 px-4 pt-8 sm:px-6"
          >
            {messages.map((message) => {
              if (message.role === "system") {
                const text = textOf(message);
                return (
                  <div
                    key={message.id}
                    data-message={message.id}
                    data-role="system"
                    className="mx-auto my-2 w-full max-w-[740px] rounded-[14px] border border-nimbus-border bg-nimbus-surface-2/60 px-4 py-3 text-[13px] leading-relaxed text-nimbus-text-muted"
                  >
                    <div className="whitespace-pre-wrap">{text}</div>
                  </div>
                );
              }

              if (message.role === "user") {
                const text = textOf(message);
                const images = message.parts.filter(
                  (p): p is Extract<Part, { type: "file" }> => p.type === "file" && Boolean(p.mediaType?.startsWith("image/"))
                );
                return (
                  <div key={message.id} data-message={message.id} data-role="user" className="flex flex-col items-end gap-2 pl-10">
                    {images.map((img, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- the user's own attachment, a data URL
                      <img
                        key={i}
                        src={img.url}
                        alt={img.filename ? `Attached image: ${img.filename}` : "Attached image"}
                        className="max-h-56 w-auto max-w-full rounded-[14px] border border-nimbus-border"
                      />
                    ))}
                    {text && (
                      <div className="max-w-full whitespace-pre-wrap break-words rounded-[18px] rounded-br-[6px] border border-[color-mix(in_oklab,var(--nimbus-accent)_26%,transparent)] bg-[color-mix(in_oklab,var(--nimbus-accent)_15%,var(--nimbus-panel))] px-4 py-2.5 text-[14.5px] leading-relaxed text-nimbus-text shadow-[var(--nimbus-inset-highlight)]">
                        {text}
                      </div>
                    )}
                  </div>
                );
              }

              const isLive = isStreaming && message.id === lastMessage?.id;
              const blocks = toBlocks(message.parts);
              const hasText = blocks.some((b) => b.kind === "text");
              const hasTools = blocks.some((b) => b.kind === "tools");
              const files = !isLive && githubRepo ? extractPushableFiles([textOf(message)]) : [];
              const isLast = message.id === lastAssistantId;

              return (
                <div
                  key={message.id}
                  data-message={message.id}
                  data-role="assistant"
                  data-last={isLast}
                  className="group flex gap-3.5"
                >
                  <AssistantAvatar live={isLive} />
                  <div className="min-w-0 flex-1 pt-[3px]">
                    {blocks.map((block) => {
                      switch (block.kind) {
                        case "reasoning":
                          return <Reasoning key={block.key} text={block.text} live={block.live && isLive} />;
                        case "tools":
                          return <ToolActivity key={block.key} calls={block.calls} />;
                        case "text":
                          return <MessageText key={block.key} text={block.text} streaming={isLive} />;
                        case "image":
                          return (
                            // eslint-disable-next-line @next/next/no-img-element -- inline image part, a data URL
                            <img
                              key={block.key}
                              src={block.url}
                              alt={block.filename ? `Image: ${block.filename}` : "Image"}
                              className="my-2 block max-h-72 w-auto max-w-full rounded-[14px] border border-nimbus-border"
                            />
                          );
                        case "approval":
                          return (
                            <HermesApprovalCard
                              key={block.key}
                              approval={block.approval}
                              live={isLive}
                              permission={agentOptions.permission}
                            />
                          );
                        case "editImage": {
                          const p = block.part as {
                            state: string;
                            input?: { instruction?: string };
                            output?: { jobId?: string; error?: string };
                            errorText?: string;
                          };
                          const onRetry = isLast && !isStreaming ? retry : undefined;
                          if (p.state === "output-available" && p.output?.jobId) {
                            return (
                              <ImageJobCard key={block.key} jobId={p.output.jobId} instruction={p.input?.instruction} onRetry={onRetry} />
                            );
                          }
                          if (p.state === "output-available" || p.state === "output-error") {
                            return (
                              <ImageJobCard
                                key={block.key}
                                error={p.output?.error || p.errorText || "The edit could not start."}
                                instruction={p.input?.instruction}
                                onRetry={onRetry}
                              />
                            );
                          }
                          return (
                            <div key={block.key} className="mt-2 flex w-full max-w-[22rem] flex-col gap-2">
                              <div className="nimbus-sheen relative aspect-square w-full overflow-hidden rounded-[14px] border border-nimbus-border bg-nimbus-surface" />
                              <p role="status" aria-live="polite" className="px-1 text-[13px] text-nimbus-text-muted">
                                Sending your image to the GPU
                              </p>
                            </div>
                          );
                        }
                      }
                    })}

                    {isLive && !hasText && (
                      <ThinkingIndicator
                        key={turn.startedAt}
                        since={turn.startedAt}
                        label={hasTools ? "Working" : "Thinking"}
                        bonsai={turn.bonsai}
                      />
                    )}

                    {!isLive && (
                      <MessageActions
                        text={textOf(message)}
                        showRegenerate={isLast && !isStreaming}
                        onRegenerate={retry}
                        onRestore={() => handleRestoreCheckpoint(messages.findIndex((m) => m.id === message.id))}
                      />
                    )}

                    {files.length > 0 && githubRepo && (
                      <PushCard
                        files={files}
                        repo={githubRepo}
                        permission={agentOptions.permission}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {awaitingReply && (
              <div className="flex gap-3.5" data-pending>
                <AssistantAvatar live />
                <div className="pt-[3px]">
                  <ThinkingIndicator key={turn.startedAt} since={turn.startedAt} bonsai={turn.bonsai} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        ref={dockRef}
        style={isEmpty ? undefined : { marginTop: "calc(var(--dock-h, 0px) * -1)" }}
        className="pointer-events-none relative z-10 shrink-0 px-3 pb-3 sm:px-5 sm:pb-4"
      >
        {!isEmpty && (
          <>
            {/* Under the glass: the conversation fades into the panel toward the bottom edge, and
                a faint aurora gives the composer's glass some light to carry. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[62%] bg-gradient-to-t from-nimbus-panel via-nimbus-panel/85 to-transparent" />
            <div aria-hidden className="aro-aurora -z-10 inset-x-[18%] bottom-[8%] h-[70%] opacity-60" />
            <button
              type="button"
              onClick={jumpToLatest}
              aria-label="Jump to the latest message"
              tabIndex={showJump ? 0 : -1}
              className={`aro-glass absolute -top-12 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border text-nimbus-text-muted transition-[opacity,translate,color,scale] duration-300 ease-[var(--nimbus-ease)] hover:text-nimbus-text motion-safe:active:scale-90 ${
                showJump ? "pointer-events-auto translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              <ArrowDown aria-hidden className="h-4 w-4" />
            </button>
          </>
        )}

        {/* The dock lets clicks and scrolling through to the conversation beside the composer. */}
        <div className="pointer-events-auto mx-auto flex w-full max-w-[740px] flex-col gap-2.5 sm:px-1">
          {active && lastUserText && !isStreaming && (
            <SkillPrompt
              latestUserText={lastUserText}
              githubRepo={githubRepo}
              hasEnabledMcp={enabledCount > 0}
              onConnectRepo={() => setRepoPromptOpen(true)}
              onOpenMcp={() => setMcpOpen(true)}
            />
          )}

          {error && !isStreaming && (
            <div
              role="alert"
              className="flex items-center gap-3 rounded-[12px] border border-nimbus-danger/25 bg-nimbus-danger-soft px-3.5 py-2.5 text-[13px] text-nimbus-text"
            >
              <p className="min-w-0 flex-1">{chatErrorText(error, parseModelRef(model, loadModelSource()).source)}</p>
              <button
                type="button"
                onClick={retry}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-nimbus-border-strong bg-nimbus-surface px-2.5 text-[12.5px] font-medium text-nimbus-text transition-[background-color,transform] hover:bg-nimbus-surface-2 active:scale-95"
              >
                <RotateCw aria-hidden className="h-3.5 w-3.5" />
                Try again
              </button>
            </div>
          )}

          {attachError && (
            <p role="alert" className="px-1 text-[12.5px] text-nimbus-danger">
              {attachError}
            </p>
          )}

          {attachment && !input.trim() && (
            <div className="flex flex-wrap gap-1.5">
              {IMAGE_EDIT_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => {
                    setInput(idea);
                    textareaRef.current?.focus();
                  }}
                  className={CHIP}
                >
                  {idea}
                </button>
              ))}
            </div>
          )}

          <Composer
            ref={composerRef}
            value={input}
            onValueChange={setInput}
            onSubmit={submit}
            onStop={() => void stop()}
            streaming={isStreaming}
            canSend={Boolean(input.trim()) && !preparing && !isStreaming && !isSwitching}
            placeholder={placeholder}
            textareaRef={textareaRef}
            fileInputRef={fileInputRef}
            controls={controls}
            attachment={attachment}
            preparing={preparing || isSwitching}
            canAttach={Boolean(canEditImages)}
            onAttachFile={(file) => void attachFile(file)}
            onRemoveAttachment={() => setAttachment(null)}
            dragging={dragging}
            contextUsage={contextUsage}
            onSlashCommand={handleSlashCommand}
          />

          {!isEmpty && (
            <p className="text-center text-[11.5px] text-nimbus-text-faint">
              ARO can make mistakes. Read code before you push it.
            </p>
          )}
        </div>
      </div>

      {isEmpty && (
        <div className="flex flex-1 flex-col pb-6 pt-6">
          <WelcomeSuggestions
            suggestions={suggestionsFor(githubRepo, mode)}
            onPick={(prompt) => trySend(prompt)}
            canEditImages={Boolean(canEditImages)}
            onPickImage={() => fileInputRef.current?.click()}
            lastConversation={lastConversation}
            onContinue={onSelectConversation}
          />
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-[14px] border-2 border-dashed border-nimbus-accent/70 bg-nimbus-panel/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-center">
            <ImagePlus aria-hidden className="h-6 w-6 text-nimbus-accent-text" />
            <p className="text-[14px] font-medium text-nimbus-text">Drop an image to edit it</p>
            <p className="text-[12.5px] text-nimbus-text-muted">PNG, JPEG, or WebP</p>
          </div>
        </div>
      )}
      </div>

      {mode === "code" && (
        <WorkspaceRail
          repo={githubRepo}
          messages={messages}
          open={workspaceOpen}
          onClose={() => setWorkspaceOpen(false)}
        />
      )}
    </div>
  );
}
