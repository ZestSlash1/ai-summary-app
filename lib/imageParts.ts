/**
 * Pull the image a user attached to their latest message out of an AI SDK UIMessage list.
 * The browser sends attachments as file parts whose url is a data: URL.
 */

export type ExtractedImage = { data: Uint8Array; mediaType: string };

type PartLike = { type: string; url?: string; mediaType?: string };
type MessageLike = { role: string; parts: PartLike[] };

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
/** Larger than a working-size upload needs, and well under serverless body limits. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function parseImageDataUrl(url: string): ExtractedImage | null {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(url);
  if (!m) return null;
  const mediaType = m[1].toLowerCase();
  if (!ALLOWED.has(mediaType)) return null;
  // base64 length bounds the decoded size, so reject before allocating.
  if (Math.floor((m[2].length * 3) / 4) > MAX_IMAGE_BYTES) return null;
  const data = Uint8Array.from(Buffer.from(m[2], 'base64'));
  if (data.length === 0 || data.length > MAX_IMAGE_BYTES) return null;
  return { data, mediaType };
}

/**
 * Ollama models that take a picture as input. Any other Ollama model answers a request that
 * carries an image with a 400 ("does not support multimodal requests"), whatever the image is for.
 */
const OLLAMA_VISION = /gemma3(?!:1b)|llava|vision|minicpm-v|moondream|qwen[\d.]*-?vl/i;

/** False when sending this model an image would make the whole request fail. */
export function canSeeImages(source: string, modelId: string): boolean {
  return source !== 'ollama' || OLLAMA_VISION.test(modelId);
}

/**
 * Replace each image part with a short note, for a model that cannot take images. The edit tool
 * reads the picture from the request on the server, so the model only has to know one is there.
 */
export function imagesAsNotes<M extends { parts: unknown[] }>(messages: M[]): M[] {
  return messages.map((message) => {
    let changed = false;
    const parts = message.parts.map((part) => {
      const p = part as PartLike & { filename?: string };
      if (p.type !== 'file' || !p.mediaType?.startsWith('image/')) return part;
      changed = true;
      return { type: 'text', text: `[Image attached${p.filename ? `: ${p.filename}` : ''}. You cannot see images.]` };
    });
    return changed ? ({ ...message, parts } as M) : message;
  });
}

/** The last image on the most recent user message, or null when there is none. */
export function extractLatestImage(messages: MessageLike[]): ExtractedImage | null {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return null;
  for (const part of [...last.parts].reverse()) {
    if (part.type === 'file' && part.url && part.mediaType?.startsWith('image/')) {
      const parsed = parseImageDataUrl(part.url);
      if (parsed) return parsed;
    }
  }
  return null;
}
