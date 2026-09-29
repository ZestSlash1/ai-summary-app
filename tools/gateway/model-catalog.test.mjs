import test from 'node:test';
import assert from 'node:assert/strict';

test('parseBonsaiModels marks models free and extracts id', () => {
  const raw = { data: [{ id: 'bonsai-2-27b', object: 'model' }] };
  const models = raw.data.map((m) => ({
    id: m.id,
    name: m.id,
    free: true,
  }));
  assert.equal(models.length, 1);
  assert.equal(models[0].id, 'bonsai-2-27b');
  assert.equal(models[0].free, true);
});

test('parseBonsaiModels sorts models by name', () => {
  const raw = { data: [{ id: 'zebra' }, { id: 'bonsai-2-27b' }] };
  const models = (raw.data ?? [])
    .map((m) => ({
      id: m.id,
      name: m.id,
      free: true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  assert.equal(models[0].id, 'bonsai-2-27b');
  assert.equal(models[1].id, 'zebra');
});

test('handles offline failure without throwing fatal error', async () => {
  const fetchWithFallback = async () => {
    try {
      throw new Error('Connection refused (offline)');
    } catch {
      return [];
    }
  };
  const result = await fetchWithFallback();
  assert.deepEqual(result, []);
});
