import { streamText, convertToModelMessages, stepCountIs, tool, type UIMessage } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

const tools = {
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

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: 'minimax/minimax-m3',
    system:
      'You are a helpful assistant. Use tools when they would give a more accurate or useful answer than reasoning alone. Only mention capabilities you actually have.',
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
