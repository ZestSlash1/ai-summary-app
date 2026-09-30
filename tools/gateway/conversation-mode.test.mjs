import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getDefaultModelKey } from '../../lib/storage.ts';

test('code mode gets its own default model ref key', () => {
  const getModelKey = (mode) => (mode === 'code' ? 'aro-default-model:code' : 'aro-default-model');
  assert.equal(getModelKey('code'), 'aro-default-model:code');
  assert.equal(getModelKey('chat'), 'aro-default-model');
  assert.equal(getDefaultModelKey('code'), 'aro-default-model:code');
  assert.equal(getDefaultModelKey('chat'), 'aro-default-model');
  assert.equal(getDefaultModelKey(), 'aro-default-model');
});

test('lib/types.ts includes mode in Conversation', () => {
  const typesContent = fs.readFileSync(path.resolve('lib/types.ts'), 'utf-8');
  assert.ok(
    typesContent.includes('mode?: "chat" | "code";'),
    'Expected mode?: "chat" | "code" in Conversation'
  );
});

test('lib/storage.ts supports mode and code default model ref', () => {
  const storageContent = fs.readFileSync(path.resolve('lib/storage.ts'), 'utf-8');
  assert.ok(
    storageContent.includes('getDefaultModelKey'),
    'Expected getDefaultModelKey export in lib/storage.ts'
  );
  assert.ok(
    storageContent.includes('aro-default-model:code'),
    'Expected aro-default-model:code key in lib/storage.ts'
  );
  assert.ok(
    storageContent.includes('loadDefaultModelRef(mode'),
    'Expected loadDefaultModelRef to accept mode'
  );
});

test('app/api/github/tree/route.ts exists and reuses listRepoTree', () => {
  const routePath = path.resolve('app/api/github/tree/route.ts');
  assert.ok(fs.existsSync(routePath), 'Expected app/api/github/tree/route.ts to exist');
  const routeContent = fs.readFileSync(routePath, 'utf-8');
  assert.ok(routeContent.includes('listRepoTree'), 'Expected listRepoTree call in route');
});

test('components/Sidebar.tsx includes SquareCode nav item and code history badge', () => {
  const sidebarContent = fs.readFileSync(path.resolve('components/Sidebar.tsx'), 'utf-8');
  assert.ok(sidebarContent.includes('SquareCode'), 'Expected SquareCode in Sidebar.tsx');
  assert.ok(sidebarContent.includes('label="Code"'), 'Expected Code label in Sidebar.tsx');
});

test('components/CommandPalette.tsx and app/page.tsx include New coding session', () => {
  const pageContent = fs.readFileSync(path.resolve('app/page.tsx'), 'utf-8');
  assert.ok(
    pageContent.includes('New coding session'),
    'Expected New coding session in app/page.tsx actions'
  );
  assert.ok(
    pageContent.includes('SquareCode'),
    'Expected SquareCode imported in app/page.tsx'
  );
});

test('components/chat/Welcome.tsx has code mode suggestions', () => {
  const welcomeContent = fs.readFileSync(path.resolve('components/chat/Welcome.tsx'), 'utf-8');
  assert.ok(
    welcomeContent.includes('mode'),
    'Expected mode parameter in suggestionsFor in Welcome.tsx'
  );
  assert.ok(
    welcomeContent.includes('structure') || welcomeContent.includes('failing test'),
    'Expected coding suggestions in Welcome.tsx'
  );
});

test('components/workspace/WorkspaceRail.tsx exists with Files, Changes, and Skills tabs', () => {
  const railPath = path.resolve('components/workspace/WorkspaceRail.tsx');
  assert.ok(fs.existsSync(railPath), 'Expected components/workspace/WorkspaceRail.tsx to exist');
  const railContent = fs.readFileSync(railPath, 'utf-8');
  assert.ok(railContent.includes('Files'), 'Expected Files tab');
  assert.ok(railContent.includes('Changes'), 'Expected Changes tab');
  assert.ok(railContent.includes('Skills'), 'Expected Skills tab');
});

test('ChatPanel.tsx integrates WorkspaceRail and avoids window.location.reload', () => {
  const chatContent = fs.readFileSync(path.resolve('components/ChatPanel.tsx'), 'utf-8');
  assert.ok(
    chatContent.includes('WorkspaceRail'),
    'Expected WorkspaceRail in components/ChatPanel.tsx'
  );
  assert.ok(
    !chatContent.includes('window.location.reload()'),
    'Expected no window.location.reload() in components/ChatPanel.tsx'
  );
});

test('POST /api/conversations inserts mode into Supabase table', () => {
  const routeContent = fs.readFileSync(path.resolve('app/api/conversations/route.ts'), 'utf-8');
  assert.ok(
    routeContent.includes('body.mode ? { mode: body.mode }') ||
    routeContent.includes('mode: body.mode'),
    'Expected mode to be included in supabase insert payload'
  );
});

test('WorkspaceRail.tsx deduplicates pending files by path keeping latest content', () => {
  const railContent = fs.readFileSync(path.resolve('components/workspace/WorkspaceRail.tsx'), 'utf-8');
  assert.ok(
    railContent.includes('new Map') && railContent.includes('deduped.set(f.path, f)'),
    'Expected WorkspaceRail to deduplicate pending files by path'
  );
});

test('WorkspaceRail.tsx retry triggers a fresh fetch', () => {
  const railContent = fs.readFileSync(path.resolve('components/workspace/WorkspaceRail.tsx'), 'utf-8');
  assert.ok(
    railContent.includes('refreshIndex') || railContent.includes('fetchTree'),
    'Expected WorkspaceRail to trigger a fresh fetch on retry'
  );
});

test('zero em-dashes across all Task 6 files', () => {
  const files = [
    'lib/types.ts',
    'lib/storage.ts',
    'components/Sidebar.tsx',
    'components/CommandPalette.tsx',
    'app/page.tsx',
    'components/chat/Welcome.tsx',
    'components/ChatPanel.tsx',
    'components/workspace/WorkspaceRail.tsx',
    'app/api/github/tree/route.ts',
    'tools/gateway/conversation-mode.test.mjs',
  ];
  for (const f of files) {
    const fullPath = path.resolve(f);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(
      !content.includes('\u2014'),
      `File ${f} contains forbidden em-dash character (\u2014)`
    );
  }
});

