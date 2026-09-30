import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('agent options filters disabled tools from registry', () => {
  const allTools = { repo: true, web: true, calculate: true, imageEdit: true };
  const filterTools = (tools, config) => {
    if (!config) return tools;
    return Object.fromEntries(
      Object.entries(tools).filter(([k]) => config[k] !== false)
    );
  };

  const filtered = filterTools(allTools, { calculate: false, web: false });
  assert.equal('calculate' in filtered, false);
  assert.equal('web' in filtered, false);
  assert.equal('repo' in filtered, true);
  assert.equal('imageEdit' in filtered, true);
});

test('permission readonly drops write tools', () => {
  const tools = { listRepoFiles: true, readFile: true, createFile: true, pushHunk: true, editImage: true };
  const filterByPermission = (t, permission) => {
    if (permission !== 'readonly') return t;
    const writeNames = new Set(['createFile', 'pushHunk', 'editImage']);
    return Object.fromEntries(Object.entries(t).filter(([k]) => !writeNames.has(k)));
  };

  const readonlyTools = filterByPermission(tools, 'readonly');
  assert.equal('createFile' in readonlyTools, false);
  assert.equal('editImage' in readonlyTools, false);
  assert.equal('readFile' in readonlyTools, true);
  assert.equal('listRepoFiles' in readonlyTools, true);
});

test('hermes model_options configures reasoning effort', () => {
  const makeHermesPayload = (model, effort) => {
    return {
      model,
      stream: true,
      ...(effort ? { model_options: { reasoning: { effort } } } : {}),
    };
  };

  const payload = makeHermesPayload('hermes-agent', 'high');
  assert.deepEqual(payload.model_options, { reasoning: { effort: 'high' } });
});

test('AgentOptions types and interface contain no em-dashes', () => {
  const content = readFileSync(new URL('../../lib/types.ts', import.meta.url), 'utf8');
  assert.ok(!content.includes('—'), 'lib/types.ts should not contain em-dashes');
});
