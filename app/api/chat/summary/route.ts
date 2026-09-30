import {
  generateText,
  convertToModelMessages,
  type UIMessage,
} from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { auth } from '@/auth';
import { canUseBonsai, bonsaiDenied } from '@/lib/access';
import { hermesEndpoint } from '@/lib/hermes';
import { parseModelRef } from '@/lib/modelRef';
import { FALLBACK_MODEL } from '@/lib/types';
import type { ModelSource } from '@/lib/storage';

export const maxDuration = 300;

export const SUMMARY_PROMPT =
  'Summarize this conversation for continuing in a fresh session. Detail: goals, key decisions made, files touched or modified, and pending open tasks. Keep concise. Do not use em-dashes.';

let omniroute: ReturnType<typeof createOpenAICompatible> | null = null;
let bonsai: ReturnType<typeof createOpenAICompatible> | null = null;
let hermes: ReturnType<typeof createOpenAICompatible> | null = null;

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
  if (source === 'hermes') {
    const endpoint = hermesEndpoint();
    if (!endpoint) {
      throw new Error('Hermes is not configured.');
    }
    if (!hermes) {
      hermes = createOpenAICompatible({
        name: 'hermes',
        baseURL: `${endpoint.base}/v1`,
        apiKey: endpoint.token,
      });
    }
    return hermes(model || 'hermes-agent');
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
    if (modelRef.source === 'hermes' && (!canUseBonsai(session) || !session?.githubUserId)) {
      return bonsaiDenied(session, 'Hermes');
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ summary: '' });
    }

    const modelMessages = await convertToModelMessages(compactHistory(messages));

    const result = await generateText({
      model: resolveModel(modelRef.id, modelRef.source),
      system: SUMMARY_PROMPT,
      messages: [
        ...modelMessages,
        {
          role: 'user',
          content: SUMMARY_PROMPT,
        },
      ],
    });

    return Response.json({ summary: result.text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate summary.';
    return Response.json({ error: message }, { status: 500 });
  }
}
