import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import {
  downloadRepoTextFiles,
  listRepoTree,
  readRepoFile,
  RepoFileError,
  GithubApiError,
} from '../../lib/github.ts';

// A minimal ustar writer, enough to feed the parser the shapes GitHub produces.
function tarEntry(name, body, type = '0') {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0, 'utf8');
  header.write('0000644\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write('00000000000\0', 136);
  header.write('        ', 148);
  header.write(type, 156);
  header.write('ustar\0', 257);
  header.write('00', 263);
  let sum = 0;
  for (const b of header) sum += b;
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
  data.copy(padded);
  return Buffer.concat([header, padded]);
}

function paxRecord(key, value) {
  const body = ` ${key}=${value}\n`;
  let length = body.length + 1;
  while (String(length).length + body.length !== length) length = String(length).length + body.length;
  return `${length}${body}`;
}

function tarball(entries) {
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));
}

function withFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => handler(String(url), init);
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('downloadRepoTextFiles strips the wrapper folder and skips vendored, binary, and image files', async () => {
  const longPath = `owner-repo-abc123/${'deep/'.repeat(25)}file.ts`;
  const gz = tarball([
    tarEntry('pax_global_header', paxRecord('comment', 'abc123'), 'g'),
    tarEntry('owner-repo-abc123/', '', '5'),
    tarEntry('owner-repo-abc123/app/page.tsx', 'export default function Page() {}\n'),
    tarEntry('owner-repo-abc123/node_modules/react/index.js', 'module.exports = {}'),
    tarEntry('owner-repo-abc123/public/logo.png', 'not really a png'),
    tarEntry('owner-repo-abc123/data.bin', Buffer.from([1, 0, 2, 3])),
    tarEntry('PaxHeader/long', paxRecord('path', longPath), 'x'),
    tarEntry('owner-repo-abc123/deep/deep/trunc', 'long path body'),
  ]);

  let auth;
  const files = await withFetch(
    (url, init) => {
      assert.match(url, /\/repos\/owner\/repo\/tarball\/main$/);
      auth = init?.headers?.Authorization;
      return new Response(gz, { status: 200 });
    },
    () => downloadRepoTextFiles('tok', 'owner', 'repo', 'main')
  );

  assert.equal(auth, 'Bearer tok');
  assert.deepEqual([...files.keys()].sort(), ['app/page.tsx', `${'deep/'.repeat(25)}file.ts`].sort());
  assert.equal(files.get('app/page.tsx'), 'export default function Page() {}\n');
  assert.equal(files.get(`${'deep/'.repeat(25)}file.ts`), 'long path body');
});

test('downloadRepoTextFiles reports a failed download with its status', async () => {
  await withFetch(
    () => new Response('nope', { status: 404 }),
    () =>
      assert.rejects(downloadRepoTextFiles('tok', 'owner', 'repo', 'gone'), (err) => {
        assert.ok(err instanceof GithubApiError);
        assert.equal(err.status, 404);
        return true;
      })
  );
});

test('listRepoTree keeps files and drops generated folders', async () => {
  const tree = await withFetch(
    () =>
      json({
        truncated: false,
        tree: [
          { path: 'app', type: 'tree' },
          { path: 'app/page.tsx', type: 'blob', size: 10 },
          { path: '.next/server/app.js', type: 'blob', size: 10 },
          { path: 'packages/ui/node_modules/x/index.js', type: 'blob', size: 10 },
          { path: 'distance.ts', type: 'blob', size: 10 },
        ],
      }),
    () => listRepoTree('tok', 'owner', 'repo', 'main')
  );
  assert.deepEqual(
    tree.entries.map((e) => e.path),
    ['app/page.tsx', 'distance.ts']
  );
});

test('readRepoFile decodes text, refuses folders and binaries, and falls back to the blob API', async () => {
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

  const text = await withFetch(
    (url) => {
      assert.match(url, /\/contents\/app\/my%20page\.tsx\?ref=main$/);
      return json({ type: 'file', encoding: 'base64', content: b64('hello\nworld'), sha: 's1' });
    },
    () => readRepoFile('tok', 'owner', 'repo', 'main', '/app/my page.tsx')
  );
  assert.equal(text, 'hello\nworld');

  await withFetch(
    () => json([{ name: 'a.ts' }]),
    () => assert.rejects(readRepoFile('tok', 'owner', 'repo', 'main', 'app'), RepoFileError)
  );

  await withFetch(
    () => json({ type: 'file', encoding: 'base64', content: Buffer.from([0, 1, 2]).toString('base64'), sha: 's2' }),
    () => assert.rejects(readRepoFile('tok', 'owner', 'repo', 'main', 'x.bin'), RepoFileError)
  );

  const big = await withFetch(
    (url) =>
      url.includes('/git/blobs/s3')
        ? json({ encoding: 'base64', content: b64('big file body') })
        : json({ type: 'file', encoding: 'none', content: '', sha: 's3' }),
    () => readRepoFile('tok', 'owner', 'repo', 'main', 'big.json')
  );
  assert.equal(big, 'big file body');
});
