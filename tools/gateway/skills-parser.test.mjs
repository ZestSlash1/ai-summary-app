import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSkillFrontMatter, validateSkillFiles } from '../../lib/skillParser.ts';
import {
  CURATED_SKILL_SOURCES,
  parseSkillGitHubUrl,
  isCuratedSource,
} from '../../lib/skillSources.ts';

test('parseSkillFrontMatter extracts name and description from SKILL.md', () => {
  const content = `---
name: test-skill
description: A helpful test skill
---

# Instructions
Do the thing.`;
  const parsed = parseSkillFrontMatter(content);
  assert.equal(parsed.name, 'test-skill');
  assert.equal(parsed.description, 'A helpful test skill');
  assert.match(parsed.body, /# Instructions/);
});

test('parseSkillFrontMatter handles quoted values and multi-line descriptions', () => {
  const content = `---
name: "quoted-skill"
description: 'A skill with single quotes and extra details'
---

Content here.`;
  const parsed = parseSkillFrontMatter(content);
  assert.equal(parsed.name, 'quoted-skill');
  assert.equal(parsed.description, 'A skill with single quotes and extra details');
  assert.equal(parsed.body, 'Content here.');
});

test('parseSkillFrontMatter falls back to heading when front matter is absent', () => {
  const content = `# My Custom Heading Skill\n\nSome body text without YAML.`;
  const parsed = parseSkillFrontMatter(content);
  assert.equal(parsed.name, 'My Custom Heading Skill');
  assert.equal(parsed.description, '');
  assert.match(parsed.body, /Some body text/);
});

test('validateSkillFiles rejects files exceeding 200 KB total or binary content', () => {
  const large = { 'SKILL.md': 'x'.repeat(205 * 1024) };
  assert.throws(() => validateSkillFiles(large), /too large/i);
});

test('validateSkillFiles rejects binary extensions and NUL bytes', () => {
  const binaryExt = {
    'SKILL.md': 'Valid instructions',
    'preview.png': 'pretend-image-bytes',
  };
  assert.throws(() => validateSkillFiles(binaryExt), /binary/i);

  const nulByte = {
    'SKILL.md': 'Valid instructions',
    'helper.txt': 'hello\0world',
  };
  assert.throws(() => validateSkillFiles(nulByte), /binary/i);
});

test('validateSkillFiles rejects directory traversal attempts', () => {
  const traversal = {
    'SKILL.md': 'Valid content',
    '../escape.txt': 'evil',
  };
  assert.throws(() => validateSkillFiles(traversal), /traversal|invalid/i);
});

test('validateSkillFiles passes valid text files within 200 KB', () => {
  const valid = {
    'SKILL.md': '# Good skill\nInstructions here.',
    'reference.md': 'More details here.',
  };
  assert.doesNotThrow(() => validateSkillFiles(valid));
});

test('CURATED_SKILL_SOURCES includes anthropics/skills and NousResearch/hermes-agent', () => {
  assert.ok(CURATED_SKILL_SOURCES.some((s) => s.owner === 'anthropics' && s.repo === 'skills'));
  assert.ok(CURATED_SKILL_SOURCES.some((s) => s.owner === 'NousResearch' && s.repo === 'hermes-agent'));
});

test('parseSkillGitHubUrl extracts owner, repo, branch, and path from GitHub tree URLs', () => {
  const parsed = parseSkillGitHubUrl('https://github.com/anthropics/skills/tree/main/skills/weather');
  assert.ok(parsed);
  assert.equal(parsed.owner, 'anthropics');
  assert.equal(parsed.repo, 'skills');
  assert.equal(parsed.branch, 'main');
  assert.equal(parsed.path, 'skills/weather');
});

test('parseSkillGitHubUrl handles blob URLs, repo root, and shorthand owner/repo', () => {
  const blobUrl = parseSkillGitHubUrl('https://github.com/owner/repo/blob/main/skills/test/SKILL.md');
  assert.ok(blobUrl);
  assert.equal(blobUrl.owner, 'owner');
  assert.equal(blobUrl.repo, 'repo');
  assert.equal(blobUrl.branch, 'main');
  assert.equal(blobUrl.path, 'skills/test');

  const rootUrl = parseSkillGitHubUrl('https://github.com/owner/my-repo');
  assert.ok(rootUrl);
  assert.equal(rootUrl.owner, 'owner');
  assert.equal(rootUrl.repo, 'my-repo');
  assert.equal(rootUrl.branch, 'main');
  assert.equal(rootUrl.path, '');

  const shorthand = parseSkillGitHubUrl('owner/my-repo');
  assert.ok(shorthand);
  assert.equal(shorthand.owner, 'owner');
  assert.equal(shorthand.repo, 'my-repo');

  assert.equal(parseSkillGitHubUrl('not-a-valid-url'), null);
});

test('isCuratedSource identifies curated repos correctly', () => {
  assert.equal(isCuratedSource('anthropics', 'skills'), true);
  assert.equal(isCuratedSource('NousResearch', 'hermes-agent'), true);
  assert.equal(isCuratedSource('random-user', 'random-repo'), false);
});

test('gateway POST /hermes-skills/install rejects unauthorized requests', async () => {
  const { createGateway } = await import('./server.mjs');
  const token = 'test-token-0123456789-abcdefghijkl';
  const server = createGateway({
    token,
    gpuMode: 'off',
  });
  const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

  try {
    const res = await fetch(`http://127.0.0.1:${port}/hermes-skills/install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'my-test-skill', files: { 'SKILL.md': '# Skill' } }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('gateway POST /hermes-skills/install validates name and security guards', async () => {
  const { createGateway } = await import('./server.mjs');
  const fsMod = await import('node:fs');
  const osMod = await import('node:os');
  const pathMod = await import('node:path');
  const skillsDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'aro-skills-test-'));
  const token = 'test-token-0123456789-abcdefghijkl';
  const server = createGateway({
    token,
    gpuMode: 'off',
    hermesSkillsDir: skillsDir,
  });
  const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

  try {
    // Missing or invalid skill name
    const invalidNameRes = await fetch(`http://127.0.0.1:${port}/hermes-skills/install`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '../bad-name', files: { 'SKILL.md': '# Skill' } }),
    });
    assert.equal(invalidNameRes.status, 400);

    // Path traversal in files
    const traversalRes = await fetch(`http://127.0.0.1:${port}/hermes-skills/install`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: 'good-skill', files: { '../bad.txt': 'evil' } }),
    });
    assert.equal(traversalRes.status, 400);

    // Files exceeding 200 KB
    const oversizedRes = await fetch(`http://127.0.0.1:${port}/hermes-skills/install`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: 'good-skill', files: { 'SKILL.md': 'x'.repeat(205 * 1024) } }),
    });
    assert.ok(oversizedRes.status === 400 || oversizedRes.status === 413);

    // Valid installation write
    const validRes = await fetch(`http://127.0.0.1:${port}/hermes-skills/install`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'test-gateway-install-skill',
        files: { 'SKILL.md': '# Test Skill\nInstructions.' },
      }),
    });
    assert.equal(validRes.status, 200);
    const body = await validRes.json();
    assert.equal(body.ok, true);
    assert.equal(body.skill, 'test-gateway-install-skill');
  } finally {
    server.close();
    fsMod.rmSync(skillsDir, { recursive: true, force: true });
  }
});

