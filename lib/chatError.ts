import { APICallError, RetryError } from 'ai';

/**
 * The chat's message when a cloud model fails mid-stream. Every failure used to read
 * "Something went wrong", so a model whose provider was down looked like a bug in ARO.
 * Allow-listed users see the provider's own reason: it is the owner's OmniRoute server or
 * Gateway account, and the reason says what to fix there. Everyone else gets the same sentence
 * without it, so provider details stay private. ChatPanel shows messages with "could not run".
 */
export function modelErrorMessage(err: unknown, sourceName: string, modelId: string, showReason: boolean): string {
  // A 5xx is retried, then arrives wrapped; the last attempt holds the provider's answer.
  const cause = RetryError.isInstance(err) ? err.lastError : err;
  if (!APICallError.isInstance(cause)) return 'Something went wrong. Try again.';
  let reason = showReason ? cause.message.replace(/^\[\d+\]:\s*/, '').replace(/[\s.]+$/, '') : '';
  if (reason.length > 240) reason = `${reason.slice(0, 240).trimEnd()}…`;
  return `${sourceName} could not run ${modelId}: ${reason || 'its provider is unavailable right now'}. Pick another model.`;
}
