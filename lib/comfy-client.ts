/**
 * ComfyUI client for image editing. Talks to ComfyUI through the ARO gateway, so every
 * path used here is on the gateway's allowlist. Stateless: the job id is ComfyUI's own
 * prompt id, and job state is read back from ComfyUI's history and queue.
 *
 * Kept free of Next.js and JSON imports so it can be unit tested; lib/comfy.ts wires it up.
 */

export type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export type WorkflowMap = {
  inputImage: { node: string; field: string };
  prompt: { node: string; field: string };
  seed: { node: string; field: string };
  megapixels: { node: string; field: string };
  output: { node: string };
};

/** Where the text-to-image workflow takes its inputs. Same idea as WorkflowMap, minus the input image. */
export type CreateMap = {
  prompt: { node: string; field: string };
  seed: { node: string; field: string };
  width: { node: string; field: string };
  height: { node: string; field: string };
  output: { node: string };
};

/** Picture shapes the create tool offers, as [width, height]. Multiples of 16, about 0.8 megapixels. */
export const ASPECTS = {
  square: [896, 896],
  landscape: [1088, 768],
  portrait: [768, 1088],
} as const;
export type Aspect = keyof typeof ASPECTS;

export type ImageRef = { filename: string; subfolder: string; type: string };

export type JobState =
  | { status: 'queued' }
  | { status: 'running' }
  | { status: 'done'; image: ImageRef }
  | { status: 'error'; message: string }
  | { status: 'unknown' };

