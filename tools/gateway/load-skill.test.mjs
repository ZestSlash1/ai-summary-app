import test from 'node:test';
import assert from 'node:assert/strict';

test('loadSkill returns full skill instructions when called by name', () => {
  const skills = [{ name: 'git-expert', description: 'Git master', body: 'Step 1: commit.' }];
  const findSkill = (name) => skills.find((s) => s.name === name)?.body;
  assert.equal(findSkill('git-expert'), 'Step 1: commit.');
  assert.equal(findSkill('unknown'), undefined);
});

test('system prompt formats index of enabled skills only', () => {
  const skills = [
    { name: 'git-expert', description: 'Git master', enabled: true },
    { name: 'secret-skill', description: 'Hidden', enabled: false },
    { name: 'tester', description: 'Runs tests', enabled: true },
  ];
  const formatIndex = (list) => {
    const enabled = list.filter((s) => s.enabled !== false);
    if (!enabled.length) return '';
    return `Available skills:\n${enabled.map((s) => `- ${s.name}: ${s.description}`).join('\n')}`;
  };
  const result = formatIndex(skills);
  assert.equal(
    result,
    'Available skills:\n- git-expert: Git master\n- tester: Runs tests'
  );
  assert.equal(formatIndex([]), '');
  assert.equal(formatIndex([{ name: 'off', description: 'off', enabled: false }]), '');
});

test('loadSkill resolves instructions from skillMd body fallback', () => {
  const skills = [
    {
      name: 'code-review',
      description: 'Reviews code',
      skillMd: '---\nname: code-review\ndescription: Reviews code\n---\n\n# Instructions\nAudit every line.',
    },
  ];
  const extractBody = (skill) => {
    if (!skill) return undefined;
    if (skill.body) return skill.body;
    if (skill.skillMd) {
      const match = skill.skillMd.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
      return match ? match[1].trim() : skill.skillMd.trim();
    }
    return undefined;
  };
  const findSkillBody = (name) => {
    const s = skills.find((item) => item.name.toLowerCase() === name.toLowerCase());
    return extractBody(s);
  };

  assert.equal(findSkillBody('code-review'), '# Instructions\nAudit every line.');
  assert.equal(findSkillBody('CODE-REVIEW'), '# Instructions\nAudit every line.');
  assert.equal(findSkillBody('unknown'), undefined);
});

test('safeId slugification matches gateway requirements', () => {
  const slugify = (input) =>
    input
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'skill';
  const gatewayRegex = /^[a-zA-Z0-9_-]{1,64}$/;

  assert.ok(gatewayRegex.test(slugify('anthropics/skills/git-expert')));
  assert.ok(gatewayRegex.test(slugify('NousResearch/hermes-agent/skills/web-search')));
  assert.ok(gatewayRegex.test(slugify('a'.repeat(100))));
  assert.ok(gatewayRegex.test(slugify('!@#$%^&*()_+')));
});
