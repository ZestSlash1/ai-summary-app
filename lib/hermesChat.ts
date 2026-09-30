import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage, type UIMessageChunk } from "ai";
import { hermesEndpoint, hermesErrorText, hermesFetch, hermesMemoryKey, hermesSessionId } from "./hermes";
import { HermesTranslator, SseParser } from "./hermesStream";
import type { AgentOptions } from "./types";

type Repo = { owner: string; name: string; branch: string };

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n\n");
}

const HERMES_CONTEXT = `You are Hermes, reached through ARO, a coding workspace in the browser. Reply in Markdown; the user reads your answer rendered in a chat panel. Your tool steps are shown to them as a timeline, so do not narrate each command you run. When you change code in a repository, say which files you changed.`;

/**
 * One chat turn handled by Hermes Agent instead of a plain model. Hermes keeps the transcript
 * itself (keyed by X-Hermes-Session-Id), so only the new message is sent, plus a short
 * excerpt of earlier turns the first time a chat switches over to Hermes.
 */
export async function hermesChatResponse({
  messages,
  chatId,
  model,
  githubUserId,
  repo,
  plan,
  signal,
  agentOptions,
  customInstructions,
}: {
  messages: UIMessage[];
  chatId: unknown;
  model?: string;
  githubUserId: string;
  repo?: Repo;
  plan?: boolean;
  signal: AbortSignal;
  agentOptions?: AgentOptions;
  customInstructions?: string;
}): Promise<Response> {
  const endpoint = hermesEndpoint();
  if (!endpoint) return Response.json({ error: hermesErrorText(503) }, { status: 503 });

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUser ? textOf(lastUser) : "";
  if (!userText.trim()) return Response.json({ error: "Write a message for Hermes." }, { status: 400 });
  const hasImage = lastUser?.parts.some((p) => p.type === "file");

  let system = HERMES_CONTEXT;
  if (repo) {
    system += `\n\nThe user linked the GitHub repo ${repo.owner}/${repo.name} (branch ${repo.branch}) to this chat. If a local clone exists, work there; ask before cloning or pushing.`;
  }
  if (plan) {
    system += '\n\nPlan mode is on. Start with a short numbered plan (three to six steps) under a "Plan" heading, then carry it out.';
  }
  // First Hermes turn in a chat that began with another model: hand over what came before.
  const hermesBefore = messages.some(
    (m) => m.role === "assistant" && (m.metadata as { agent?: string } | undefined)?.agent === "hermes"
  );
  const earlier = messages.slice(0, messages.lastIndexOf(lastUser!)).filter((m) => textOf(m).trim());
  if (!hermesBefore && earlier.length) {
    const excerpt = earlier
      .slice(-10)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${textOf(m).slice(0, 700)}`)
      .join("\n\n");
    system += `\n\nThis chat started with another model. Earlier turns, for context:\n\n${excerpt}`;
  }

  if (agentOptions?.permission === "readonly") {
    system += "\n\nPermission mode is read-only. Do not modify, create, delete, or push any files.";
  }
  const effectiveCustom = agentOptions?.customInstructions?.trim() || customInstructions?.trim();
  if (effectiveCustom) {
    system += `\n\nCustom instructions for this session:\n${effectiveCustom}`;
  }

  const sessionId = hermesSessionId(chatId);
  let upstream: Response;
  try {
    upstream = await hermesFetch(endpoint, "/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(sessionId ? { "X-Hermes-Session-Id": sessionId } : {}),
        "X-Hermes-Session-Key": hermesMemoryKey(githubUserId),
      },
      body: JSON.stringify({
        model: model || "hermes-agent",
        stream: true,
        ...(agentOptions?.effort
          ? { model_options: { reasoning: { effort: agentOptions.effort } } }
          : {}),
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: hasImage ? `${userText}\n\n(An image was attached in ARO; Hermes did not receive it.)` : userText,
          },
        ],
      }),
    });
  } catch {
    return Response.json({ error: hermesErrorText(502) }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    const body = (await upstream.json().catch(() => null)) as { error?: { type?: string } } | null;
    return Response.json({ error: hermesErrorText(upstream.status, body?.error?.type) }, { status: 502 });
  }
  const body = upstream.body;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const write = (chunk: unknown) => writer.write(chunk as UIMessageChunk);
      write({ type: "start", messageMetadata: { agent: "hermes" } });
      write({ type: "start-step" });
      const parser = new SseParser();
      const translator = new HermesTranslator();
      const reader = body.pipeThrough(new TextDecoderStream()).getReader();
      try {
        while (!translator.done) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const event of parser.push(value)) for (const chunk of translator.translate(event)) write(chunk);
        }
      } finally {
        for (const chunk of translator.finish()) write(chunk);
        reader.releaseLock();
      }
      write({ type: "finish-step" });
      write({ type: "finish" });
    },
    onError: () => "Hermes stopped unexpectedly. Try again.",
  });
  return createUIMessageStreamResponse({ stream });
}
