import {
  generateText,
  convertToModelMessages,
  type UIMessage,
} from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { auth } from '@/auth';
import { canUseBonsai, bonsaiDenied, paidModelDenied } from '@/lib/access';
import { fetchCloudModels } from '@/lib/modelCatalog';
import { parseModelRef } from '@/lib/modelRef';
import { FALLBACK_MODEL } from '@/lib/types';
import type { ModelSource } from '@/lib/storage';
import { handoffPrompt, splitSystemMessages } from '@/lib/handoff';
import { omnirouteEndpoint } from '@/lib/omniroute';

export const maxDuration = 300;

export const SUMMARY_PROMPT =
  'Summarize this conversation for continuing in a fresh session. Detail: goals, key decisions made, files touched or modified, and pending open tasks. Keep concise. Do not use em-dashes.';

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
      const endpoint = omnirouteEndpoint();
      if (!endpoint) {
        throw new Error('OmniRoute is not configured (no OMNIROUTE_BASE_URL, and no BONSAI_BASE_URL for the home gateway).');
      }
      omniroute = createOpenAICompatible({ name: 'omniroute', ...endpoint });
    }
    return omniroute(model);
  }
  return model;
}

const MAX_HISTORY_TOOL_OUTPUT = 1500;

function compactHistory(messages: UIMessage[]): UIMessage[] {
  let lastUser = -1;
  messages.forEach((m, i) => {
    if (m.role === 'user') lastUser = i;
  });
  return messages.map((message, i) => {
    if (i >= lastUser || message.role !== 'assistant') return message;
    let changed = false;
    const parts = message.parts.map((part) => {
      const p = part as { type: string; state?: string; output?: unknown };
      const isTool = p.type.startsWith('tool-') || p.type === 'dynamic-tool';
      if (!isTool || p.state !== 'output-available' || p.type === 'tool-editImage') return part;
      if (JSON.stringify(p.output ?? null).length <= MAX_HISTORY_TOOL_OUTPUT) return part;
      changed = true;
      return {
        ...part,
        output: { omitted: 'Large result from an earlier turn, left out to save context. Call the tool again if you need it.' },
      } as typeof part;
    });
    return changed ? { ...message, parts } : message;
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      messages?: UIMessage[];
      model?: string;
      modelSource?: ModelSource;
    };
    const { messages = [], model, modelSource } = body;

    const modelRef = parseModelRef(model || FALLBACK_MODEL, modelSource || 'gateway');

    const session = await auth();
    if (modelRef.source === 'bonsai' && !canUseBonsai(session)) {
      return bonsaiDenied(session);
    }
    if (modelRef.source === 'hermes') {
      // Hermes is an agent with tools: sending it a transcript would run a full agent turn
      // and write into its memory. It compresses its own context, so there is nothing to do.
      return Response.json(
        { error: 'Hermes manages its own context, so it does not need a summary.' },
        { status: 400 }
      );
    }
    if (modelRef.source !== 'bonsai') {
      const denied = await paidModelDenied(session, modelRef.id, () => fetchCloudModels(modelRef.source));
      if (denied) return denied;
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ summary: '' });
    }

    // An earlier hand-off summary is context for this one, not a message the SDK will accept.
    const { system: earlier, rest } = splitSystemMessages(messages);
    if (rest.length === 0) return Response.json({ summary: earlier });
    const modelMessages = await convertToModelMessages(compactHistory(rest));

    const result = await generateText({
      model: resolveModel(modelRef.id, modelRef.source),
      system: SUMMARY_PROMPT + handoffPrompt(earlier, 6000),
      messages: [
        ...modelMessages,
        {
          role: 'user',
          content: SUMMARY_PROMPT,
        },
      ],
    });

    return Response.json({ summary: result.text });
  } catch {
    // Upstream errors can name internal hosts; the client only needs to know it failed.
    return Response.json({ error: 'Could not summarize this chat.' }, { status: 500 });
  }
}
