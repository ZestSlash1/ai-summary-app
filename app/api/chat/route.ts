import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  hasToolCall,
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
import { FALLBACK_MODEL, type AgentOptions } from '@/lib/types';
import { safeEvaluate } from '@/lib/calc';
import { canUseBonsai, bonsaiDenied } from '@/lib/access';
import { comfy, friendlyComfyError } from '@/lib/comfy';
import { extractLatestImage } from '@/lib/imageParts';
import { createRepoTools, repoSystemPrompt } from '@/lib/repoTools';
import { isSupabaseConfigured } from '@/lib/supabase';
import { isPublicHttpUrl } from '@/lib/safeUrl';
import { mergeMcpToolSets } from '@/lib/mcp';
import { hermesChatResponse } from '@/lib/hermesChat';
import { omnirouteEndpoint } from '@/lib/omniroute';
import { pruneOldTurns } from '@/lib/historyPruning';
import { PROMPT_OVERHEAD_TOKENS, estimateConversationTokens, getModelContextLimit } from '@/lib/tokenEstimate';
import { fetchBonsaiContext } from '@/lib/bonsaiContext';
import { handoffPrompt, splitSystemMessages } from '@/lib/handoff';
import { parseModelRef, toModelRef, SOURCE_INFO } from '@/lib/modelRef';
import { modelErrorMessage } from '@/lib/chatError';

// Bonsai answers at about 33 tokens a second and a repo question takes several tool steps,
// so give a turn the full five minutes Vercel allows on every plan (Fluid compute).
export const maxDuration = 300;

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

