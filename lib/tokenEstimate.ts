import type { UIMessage } from "ai";

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

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
      if (part.type === "tool-invocation") {
        const inv = (part as unknown as { toolInvocation?: { args?: unknown; result?: unknown } }).toolInvocation;
        if (inv?.args) charCount += JSON.stringify(inv.args).length;
        if (inv?.result) charCount += JSON.stringify(inv.result).length;
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

export function getModelContextLimit(modelRef: string, bonsaiContext?: number | null): number {
  if (modelRef.startsWith("bonsai::")) {
    return bonsaiContext && bonsaiContext > 0 ? bonsaiContext : 65536;
  }
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
