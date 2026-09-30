import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicHttpUrl } from '../../lib/safeUrl.ts';

test('isPublicHttpUrl accepts public http(s) servers', () => {
  for (const url of [
    'https://mcp.example.com',
    'https://mcp.example.com:8443/sse?x=1',
    'http://tools.example.org/mcp',
    'https://8.8.8.8/mcp',
    'https://[2606:4700:4700::1111]/mcp',
  ]) {
    assert.equal(isPublicHttpUrl(url), true, url);
  }
});

test('isPublicHttpUrl rejects local, private, metadata, and malformed targets', () => {
  for (const url of [
    'http://localhost:3000',
    'http://app.localhost',
    'http://127.0.0.1:8787',
    'http://10.0.0.5',
    'http://172.16.0.1',
    'http://172.31.255.255',
    'http://192.168.1.10',
    'http://169.254.169.254/latest/meta-data',
    'http://100.64.0.1',
    'http://0.0.0.0',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://printer.local',
    'http://db.internal',
    'http://intranet',
    'ftp://example.com',
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'not a url',
  ]) {
    assert.equal(isPublicHttpUrl(url), false, url);
  }
});

test('isPublicHttpUrl does not over-block ranges next to private ones', () => {
  assert.equal(isPublicHttpUrl('http://172.15.0.1'), true);
  assert.equal(isPublicHttpUrl('http://172.32.0.1'), true);
  assert.equal(isPublicHttpUrl('http://100.128.0.1'), true);
});
