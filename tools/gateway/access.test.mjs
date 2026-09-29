import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseBonsai, bonsaiDenied } from '../../lib/access.ts';

test('denies when signed out', () => {
  assert.equal(canUseBonsai(null, '123'), false);
  assert.equal(canUseBonsai({}, '123'), false);
});

test('fails closed when the allow-list is missing or empty', () => {
  assert.equal(canUseBonsai({ githubUserId: '123' }, undefined), false);
  assert.equal(canUseBonsai({ githubUserId: '123' }, ''), false);
  assert.equal(canUseBonsai({ githubUserId: '123' }, ' , ,'), false);
});

test('allows only listed ids, tolerating spaces', () => {
  assert.equal(canUseBonsai({ githubUserId: '123' }, '123'), true);
  assert.equal(canUseBonsai({ githubUserId: '456' }, '123, 456'), true);
  assert.equal(canUseBonsai({ githubUserId: '789' }, '123,456'), false);
});

test('does not match on substrings', () => {
  assert.equal(canUseBonsai({ githubUserId: '12' }, '123'), false);
  assert.equal(canUseBonsai({ githubUserId: '1234' }, '123'), false);
});

test('401 when signed out, 403 when signed in but not allowed', async () => {
  const out = bonsaiDenied(null);
  assert.equal(out.status, 401);
  const notAllowed = bonsaiDenied({ githubUserId: '999' });
  assert.equal(notAllowed.status, 403);
  assert.match((await notAllowed.json()).error, /not allowed/i);
});
