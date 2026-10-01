import test from 'node:test';
import assert from 'node:assert/strict';
import { APICallError, RetryError } from 'ai';
import { modelErrorMessage } from '../../lib/chatError.ts';

const refused = (statusCode, message) =>
  new APICallError({ message, statusCode, url: 'http://omniroute/v1/chat/completions', requestBodyValues: {} });

test('allow-listed users see the provider reason, without its status prefix', () => {
  const err = refused(403, "[403]: Error from provider (Console): OpenCode's free tier can only be used from within OpenCode.");
  assert.equal(
    modelErrorMessage(err, 'OmniRoute', 'oc/mimo-v2.5-free', true),
    "OmniRoute could not run oc/mimo-v2.5-free: Error from provider (Console): OpenCode's free tier can only be used from within OpenCode. Pick another model.",
  );
});

test('everyone else gets the model named but not the provider reason', () => {
  const err = refused(401, '[401]: Missing API key.');
  const text = modelErrorMessage(err, 'OmniRoute', 'oc/claude-fable-5', false);
  assert.equal(text, 'OmniRoute could not run oc/claude-fable-5: its provider is unavailable right now. Pick another model.');
  assert.doesNotMatch(text, /API key/);
});

test('a retried 5xx reads its last attempt', () => {
  const err = new RetryError({
    message: 'Failed after 3 attempts.',
    reason: 'maxRetriesExceeded',
    errors: [refused(503, 'first'), refused(503, 'Service temporarily unavailable: all upstream accounts are inactive')],
  });
  assert.match(modelErrorMessage(err, 'OmniRoute', 'free-stack', true), /could not run free-stack: Service temporarily unavailable: all upstream accounts are inactive\. /);
});

test('long reasons are cut short', () => {
  const text = modelErrorMessage(refused(400, `[400]: ${'x'.repeat(500)}`), 'AI Gateway', 'openai/gpt-5', true);
  assert.ok(text.length < 320);
  assert.match(text, /…\. Pick another model\.$/);
});

test('errors that are not a provider answer stay generic', () => {
  assert.equal(modelErrorMessage(new Error('boom'), 'OmniRoute', 'auto/best-free', true), 'Something went wrong. Try again.');
  assert.equal(modelErrorMessage('boom', 'OmniRoute', 'auto/best-free', true), 'Something went wrong. Try again.');
});
