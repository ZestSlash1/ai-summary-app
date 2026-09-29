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
import { fetchGatewayModels, fetchOmniRouteModels, fetchBonsaiModels } from '@/lib/modelCatalog';
import { FALLBACK_MODEL } from '@/lib/types';
import { safeEvaluate } from '@/lib/calc';
import { canUseBonsai, bonsaiDenied } from '@/lib/access';

export const maxDuration = 60;

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
        const result = safeEvaluate(expression);
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
type ModelSource = 'gateway' | 'omniroute' | 'bonsai';

let omniroute: ReturnType<typeof createOpenAICompatible> | null = null;
let bonsai: ReturnType<typeof createOpenAICompatible> | null = null;

function resolveModel(model: string, source: ModelSource | undefined) {
  if (source === 'bonsai') {
    if (!bonsai) {
      const baseURL = process.env.BONSAI_BASE_URL;
      if (!baseURL) {
        throw new Error('Bonsai is not configured (BONSAI_BASE_URL missing).');
      }
      bonsai = createOpenAICompatible({
        name: 'bonsai',
        baseURL,
        apiKey: process.env.BONSAI_API_KEY,
      });
    }
    return bonsai(model);
  }
  if (source === 'omniroute') {
    if (!omniroute) {
      const baseURL = process.env.OMNIROUTE_BASE_URL;
      if (!baseURL) {
        throw new Error('OmniRoute is not configured (OMNIROUTE_BASE_URL missing).');
      }
      omniroute = createOpenAICompatible({
        name: 'omniroute',
        baseURL,
        apiKey: process.env.OMNIROUTE_API_KEY,
      });
    }
    return omniroute(model);
  }
  return model;
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
  // Bonsai is the owner's home GPU: refuse before doing any other work.
  if (modelSource === 'bonsai' && !canUseBonsai(session)) return bonsaiDenied(session);
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

  // This only fires when the client sent no model at all — every normal
  // new-conversation path resolves a real one up front. Kept as a genuine
  // last resort: pick whatever's actually free in the live catalog instead
  // of a hardcoded id that can silently rot.
  async function resolveDefaultModel(): Promise<string> {
    try {
      let models;
      if (modelSource === 'bonsai') {
        models = await fetchBonsaiModels();
      } else if (modelSource === 'omniroute') {
        models = await fetchOmniRouteModels();
      } else {
        models = await fetchGatewayModels();
      }
      const free = models.find((m) => m.free);
      return (free ?? models[0])?.id ?? (modelSource === 'bonsai' ? 'bonsai-2-27b' : FALLBACK_MODEL);
    } catch {
      if (modelSource === 'bonsai') return 'bonsai-2-27b';
      return modelSource === 'omniroute' ? 'auto/best-free' : FALLBACK_MODEL;
    }
  }

  const result = streamText({
    model: resolveModel(model || (await resolveDefaultModel()), modelSource),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
    onFinish: async () => {
      await Promise.all(mcpClients.map((client) => client?.close()));
    },
  });

  return result.toUIMessageStreamResponse();
}
