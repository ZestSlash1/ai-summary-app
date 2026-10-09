import type { UIMessage } from "ai";

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

function jsonLength(value: unknown): number {
  if (value === undefined || value === null) return 0;
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/** Tokens the system prompt, tool schemas, and skills index add on top of the messages. */
export const PROMPT_OVERHEAD_TOKENS = 3000;

export function estimateMessageTokens(message: UIMessage): number {
  let charCount = 0;
  const msg = message as unknown as { content?: string };
  if (msg.content) {
    charCount += msg.content.length;
  }
  if (message.parts) {
    for (const part of message.parts) {
      if (part.type === "text" && part.text) charCount += part.text.length;
      if (part.type === "reasoning") {
        const r = part as unknown as { reasoning?: string; text?: string };
        const text = r.reasoning || r.text;
        if (text) charCount += text.length;
      }
      // AI SDK v7 tool parts: "tool-<name>" or "dynamic-tool", with input and output. File reads
      // from the repo tools are the biggest thing in a coding chat, so they must be counted.
      if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
        const t = part as unknown as {
          input?: unknown;
          output?: unknown;
          errorText?: string;
          toolInvocation?: { args?: unknown; result?: unknown };
        };
        charCount += jsonLength(t.input) + jsonLength(t.output) + (t.errorText?.length ?? 0);
        // Older saved chats used the v4 shape.
        charCount += jsonLength(t.toolInvocation?.args) + jsonLength(t.toolInvocation?.result);
      }
    }
  }
  return Math.ceil(charCount / 3.5);
}

export function estimateTokens(input: string | UIMessage): number {
  if (typeof input === "string") {
    return estimateTokensFromText(input);
  }
  return estimateMessageTokens(input);
}

export function estimateConversationTokens(messages: UIMessage[]): number {
  return messages.reduce((acc, m) => acc + estimateMessageTokens(m), 0);
}

/** What Bonsai ran with before 64k was tried. When the gateway has not reported the real
 * window, assume the small one: guessing high lets a prompt overflow llama-server. */
export const BONSAI_SAFE_CONTEXT = 32768;

/** The window the Ollama models are created with (`PARAMETER num_ctx` in tools/ollama/*.Modelfile).
 * Ollama's OpenAI endpoint cannot set it per request, so this must match what was baked in. */
export const OLLAMA_CONTEXT = 12288;

export function getModelContextLimit(modelRef: string, bonsaiContext?: number | null): number {
  if (modelRef.startsWith("bonsai::")) {
    return bonsaiContext && bonsaiContext > 0 ? bonsaiContext : BONSAI_SAFE_CONTEXT;
  }
  if (modelRef.startsWith("ollama::")) return OLLAMA_CONTEXT;
  return 131072; // default 128k
}

export type ContextUsage = {
  tokens: number;
  limit: number;
  percent: number;
  level: "normal" | "warning" | "danger";
};

export function calculateContextUsage(tokens: number, limit: number): ContextUsage {
  const percent = Math.min(100, Math.max(0, (tokens / limit) * 100));
  const level: "normal" | "warning" | "danger" = percent >= 85 ? "danger" : percent >= 70 ? "warning" : "normal";
  return { tokens, limit, percent, level };
}
