import workflow from './comfy/qwen_edit.api.json';
import map from './comfy/qwen_edit.map.json';
import createWorkflow from './comfy/qwen_create.api.json';
import createMap from './comfy/qwen_create.map.json';
import { createComfyClient, ComfyError, type CreateMap, type Workflow, type WorkflowMap } from './comfy-client';

export { ComfyError, isJobId } from './comfy-client';
export type { JobState, Aspect } from './comfy-client';

let client: ReturnType<typeof createComfyClient> | null = null;

/** Lazy singleton wired to COMFYUI_BASE_URL / COMFYUI_API_KEY (the ARO gateway). */
export function comfy() {
  if (!client) {
    const baseUrl = process.env.COMFYUI_BASE_URL;
    if (!baseUrl) throw new ComfyError('unavailable', 'Images are not configured (COMFYUI_BASE_URL missing).');
    client = createComfyClient({
      baseUrl,
      apiKey: process.env.COMFYUI_API_KEY,
      workflow: workflow as unknown as Workflow,
      map: map as unknown as WorkflowMap,
      create: { workflow: createWorkflow as unknown as Workflow, map: createMap as unknown as CreateMap },
    });
  }
  return client;
}

/** Message safe to show the user (and the model) for any failure. */
export function friendlyComfyError(err: unknown): string {
  if (err instanceof ComfyError) return err.message;
  return 'The image server failed unexpectedly.';
}
