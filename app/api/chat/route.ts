import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  tool,
  type UIMessage,
  type ToolSet,
} from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { z } from 'zod';

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

const SYSTEM_PROMPT = `You are Nimbus, a coding-focused assistant. You help write, explain, and debug code.

When you write code that belongs in a project file (not a throwaway snippet), tag the fence with its path using the "language:relative/path" convention, e.g.:

\`\`\`tsx:app/components/Button.tsx
...
\`\`\`

Only add a path when the code is meant to be saved as a real file in the user's project — short illustrative snippets don't need one. Use tools when they give a more accurate answer than reasoning alone. Only mention capabilities you actually have.`;

type McpConnectorInput = { url: string; authHeader?: string };

export async function POST(request: Request) {
  const {
    messages,
    model,
    mcpConnectors,
  }: {
    messages: UIMessage[];
    model?: string;
    mcpConnectors?: McpConnectorInput[];
  } = await request.json();

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

  const result = streamText({
    model: model || 'minimax/minimax-m3',
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
    onFinish: async () => {
      await Promise.all(mcpClients.map((client) => client?.close()));
    },
  });

  return result.toUIMessageStreamResponse();
}
