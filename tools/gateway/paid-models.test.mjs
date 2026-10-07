import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { paidModelDenied } from '../../lib/access.ts';

const CATALOG = [
  { id: 'poolside/laguna-s-2.1-free', free: true },
  { id: 'openai/gpt-5', free: false },
];
const catalog = async () => CATALOG;
const OWNER = { githubUserId: '123' };
const STRANGER = { githubUserId: '999' };

test('allow-listed users may use paid models, without a catalog lookup', async () => {
  let looked = false;
  const denied = await paidModelDenied(OWNER, 'openai/gpt-5', async () => ((looked = true), CATALOG), '123');
  assert.equal(denied, null);
  assert.equal(looked, false);
});

test('everyone may use a model the catalog lists as free', async () => {
  assert.equal(await paidModelDenied(null, 'poolside/laguna-s-2.1-free', catalog, '123'), null);
  assert.equal(await paidModelDenied(STRANGER, 'poolside/laguna-s-2.1-free', catalog, '123'), null);
});

test('signed out and asking for a paid model: 401 with a way in', async () => {
  const denied = await paidModelDenied(null, 'openai/gpt-5', catalog, '123');
  assert.equal(denied.status, 401);
  const { error } = await denied.json();
  // ChatPanel's chatErrorText shows messages that mention signing in or not being allowed.
  assert.match(error, /sign in/i);
  assert.doesNotMatch(error, /—/);
});

test('signed in but not allow-listed: 403', async () => {
  const denied = await paidModelDenied(STRANGER, 'openai/gpt-5', catalog, '123');
  assert.equal(denied.status, 403);
  assert.match((await denied.json()).error, /not allowed/i);
});

test('an id the catalog does not list counts as paid', async () => {
  const denied = await paidModelDenied(null, 'made-up/free-model', catalog, '123');
  assert.equal(denied.status, 401);
});

test('the free flag comes from the catalog entry with that exact id', async () => {
  // A prefix of a free model's id is not that model.
  const denied = await paidModelDenied(null, 'poolside/laguna-s-2.1', catalog, '123');
  assert.equal(denied.status, 401);
});

test('fails closed when the allow list is missing', async () => {
  const denied = await paidModelDenied(OWNER, 'openai/gpt-5', catalog, undefined);
  assert.equal(denied.status, 403);
});

test('fails closed with a 503 when the catalog cannot be read', async () => {
  const denied = await paidModelDenied(null, 'poolside/laguna-s-2.1-free', async () => {
    throw new Error('gateway down');
  }, '123');
  assert.equal(denied.status, 503);
  assert.doesNotMatch((await denied.json()).error, /gateway down/);
});

test('the chat route refuses paid models before opening MCP clients or calling a model', () => {
  const content = fs.readFileSync(path.resolve('app/api/chat/route.ts'), 'utf-8');
  const check = content.indexOf('paidModelDenied(session, resolvedModelId');
  assert.ok(check > 0, 'Expected the chat route to check the resolved model');
  assert.ok(check < content.indexOf('createMCPClient({'), 'Expected the check before MCP clients open');
  assert.ok(check < content.indexOf('streamText({'), 'Expected the check before the model call');
  // The catalog checked must be the one resolveModel sends to: OmniRoute or AI Gateway by modelSource.
  assert.match(content, /fetchCloudModels\(modelSource\)/);
});

test('the summary route refuses paid models before calling a model', () => {
  const content = fs.readFileSync(path.resolve('app/api/chat/summary/route.ts'), 'utf-8');
  const check = content.indexOf('paidModelDenied(session, modelRef.id');
  assert.ok(check > 0, 'Expected the summary route to check the model');
  assert.ok(check < content.indexOf('generateText({'), 'Expected the check before the model call');
  assert.match(content, /fetchCloudModels\(modelRef\.source\)/);
});
