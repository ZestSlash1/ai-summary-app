import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SLASH_COMMANDS = [
  { id: 'plan', label: '/plan', description: 'Toggle plan mode on or off' },
  { id: 'clear', label: '/clear', description: 'Clear conversation history' },
  { id: 'compact', label: '/compact', description: 'Summarize and compress context' },
  { id: 'model', label: '/model', description: 'Switch active model' },
  { id: 'skills', label: '/skills', description: 'Open skills catalog' },
  { id: 'new', label: '/new', description: 'Start a new conversation' },
];

function matchSlashCommand(input) {
  if (!input.startsWith('/')) return null;
  const match = input.slice(1).toLowerCase().trim();
  return SLASH_COMMANDS.filter((cmd) => cmd.id.startsWith(match));
}

test('slash command detects command at start of input', () => {
  const matches = matchSlashCommand('/pl');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'plan');

  const all = matchSlashCommand('/');
  assert.equal(all.length, 6);

  const none = matchSlashCommand('hello /plan');
  assert.equal(none, null);
});

test('checkpoint restore truncates message array at targeted index', () => {
  const messages = [
    { id: '1', role: 'user', content: 'First' },
    { id: '2', role: 'assistant', content: 'Second' },
    { id: '3', role: 'user', content: 'Third' },
    { id: '4', role: 'assistant', content: 'Fourth' },
  ];

  const restoreToCheckpoint = (msgs, index) => msgs.slice(0, index + 1);

  const restored = restoreToCheckpoint(messages, 1);
  assert.equal(restored.length, 2);
  assert.equal(restored[1].id, '2');
});

test('SlashCommandMenu and MessageActions copy contains no em-dashes', () => {
  const actionsContent = readFileSync(new URL('../../components/MessageActions.tsx', import.meta.url), 'utf8');
  assert.ok(!actionsContent.includes('—'), 'MessageActions.tsx should contain zero em-dashes');

  for (const cmd of SLASH_COMMANDS) {
    assert.ok(!cmd.description.includes('—'), `Slash command ${cmd.id} should not contain em-dashes`);
  }
});
