import workflow from './comfy/qwen_edit.api.json';
import map from './comfy/qwen_edit.map.json';
import { createComfyClient, ComfyError, type Workflow, type WorkflowMap } from './comfy-client';

export { ComfyError, isJobId } from './comfy-client';
export type { JobState } from './comfy-client';

let client: ReturnType<typeof createComfyClient> | null = null;

/** Lazy singleton wired to COMFYUI_BASE_URL / COMFYUI_API_KEY (the ARO gateway). */
export function comfy() {
  if (!client) {
    const baseUrl = process.env.COMFYUI_BASE_URL;
    if (!baseUrl) throw new ComfyError('unavailable', 'Image editing is not configured (COMFYUI_BASE_URL missing).');
    client = createComfyClient({
      baseUrl,
      apiKey: process.env.COMFYUI_API_KEY,
      workflow: workflow as unknown as Workflow,
      map: map as unknown as WorkflowMap,
    });
  }
  return client;
}

/** Message safe to show the user (and the model) for any failure. */
export function friendlyComfyError(err: unknown): string {
  if (err instanceof ComfyError) return err.message;
  return 'Image editing failed unexpectedly.';
}
