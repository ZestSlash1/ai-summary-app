import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_CATALOG, MCP_CATALOG_GROUPS, catalogConnector } from '../../lib/mcpCatalog.ts';
import { bearerHeader, describeMcpError, mergeMcpToolSets } from '../../lib/mcp.ts';
import { isPublicHttpUrl } from '../../lib/safeUrl.ts';

test('every catalog server has a unique id, a known group, and an address the chat route will call', () => {
  const ids = MCP_CATALOG.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'catalog ids must be unique');
  const groups = new Set(MCP_CATALOG_GROUPS.map((g) => g.id));
  for (const entry of MCP_CATALOG) {
    assert.ok(groups.has(entry.group), `${entry.id} is in an unknown group`);
    assert.ok(entry.url.startsWith('https://'), `${entry.id} must use https`);
    assert.ok(isPublicHttpUrl(entry.url), `${entry.id} would be refused as a private address`);
    assert.ok(entry.blurb && !entry.blurb.includes('—'), `${entry.id} needs a blurb without em-dashes`);
    if (entry.key) {
      assert.ok(entry.key.getUrl.startsWith('https://'), `${entry.id} should link to where its key is made`);
      assert.ok(entry.key.label && entry.key.placeholder, `${entry.id} key field needs a label and placeholder`);
    }
  }
  for (const group of MCP_CATALOG_GROUPS) {
    assert.ok(MCP_CATALOG.some((e) => e.group === group.id), `group ${group.id} is empty`);
  }
});

test('the free web search and the docs servers work without a key', () => {
  const keyless = MCP_CATALOG.filter((e) => !e.key).map((e) => e.id);
  for (const id of ['exa', 'context7', 'deepwiki', 'grep']) assert.ok(keyless.includes(id), `${id} should not ask for a key`);
  // Jina lists its tools without a key but refuses to run them, so it must ask for one.
  assert.ok(MCP_CATALOG.find((e) => e.id === 'jina')?.key);
});

test('a catalog connector remembers where it came from and starts on', () => {
  const exa = MCP_CATALOG.find((e) => e.id === 'exa');
  const connector = catalogConnector(exa, { toolNames: ['web_search_exa'] });
  assert.deepEqual(connector, {
    id: 'catalog:exa',
    catalogId: 'exa',
    name: 'Exa',
    url: 'https://mcp.exa.ai/mcp',
    authHeader: undefined,
    enabled: true,
    toolNames: ['web_search_exa'],
  });
});

test('a pasted key becomes one Bearer header, with or without "Bearer " in front', () => {
  assert.equal(bearerHeader('  ghp_abc  '), 'Bearer ghp_abc');
  assert.equal(bearerHeader('Bearer ghp_abc'), 'Bearer ghp_abc');
  assert.equal(bearerHeader('bearer   ghp_abc'), 'Bearer ghp_abc');
});

test('tools with the same name on two servers are both kept', () => {
  const merged = mergeMcpToolSets([
    { name: 'GitHub', tools: { list_issues: 'gh-issues', search_code: 'gh-code' } },
    { name: 'Linear', tools: { list_issues: 'linear-issues', list_projects: 'linear-projects' } },
    { name: 'Supabase', tools: { list_projects: 'supabase-projects' } },
  ]);
  assert.deepEqual(merged, {
    list_issues: 'gh-issues',
    search_code: 'gh-code',
    linear_list_issues: 'linear-issues',
    list_projects: 'linear-projects',
    supabase_list_projects: 'supabase-projects',
  });
});

test('renamed tools stay valid tool names, even for odd server names and long tool names', () => {
  const long = 'x'.repeat(64);
  const merged = mergeMcpToolSets([
    { name: 'A', tools: { [long]: 1, run: 1 } },
    { name: 'My Server (prod)!', tools: { [long]: 2, run: 2 } },
    { name: 'My Server (prod)!', tools: { run: 3 } },
    { tools: { run: 4 } },
  ]);
  const names = Object.keys(merged);
  assert.equal(names.length, 6, 'no tool is dropped');
  for (const name of names) assert.match(name, /^[a-zA-Z0-9_-]{1,64}$/);
  assert.equal(merged.my_server_prod_run, 2);
  assert.equal(merged.my_server_prod2_run, 3);
  assert.equal(merged.mcp4_run, 4);
});

test('connect errors read as one short reason, never a dumped web page', () => {
  const page = new Error('MCP HTTP Transport Error: POSTing to endpoint (HTTP 422): <!DOCTYPE html>\n<html><head><title>Oh no</title>' + 'x'.repeat(5000));
  const pageReason = describeMcpError(page, { sentKey: false });
  assert.match(pageReason, /web page, not an MCP server/);
  assert.ok(pageReason.length < 200);

  const unauthorized = new Error('MCP HTTP Transport Error: POSTing to endpoint (HTTP 401): {"error":"invalid_token"}');
  assert.equal(describeMcpError(unauthorized, { sentKey: true }), 'The server turned down that key.');
  assert.equal(describeMcpError(unauthorized, { sentKey: false }), 'This server needs a key.');

  assert.match(describeMcpError(new TypeError('fetch failed'), { sentKey: false }), /Couldn't reach that address/);
  assert.match(describeMcpError(new Error('MCP HTTP Transport Error: POSTing to endpoint (HTTP 404): Not Found'), { sentKey: false }), /usually end in \/mcp/);
  assert.ok(describeMcpError(new Error('y'.repeat(1000)), { sentKey: false }).length <= "Couldn't connect: ".length + 200);
  assert.equal(describeMcpError('not an error', { sentKey: false }), "Couldn't connect to that MCP server.");
});
