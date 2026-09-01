import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  tool,
  type UIMessage,
  type ToolSet,
} from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import { after } from 'next/server';
import { auth } from '@/auth';
import { retrieveMemory } from '@/lib/memory';
import { getUserSkills, logSignalAndMaybePropose, messageMatchesKnownSkill } from '@/lib/skillDiscovery';

export const maxDuration = 30;

const builtinTools = {
  getCurrentTime: tool({
    description: 'Get the current date and time.',
    inputSchema: z.object({}),
    execute: async () => ({ time: new Date().toISOString() }),
  }),
  calculate: tool({
    description: 'Evaluate a basic arithmetic expression, e.g. "12 * (4 + 3)".',
    inputSchema: z.object({ expression: z.string() }),
    execute: async ({ expression }) => {
      try {
        const result = Function(`"use strict"; return (${expression})`)();
        return { result };
      } catch {
        return { error: 'Could not evaluate that expression.' };
      }
    },
  }),
};

const BASE_SYSTEM_PROMPT = `You are ARO, a coding-focused assistant. You help write, explain, and debug code.

When you write code that belongs in a project file (not a throwaway snippet), tag the fence with its path using the "language:relative/path" convention, e.g.:

\`\`\`tsx:app/components/Button.tsx
...
\`\`\`

Only add a path when the code is meant to be saved as a real file in the user's project — short illustrative snippets don't need one. Use tools when they give a more accurate answer than reasoning alone. Only mention capabilities you actually have.`;

type McpConnectorInput = { url: string; authHeader?: string };
type GithubRepoInput = { owner: string; name: string; branch: string };
type ModelSource = 'gateway' | 'omniroute';

let omniroute: ReturnType<typeof createOpenAICompatible> | null = null;

function resolveModel(model: string, source: ModelSource | undefined) {
  if (source !== 'omniroute') return model;
  if (!omniroute) {
    const baseURL = process.env.OMNIROUTE_BASE_URL;
    if (!baseURL) {
      throw new Error('OmniRoute is not configured (OMNIROUTE_BASE_URL missing).');
    }
    omniroute = createOpenAICompatible({
      name: 'omniroute',
      baseURL,
      // ngrok's free tier serves an HTML interstitial warning page instead
      // of the real response unless this header is present.
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
  }
  return omniroute(model);
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string }).text)
    .join('\n\n');
}

export async function POST(request: Request) {
  const {
    messages,
    model,
    modelSource,
    mcpConnectors,
    githubRepo,
  }: {
    messages: UIMessage[];
    model?: string;
    modelSource?: ModelSource;
    mcpConnectors?: McpConnectorInput[];
    githubRepo?: GithubRepoInput;
  } = await request.json();

  const session = await auth();
  const userId = session?.githubUserId;
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const lastUserText = lastUserMessage ? textOf(lastUserMessage) : '';

  const mcpClients = await Promise.all(
    (mcpConnectors ?? []).map((connector) =>
      createMCPClient({
        transport: {
          type: 'http',
          url: connector.url,
          headers: connector.authHeader
            ? { Authorization: connector.authHeader }
            : undefined,
        },
      }).catch(() => null)
    )
  );

  const mcpToolSets = await Promise.all(
    mcpClients.map((client) => client?.tools().catch(() => ({})))
  );

  const tools: ToolSet = Object.assign(
    {},
    builtinTools,
    ...mcpToolSets.filter(Boolean)
  );

  let systemPrompt = BASE_SYSTEM_PROMPT;

  // Project memory: recall relevant chunks from a connected repo, so the
  // assistant isn't starting cold each session.
  if (userId && githubRepo && lastUserText.trim()) {
    try {
      const matches = await retrieveMemory(
        userId,
        `${githubRepo.owner}/${githubRepo.name}`,
        lastUserText,
        5
      );
      if (matches.length > 0) {
        systemPrompt += `\n\nRelevant project context from ${githubRepo.owner}/${githubRepo.name} (recalled from earlier sessions, may be partial or stale):\n\n${matches
          .map((m) => `File: ${m.path}\n${m.content.slice(0, 1500)}`)
          .join('\n\n---\n\n')}`;
      }
    } catch {
      // Memory is a nice-to-have; a retrieval failure shouldn't block chat.
    }
  }

  // Learned skills: mention approved ones so the model knows what it can
  // proactively offer, and log a signal when the message doesn't match
  // anything known yet (the autonomous-discovery input).
  if (userId) {
    try {
      const { approved } = await getUserSkills(userId);
      if (approved.length > 0) {
        systemPrompt += `\n\nThis user has approved these learned skills — use them when relevant:\n${approved
          .map((s) => `- ${s.name}: ${s.description}`)
          .join('\n')}`;
      }
      if (lastUserText.trim() && !messageMatchesKnownSkill(lastUserText, approved)) {
        // Scheduled for after the response is sent — this must never add
        // latency to the user-visible reply.
        after(() => logSignalAndMaybePropose(userId, lastUserText));
      }
    } catch {
      // Non-critical background bookkeeping.
    }
  }

  const defaultModel = modelSource === 'omniroute' ? 'auto/best-coding' : 'minimax/minimax-m3';

  let resolvedModel;
  try {
    resolvedModel = resolveModel(model || defaultModel, modelSource);
  } catch (err) {
    await Promise.all(mcpClients.map((client) => client?.close()));
    const message = err instanceof Error ? err.message : 'Failed to resolve model.';
    return new Response(message, { status: 502 });
  }

  const result = streamText({
    model: resolvedModel,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
    onFinish: async () => {
      await Promise.all(mcpClients.map((client) => client?.close()));
    },
  });

  return result.toUIMessageStreamResponse({
    // The AI SDK masks the real error behind a generic "An error occurred."
    // by default so internal failures aren't leaked to end users. This app
    // has no untrusted end users beyond the operator, and a masked message
    // makes provider failures (bad model id, upstream 5xx, etc.) impossible
    // to diagnose from the UI.
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  });
}
