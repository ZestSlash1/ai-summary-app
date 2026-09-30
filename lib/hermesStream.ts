/**
 * Translates a Hermes Agent chat-completions stream into AI SDK UI message chunks.
 *
 * Hermes (NousResearch/hermes-agent, gateway/platforms/api_server_openai_routes.py) streams
 * OpenAI-style SSE plus its own events:
 *   data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}
 *   data: {"choices":[{"delta":{"reasoning_content":"..."}}]}
 *   event: hermes.tool.progress   data: {"tool","emoji","label","toolCallId","status":"running"|"completed"}
 *   event: approval.request       data: {"run_id","choices",["command","description","request_id",...]}
 *   event: hermes.status          data: {...}   (ignored here)
 *   : keepalive                   (comment, every 10 s)
 *   data: [DONE]
 *
 * No imports, so the Node test runner can load it directly.
 */

export type SseEvent = { event: string | null; data: string };

/** Incremental SSE parser: feed it text as it arrives, get whole events back. */
export class SseParser {
  private buffer = "";

  push(text: string): SseEvent[] {
    this.buffer += text.replace(/\r\n?/g, "\n");
    const events: SseEvent[] = [];
    let end: number;
    while ((end = this.buffer.indexOf("\n\n")) !== -1) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      let event: string | null = null;
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) continue; // blank or comment (keepalive)
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (data.length) events.push({ event, data: data.join("\n") });
    }
    return events;
  }
}

/** The subset of AI SDK UI message chunks this bridge writes. */
export type UiChunk =
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "reasoning-start"; id: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  | { type: "reasoning-end"; id: string }
  | { type: "tool-input-available"; toolCallId: string; toolName: string; input: unknown; dynamic: true }
  | { type: "tool-output-available"; toolCallId: string; output: unknown; dynamic: true }
  | { type: "tool-output-error"; toolCallId: string; errorText: string; dynamic: true }
  | { type: "data-hermes-approval"; id: string; data: HermesApproval }
  | { type: "error"; errorText: string };

export type HermesApproval = {
  runId: string;
  requestId?: string;
  command?: string;
  description?: string;
  choices: string[];
};

const APPROVAL_CHOICES = new Set(["once", "session", "always", "deny"]);

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function str(value: unknown, max = 2000): string | undefined {
  return typeof value === "string" && value ? value.slice(0, max) : undefined;
}

export class HermesTranslator {
  private seq = 0;
  private text: string | null = null;
  private reasoning: string | null = null;
  private running = new Map<string, string>(); // toolCallId -> tool name
  done = false;

  private nextId(prefix: string) {
    return `${prefix}-${++this.seq}`;
  }

  private closeText(out: UiChunk[]) {
    if (this.text) out.push({ type: "text-end", id: this.text });
    this.text = null;
  }

  private closeReasoning(out: UiChunk[]) {
    if (this.reasoning) out.push({ type: "reasoning-end", id: this.reasoning });
    this.reasoning = null;
  }

  translate(ev: SseEvent): UiChunk[] {
    const out: UiChunk[] = [];
    if (this.done) return out;

    if (ev.event === "hermes.tool.progress") {
      const p = parseJson(ev.data);
      const id = str(p?.toolCallId, 200);
      const tool = str(p?.tool, 120) ?? "tool";
      if (!p || !id) return out;
      if (p.status === "running") {
        // A step between two stretches of text: end the text so the timeline sits in order.
        this.closeReasoning(out);
        this.closeText(out);
        this.running.set(id, tool);
        out.push({
          type: "tool-input-available",
          toolCallId: id,
          toolName: tool,
          input: { label: str(p.label, 300) ?? tool, emoji: str(p.emoji, 16) },
          dynamic: true,
        });
      } else if (p.status === "completed") {
        if (!this.running.has(id)) {
          out.push({ type: "tool-input-available", toolCallId: id, toolName: tool, input: { label: tool }, dynamic: true });
        }
        this.running.delete(id);
        out.push({ type: "tool-output-available", toolCallId: id, output: { status: "completed" }, dynamic: true });
      }
      return out;
    }

    if (ev.event === "approval.request") {
      const p = parseJson(ev.data);
      const runId = str(p?.run_id, 200);
      if (!p || !runId) return out;
      this.closeReasoning(out);
      this.closeText(out);
      const requestId = str(p.request_id, 256);
      const choices = Array.isArray(p.choices)
        ? p.choices.filter((c): c is string => typeof c === "string" && APPROVAL_CHOICES.has(c))
        : [];
      out.push({
        type: "data-hermes-approval",
        id: `approval-${runId}-${requestId ?? String(p.timestamp ?? this.seq)}`,
        data: {
          runId,
          requestId,
          command: str(p.command),
          description: str(p.description, 500),
          choices: choices.length ? choices : ["once", "deny"],
        },
      });
      return out;
    }

    if (ev.event !== null) return out; // hermes.status and future events: not rendered

    if (ev.data.trim() === "[DONE]") return this.finish();

    const chunk = parseJson(ev.data);
    const choice = Array.isArray(chunk?.choices) ? (chunk.choices[0] as Record<string, unknown> | undefined) : undefined;
    const delta = (choice?.delta ?? {}) as Record<string, unknown>;

    const thinking = typeof delta.reasoning_content === "string" ? delta.reasoning_content : "";
    if (thinking) {
      this.closeText(out);
      if (!this.reasoning) {
        this.reasoning = this.nextId("reasoning");
        out.push({ type: "reasoning-start", id: this.reasoning });
      }
      out.push({ type: "reasoning-delta", id: this.reasoning, delta: thinking });
    }

    const content = typeof delta.content === "string" ? delta.content : "";
    if (content) {
      this.closeReasoning(out);
      if (!this.text) {
        this.text = this.nextId("text");
        out.push({ type: "text-start", id: this.text });
      }
      out.push({ type: "text-delta", id: this.text, delta: content });
    }

    // A turn that ends in failure carries the reason on its finish chunk.
    const error = chunk?.error as Record<string, unknown> | undefined;
    const reason = choice?.finish_reason;
    if (reason && reason !== "stop" && str(error?.message)) {
      this.closeReasoning(out);
      this.closeText(out);
      out.push({ type: "error", errorText: `Hermes stopped: ${str(error?.message, 400)}` });
    }
    return out;
  }

  /** Closes whatever is still open. Steps that never finished are marked as stopped. */
  finish(): UiChunk[] {
    const out: UiChunk[] = [];
    if (this.done) return out;
    this.done = true;
    this.closeReasoning(out);
    this.closeText(out);
    for (const id of this.running.keys()) {
      out.push({ type: "tool-output-error", toolCallId: id, errorText: "Stopped before this step finished.", dynamic: true });
    }
    this.running.clear();
    return out;
  }
}
