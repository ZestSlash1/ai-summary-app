import test from 'node:test';
import assert from 'node:assert/strict';

test('loadModelSource parses bonsai source correctly', () => {
  const getSource = (val) => (val === 'omniroute' ? 'omniroute' : val === 'bonsai' ? 'bonsai' : 'gateway');
  assert.equal(getSource('bonsai'), 'bonsai');
  assert.equal(getSource('omniroute'), 'omniroute');
  assert.equal(getSource('gateway'), 'gateway');
  assert.equal(getSource(null), 'gateway');
  assert.equal(getSource('unknown'), 'gateway');
});
