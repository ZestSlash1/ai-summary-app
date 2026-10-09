import test from 'node:test';
import assert from 'node:assert/strict';
import { isOmniRouteChatModel, omnirouteEndpoint } from '../../lib/omniroute.ts';

const GATEWAY = { BONSAI_BASE_URL: 'https://home.example.ts.net/v1', BONSAI_API_KEY: 'gateway-token' };

test('the deployed site goes through the home gateway with the gateway token', () => {
  assert.deepEqual(omnirouteEndpoint(GATEWAY), {
    baseURL: 'https://home.example.ts.net/omniroute/v1',
    apiKey: 'gateway-token',
  });
});

test('an OmniRoute key is never sent to the gateway', () => {
  // Vercel still holds an OMNIROUTE_API_KEY from the old direct setup; the gateway would refuse it.
  assert.equal(omnirouteEndpoint({ ...GATEWAY, OMNIROUTE_API_KEY: 'omniroute-key' }).apiKey, 'gateway-token');
});

test('OMNIROUTE_BASE_URL talks to OmniRoute directly, with its own key', () => {
  assert.deepEqual(
    omnirouteEndpoint({ ...GATEWAY, OMNIROUTE_BASE_URL: 'http://localhost:20128/v1/', OMNIROUTE_API_KEY: 'omniroute-key' }),
    { baseURL: 'http://localhost:20128/v1', apiKey: 'omniroute-key' },
  );
  assert.deepEqual(omnirouteEndpoint({ OMNIROUTE_BASE_URL: 'http://localhost:20128/v1' }), {
    baseURL: 'http://localhost:20128/v1',
    apiKey: undefined,
  });
});

test('an empty OMNIROUTE_BASE_URL counts as unset', () => {
  assert.equal(omnirouteEndpoint({ ...GATEWAY, OMNIROUTE_BASE_URL: '' }).baseURL, 'https://home.example.ts.net/omniroute/v1');
});

test('nothing configured means no OmniRoute', () => {
  assert.equal(omnirouteEndpoint({}), null);
});

test('the picker keeps chat models and drops image, video, audio, and embedding ones', () => {
  const catalog = [
    { id: 'gemini/gemini-3.5-flash' },
    { id: 'auto/best-free', type: 'chat' },
    { id: 'aihorde/2DN', type: 'image' },
    { id: 'veo-free/veo', type: 'video' },
    { id: 'gemini/gemini-embedding-2', type: 'embedding' },
    { id: 'gemini/gemini-3.1-flash-tts-preview', type: 'audio' },
    { id: 'x/rerank', type: 'rerank' },
    { id: 'x/guard', type: 'moderation' },
  ];
  assert.deepEqual(catalog.filter(isOmniRouteChatModel).map((m) => m.id), ['gemini/gemini-3.5-flash', 'auto/best-free']);
});