// ComfyUI's responses are loosely shaped. Everything read from them is checked before use.
type Json = { [key: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type ComfyErrorCode = 'busy' | 'unavailable' | 'rejected';

export class ComfyError extends Error {
  code: ComfyErrorCode;

  constructor(code: ComfyErrorCode, message: string) {
    super(message);
    this.name = 'ComfyError';
    this.code = code;
  }
}

export type ComfyClientOptions = {
  baseUrl: string;
  apiKey?: string;
  workflow: Workflow;
  map: WorkflowMap;
  /** Text-to-image workflow. Without it, startCreate refuses. */
  create?: { workflow: Workflow; map: CreateMap };
  /** Default working size in megapixels. */
  megapixels?: number;
};

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const JOB_ID = /^[A-Za-z0-9-]{8,64}$/;
// Names ComfyUI hands back. Anything odd is refused before it reaches a URL.
const SAFE_FILE = /^[\w][\w .()-]{0,199}$/;
const SAFE_SUBFOLDER = /^[\w][\w .()/-]{0,199}$/;

export function isJobId(id: string): boolean {
  return JOB_ID.test(id);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function createComfyClient(opts: ComfyClientOptions) {
  const base = opts.baseUrl.replace(/\/$/, '');

  async function req(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
    try {
      return await fetch(base + path, {
        ...init,
        cache: 'no-store',
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ComfyError('unavailable', 'The image server is offline or not responding.');
    }
  }

  /** Parsed JSON body as a loose object, or an empty object when the body is not JSON. */
  async function readJson(res: Response): Promise<Json> {
    try {
      const body: unknown = await res.json();
      return body && typeof body === 'object' ? (body as Json) : {};
    } catch {
      return {};
    }
  }

  function patchWorkflow(uploadedName: string, instruction: string, seed: number, megapixels: number): Workflow {
    const wf = structuredClone(opts.workflow);
    const set = (target: { node: string; field: string }, value: unknown) => {
      const node = wf[target.node];
      if (!node) throw new ComfyError('rejected', `Workflow is missing node ${target.node}.`);
      node.inputs[target.field] = value;
    };
    set(opts.map.inputImage, uploadedName);
    set(opts.map.prompt, instruction);
    set(opts.map.seed, seed);
    set(opts.map.megapixels, megapixels);
    return wf;
  }

  async function startEdit(input: {
    instruction: string;
    image: { data: Uint8Array; mediaType: string };
    seed?: number;
    megapixels?: number;
  }): Promise<{ jobId: string }> {
    const ext = EXT[input.image.mediaType];
    if (!ext) throw new ComfyError('rejected', 'Only PNG, JPEG and WebP images are supported.');
    const instruction = input.instruction.trim();
    if (!instruction) throw new ComfyError('rejected', 'The edit instruction is empty.');

    const form = new FormData();
    form.append(
      'image',
      new Blob([input.image.data as BlobPart], { type: input.image.mediaType }),
      `aro_${crypto.randomUUID()}.${ext}`,
    );
    const up = await req('/upload/image', { method: 'POST', body: form }, 30_000);
    const upBody = await readJson(up);
    if (!up.ok || !upBody?.name) throw new ComfyError('unavailable', 'Could not send the image to the image server.');
    const uploadedName = upBody.subfolder ? `${upBody.subfolder}/${upBody.name}` : upBody.name;

    const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
    const megapixels = clamp(input.megapixels ?? opts.megapixels ?? 0.5, 0.25, 1.0);
    const prompt = patchWorkflow(uploadedName, instruction, seed, megapixels);
    return queuePrompt(prompt, 'edit');
  }

  /** Make a picture from text alone, with the create workflow. */
  async function startCreate(input: { prompt: string; aspect?: Aspect; seed?: number }): Promise<{ jobId: string }> {
    if (!opts.create) throw new ComfyError('unavailable', 'Image creation is not set up on the image server.');
    const text = input.prompt.trim();
    if (!text) throw new ComfyError('rejected', 'The image description is empty.');
    const [width, height] = ASPECTS[input.aspect && input.aspect in ASPECTS ? input.aspect : 'square'];
    const { workflow, map } = opts.create;
    const wf = structuredClone(workflow);
    const set = (target: { node: string; field: string }, value: unknown) => {
      const node = wf[target.node];
      if (!node) throw new ComfyError('rejected', `Workflow is missing node ${target.node}.`);
      node.inputs[target.field] = value;
    };
    set(map.prompt, text);
    set(map.seed, input.seed ?? Math.floor(Math.random() * 2 ** 31));
    set(map.width, width);
    set(map.height, height);
    return queuePrompt(wf, 'creation');
  }

  /** Send a ready workflow to ComfyUI and map every refusal to a message safe to show. */
  async function queuePrompt(prompt: Workflow, what: 'edit' | 'creation'): Promise<{ jobId: string }> {
    // The gateway may hold this request while Bonsai releases the GPU, so allow it time.
    const res = await req(
      '/prompt',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, client_id: 'aro' }),
      },
      50_000,
    );
    const body = await readJson(res);
    if (res.status === 503) {
      const type = body?.error?.type;
      if (type === 'gpu_busy') throw new ComfyError('busy', 'The GPU is busy right now. Try again in a moment.');
      throw new ComfyError('unavailable', `The GPU is not ready for image ${what === 'edit' ? 'editing' : 'creation'} yet. Try again shortly.`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new ComfyError('unavailable', 'The image server rejected this app\'s credentials.');
    }
    if (res.status === 400) {
      throw new ComfyError('rejected', body?.error?.message ?? 'The image server rejected the workflow.');
    }
    if (!res.ok || !body?.prompt_id) {
      throw new ComfyError('unavailable', `The image server could not start the ${what === 'edit' ? 'edit' : 'image'}.`);
    }
    return { jobId: String(body.prompt_id) };
  }

  function fromHistory(entry: Json): JobState {
    const statusStr = entry?.status?.status_str;
    if (statusStr === 'error') {
      const msgs: unknown[] = entry?.status?.messages ?? [];
      const fail = msgs.find((m) => Array.isArray(m) && m[0] === 'execution_error') as unknown[] | undefined;
      const detail = (fail?.[1] as Json | undefined)?.exception_message;
      return { status: 'error', message: typeof detail === 'string' ? detail.split('\n')[0].slice(0, 300) : 'The edit failed.' };
    }
    // A job came from the edit or the create workflow, whose save nodes have different ids.
    const outputNodes = [opts.map.output.node, ...(opts.create ? [opts.create.map.output.node] : [])];
    const img = outputNodes.map((node) => entry?.outputs?.[node]?.images?.[0]).find(Boolean);
    if (statusStr === 'success' && img && SAFE_FILE.test(img.filename ?? '')) {
      const subfolder = img.subfolder ?? '';
      if (subfolder && !SAFE_SUBFOLDER.test(subfolder)) return { status: 'error', message: 'Unexpected output location.' };
      return { status: 'done', image: { filename: img.filename, subfolder, type: img.type === 'temp' ? 'temp' : 'output' } };
    }
    if (statusStr === 'success') return { status: 'error', message: 'The edit finished without producing an image.' };
    return { status: 'running' };
  }

  async function getJob(jobId: string): Promise<JobState> {
    if (!isJobId(jobId)) throw new ComfyError('rejected', 'Invalid job id.');

    const h = await req(`/history/${jobId}`, {}, 10_000);
    if (h.ok) {
      const entry = (await readJson(h))?.[jobId];
      if (entry) return fromHistory(entry);
    }

    const q = await req('/queue', {}, 10_000);
    if (q.ok) {
      const body = await readJson(q);
      const has = (list: unknown) => Array.isArray(list) && list.some((x) => Array.isArray(x) && x[1] === jobId);
      if (has(body?.queue_running)) return { status: 'running' };
      if (has(body?.queue_pending)) return { status: 'queued' };
    }
    return { status: 'unknown' };
  }

  /** The finished image as a stream, or null when the job is not done. */
  async function fetchImage(jobId: string): Promise<{ body: ReadableStream<Uint8Array>; contentType: string } | null> {
    const state = await getJob(jobId);
    if (state.status !== 'done') return null;
    const { filename, subfolder, type } = state.image;
    const qs = new URLSearchParams({ filename, subfolder, type });
    const res = await req(`/view?${qs}`, {}, 30_000);
    if (!res.ok || !res.body) return null;
    return { body: res.body, contentType: res.headers.get('content-type') ?? 'image/png' };
  }

  return { startEdit, startCreate, getJob, fetchImage };
}