Only add a path when the code is meant to be saved as a real file in the user's project -- short illustrative snippets don't need one. Use tools when they give a more accurate answer than reasoning alone. Only mention capabilities you actually have.`;

type McpConnectorInput = { name?: string; url: string; authHeader?: string };
type GithubRepoInput = { owner: string; name: string; branch: string };
type ModelSource = 'gateway' | 'omniroute' | 'bonsai' | 'ollama' | 'hermes';

let omniroute: ReturnType<typeof createOpenAICompatible> | null = null;
let bonsai: ReturnType<typeof createOpenAICompatible> | null = null;
let ollama: ReturnType<typeof createOpenAICompatible> | null = null;

function resolveModel(model: string, source: ModelSource | undefined) {
  if (source === 'ollama') {
    if (!ollama) {
      const baseURL = process.env.OLLAMA_BASE_URL;
      if (!baseURL) {
        throw new Error('Ollama is not configured (OLLAMA_BASE_URL missing).');
      }
      ollama = createOpenAICompatible({
        name: 'ollama',
        baseURL,
        apiKey: process.env.OLLAMA_API_KEY,
      });
    }
    return ollama(model);
  }
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

// Tool results from earlier turns (a whole file, a long listing) are re-sent with every
// message. Past this size they are replaced with a note: the model can call the tool again,
// and a 32k-context model like Bonsai does not run out of room halfway through a chat.
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
      if (!isTool || p.state !== 'output-available' || p.type === 'tool-editImage' || p.type === 'tool-createImage') return part;
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

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string }).text)
    .join('\n\n');
}

export async function POST(request: Request) {
  const {
    id: chatId,
    messages,
    model,
    modelSource,
    mcpConnectors,
    githubRepo,
    plan,
    skills,
    agentOptions,
    customInstructions,
  }: {
    id?: string;
    messages: UIMessage[];
    model?: string;
    modelSource?: ModelSource;
    mcpConnectors?: McpConnectorInput[];
    githubRepo?: GithubRepoInput;
    plan?: boolean;
    skills?: { name: string; description: string; body?: string; skillMd?: string; enabled?: boolean }[];
    agentOptions?: AgentOptions;
    customInstructions?: string;
  } = await request.json();

  const session = await auth();
  // Bonsai is the owner's home GPU: refuse before doing any other work.
  if (modelSource === 'bonsai' && !canUseBonsai(session)) return bonsaiDenied(session);
  // Ollama runs on the same PC and GPU, so it follows the same allow list.
  if (modelSource === 'ollama' && !canUseBonsai(session)) return bonsaiDenied(session, 'Ollama');
  const userId = session?.githubUserId;

  // Hermes runs real commands on the owner's PC: same allow list as Bonsai, and it keeps its
  // own tools, memory, and transcript, so the turn is handed over whole.
  if (modelSource === 'hermes') {
    if (!canUseBonsai(session) || !userId) return bonsaiDenied(session, 'Hermes');
    return hermesChatResponse({
      messages,
      chatId,
      model,
      githubUserId: userId,
      repo: githubRepo,
      plan,
      signal: request.signal,
      agentOptions,
      customInstructions,
    });
  }
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const lastUserText = lastUserMessage ? textOf(lastUserMessage) : '';

  // Only public addresses: the server must not be steered at internal hosts.
  const connectors = (mcpConnectors ?? []).filter((c) => isPublicHttpUrl(c.url));
  const mcpClients = await Promise.all(
    connectors.map((connector) =>
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

  // Image editing runs on the owner's home GPU, so it is offered only to allow-listed
  // users, and only when the latest message actually carries an image to edit.
  const homeAllowed = canUseBonsai(session);
  const attachedImage = homeAllowed ? extractLatestImage(messages) : null;
  const imageTools: ToolSet = attachedImage
    ? {
        editImage: tool({
          description:
            'Edit the image the user attached, following a plain-language instruction. ' +
            'Starts an edit job that takes a couple of minutes. The result appears in the chat by itself.',
          inputSchema: z.object({
            instruction: z
              .string()
              .min(3)
              .max(800)
              .describe('What to change, for example "make the sky overcast". Describe only the change.'),
          }),
          execute: async ({ instruction }) => {
            try {
              const { jobId } = await comfy().startEdit({ instruction, image: attachedImage });
              return { jobId, status: 'queued' as const };
            } catch (err) {
              return { error: friendlyComfyError(err) };
            }
          },
        }),
      }
    : {};

  // Any model can ask for a picture, even one that cannot see or make images itself: this tool
  // only hands a description to ComfyUI on the home GPU. Offered to the same allow list as edits.
  // One picture per reply: a model that calls it twice would start two GPU jobs for one request.
  let pictureStarted = false;
  const createTools: ToolSet = homeAllowed
    ? {
        createImage: tool({
          description:
            'Create a new picture from a written description, with the image generator on the home GPU. ' +
            'Starts a job that takes a minute or two. The result appears in the chat by itself, so do not describe it.',
          inputSchema: z.object({
            prompt: z
              .string()
              .min(3)
              .max(1200)
              .describe(
                'A vivid description of the picture: the subject, the setting, the style, the light and the mood. Write it in English.',
              ),
            aspect: z
              .enum(['square', 'landscape', 'portrait'])
              .optional()
              .describe('The shape of the picture. Defaults to square.'),
          }),
          execute: async ({ prompt, aspect }) => {
            if (pictureStarted) return { skipped: true as const };
            pictureStarted = true;
            try {
              const { jobId } = await comfy().startCreate({ prompt, aspect });
              return { jobId, status: 'queued' as const };
            } catch (err) {
              pictureStarted = false;
              return { error: friendlyComfyError(err) };
            }
          },
        }),
      }
    : {};

  // The linked repo is read with the user's own GitHub token, so it sees exactly what they can.
  const githubToken = session?.githubAccessToken;
  const repoTools: ToolSet =
    githubRepo && githubToken ? createRepoTools(githubToken, githubRepo) : {};

  // Skills come from the browser and their text lands in the system prompt, so they are cut down
  // to one-line names and descriptions, a bounded count, and a bounded body. A skill written by a
  // stranger cannot then add lines of its own to the index or bury the real instructions.
  const oneLine = (value: unknown, max: number) =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  const enabledSkills = (Array.isArray(skills) ? skills : [])
    .filter((s) => s && s.enabled !== false)
    .slice(0, 20)
    .map((s) => ({
      name: oneLine(s.name, 80),
      description: oneLine(s.description, 300),
      body: typeof s.body === 'string' ? s.body.slice(0, 60_000) : undefined,
      skillMd: typeof s.skillMd === 'string' ? s.skillMd.slice(0, 60_000) : undefined,
    }))
    .filter((s) => s.name);
  const skillTools: ToolSet =
    enabledSkills.length > 0
      ? {
          loadSkill: tool({
            description:
              'Load the complete instructions and workflow for an available skill by name.',
            inputSchema: z.object({
              name: z
                .string()
                .describe('The exact name of the skill to load, from the available skills list.'),
            }),
            execute: async ({ name }) => {
              const match = enabledSkills.find(
                (s) => s.name.toLowerCase() === name.trim().toLowerCase()
              );
              if (!match) return { error: `Skill "${name}" not found.` };
              let body = match.body;
              if (!body && match.skillMd) {
                const m = match.skillMd.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
                body = m ? m[1].trim() : match.skillMd.trim();
              }
              return { name: match.name, instructions: body || match.description };
            },
          }),
        }
      : {};

  const toolToggles = agentOptions?.tools;
  const isReadonly = agentOptions?.permission === 'readonly';

  const mcpToolsFiltered =
    toolToggles?.web !== false
      ? mergeMcpToolSets(mcpToolSets.map((tools, i) => ({ name: connectors[i].name, tools: tools ?? {} })))
      : {};
  const builtinToolsFiltered = toolToggles?.calculate !== false ? builtinTools : {};
  const imageToolsFiltered = !isReadonly && toolToggles?.imageEdit !== false ? imageTools : {};
  const createToolsFiltered = !isReadonly && toolToggles?.imageCreate !== false ? createTools : {};
  const repoToolsFiltered = toolToggles?.repo !== false ? repoTools : {};

  // First-party tools go last so an MCP server cannot shadow one by reusing its name.
  const tools: ToolSet = Object.assign(
    {},
    mcpToolsFiltered,
    builtinToolsFiltered,
    imageToolsFiltered,
    createToolsFiltered,
    repoToolsFiltered,
    skillTools
  );

  let systemPrompt = BASE_SYSTEM_PROMPT;
  if (enabledSkills.length > 0) {
    systemPrompt += `\n\nAvailable skills (call loadSkill to view instructions when relevant):\n${enabledSkills
      .map((s) => `- ${s.name}: ${s.description}`)
      .join('\n')}`;
  }
  const effectiveCustom = agentOptions?.customInstructions?.trim() || customInstructions?.trim();
  if (effectiveCustom) {
    systemPrompt += `\n\nCustom instructions for this session:\n${effectiveCustom}`;
  }
  if (isReadonly) {
    systemPrompt += '\n\nPermission mode is read-only. Do not attempt to write, edit, or push files.';
  }
  // Say what is actually answering, so "are you Bonsai?" gets a true answer.
  const runtime =
    modelSource === 'bonsai'
      ? `Bonsai (model "${model || 'bonsai'}"), a local model running on the owner's home PC`
      : modelSource === 'ollama'
        ? `the model "${model || 'default'}" through Ollama, running locally on the owner's home PC`
      : modelSource === 'omniroute'
        ? `the model "${model || 'default'}" through the owner's OmniRoute server`
        : `the model "${model || 'default'}" through Vercel AI Gateway`;
  systemPrompt += `\n\nYou are running as ${runtime}. If asked which model or backend you are, say so plainly. ARO is the app, not the model.`;
  if (githubRepo) systemPrompt += repoSystemPrompt(githubRepo, Boolean(githubToken));
  if (plan) {
    systemPrompt +=
      '\n\nPlan mode is on. Start your answer with a short numbered plan (three to six steps) under a "Plan" heading, then carry it out.';
  }
  if (attachedImage) {
    systemPrompt +=
      '\n\nThe user attached an image. If they want it changed, call editImage once with a clear instruction. ' +
      'Do not describe the finished picture, it is shown to them automatically.';
  }
  if (tools.createImage) {
    systemPrompt +=
      '\n\nYou can make pictures. When the user asks you to draw, create, generate or imagine an image, call createImage exactly once ' +
      'with one vivid, specific description (subject, setting, style, light, mood), then add at most one short sentence. ' +
      'Never call it more than once for a request. Do not say you cannot make images, and do not describe the finished ' +
      'picture: it is shown to them automatically.';
  }

  // Project memory: recall relevant chunks from a connected repo, so the
  // assistant isn't starting cold each session.
  if (userId && githubRepo && lastUserText.trim() && isSupabaseConfigured()) {
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
  if (userId && isSupabaseConfigured()) {
    try {
      const { approved } = await getUserSkills(userId);
      if (approved.length > 0) {
        systemPrompt += `\n\nThis user has approved these learned skills (use them when relevant):\n${approved
          .map((s) => `- ${s.name}: ${s.description}`)
          .join('\n')}`;
      }
      if (lastUserText.trim() && !messageMatchesKnownSkill(lastUserText, approved)) {
        // Scheduled for after the response is sent -- this must never add
        // latency to the user-visible reply.
        after(() => logSignalAndMaybePropose(userId, lastUserText));
      }
    } catch {
      // Non-critical background bookkeeping.
    }
  }

  // This only fires when the client sent no model at all -- every normal
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

  const resolvedModelId = model || (await resolveDefaultModel());
  const parsedRef = parseModelRef(resolvedModelId, modelSource || 'gateway');
  const qualifiedModelRef = toModelRef(parsedRef.source, parsedRef.id);
  // Bonsai's window is whatever the home server was started with, so ask the gateway for it.
  const bonsaiContext = parsedRef.source === 'bonsai' ? await fetchBonsaiContext() : null;
  const contextLimit = getModelContextLimit(qualifiedModelRef, bonsaiContext);

  // A continued chat opens with a system-role hand-off summary. v7 rejects those in messages.
  const { system: handoffContext, rest: chatMessages } = splitSystemMessages(messages);
  systemPrompt += handoffPrompt(handoffContext);

  const fits = (list: UIMessage[]) =>
    estimateConversationTokens(list) + PROMPT_OVERHEAD_TOKENS + systemPrompt.length / 3.5 <= contextLimit * 0.9;
  let processedMessages = compactHistory(chatMessages);
  if (!fits(processedMessages)) {
    processedMessages = pruneOldTurns(processedMessages, 2);
    while (!fits(processedMessages) && processedMessages.length > 2) {
      const next = pruneOldTurns(processedMessages, 2);
      if (next.length >= processedMessages.length) break;
      processedMessages = next;
    }
  }

  // Effort only reaches models that take it. Sending Anthropic thinking to one that does not
  // (Claude 3 Haiku) is an API error that fails the whole message, and providers behind
  // Bonsai and OmniRoute ignore these keys, so for them the setting does nothing.
  const effort = agentOptions?.effort;
  const viaGateway = parsedRef.source === 'gateway';
  const takesAnthropicThinking = viaGateway && /^anthropic\/claude-(opus|sonnet)-4/.test(parsedRef.id);
  const takesOpenAIEffort = viaGateway && /^openai\/(o\d|gpt-5)/.test(parsedRef.id);
  let providerOptions: Record<string, Record<string, string | number | boolean | Record<string, string | number>>> | undefined;
  if (effort && takesAnthropicThinking) {
    providerOptions = {
      anthropic: {
        thinking: {
          type: 'enabled',
          budgetTokens: effort === 'high' ? 8192 : effort === 'medium' ? 4096 : 2048,
        },
      },
    };
  } else if (effort && takesOpenAIEffort) {
    providerOptions = { openai: { reasoningEffort: effort } };
  }

  const maxSteps = agentOptions?.maxSteps ?? 10;
  const stopWhenConditions = [stepCountIs(maxSteps)];
  if (tools.editImage) {
    stopWhenConditions.push(hasToolCall('editImage'));
  }
  if (tools.createImage) {
    stopWhenConditions.push(hasToolCall('createImage'));
  }

  const result = streamText({
    model: resolveModel(resolvedModelId, modelSource),
    system: systemPrompt,
    messages: await convertToModelMessages(processedMessages),
    tools,
    providerOptions,
    stopWhen: stopWhenConditions,
    onFinish: async () => {
      await Promise.all(mcpClients.map((client) => client?.close()));
    },
  });

  return result.toUIMessageStreamResponse({
    // By default the client only sees a generic error. Say so when the GPU is in use by an
    // image edit, and name the model when a cloud provider refuses it (with the provider's
    // reason for allow-listed users only). Bonsai stays generic: ChatPanel says to check the PC.
    onError: (err) => {
      if (/image edit is using the GPU|gpu_busy/i.test(err instanceof Error ? err.message : '')) {
        return 'An image edit is using the GPU. Try again in a minute.';
      }
      if (parsedRef.source === 'bonsai' || parsedRef.source === 'ollama') return 'Something went wrong. Try again.';
      return modelErrorMessage(err, SOURCE_INFO[parsedRef.source].name, parsedRef.id, canUseBonsai(session));
    },
  });
}
