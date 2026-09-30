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

// /model used to click document.querySelector('[aria-haspopup="listbox"]'), which matched nothing
// (the picker is a dialog) and, with several chat tabs open, could reach another tab's picker.
test('/model opens the chat panel\'s own model picker, not a global DOM query', () => {
  const panel = readFileSync(new URL('../../components/ChatPanel.tsx', import.meta.url), 'utf8');
  const modelCase = panel.match(/case "model": \{([\s\S]*?)\n\s*\}/)?.[1];
  assert.ok(modelCase, 'Expected a case "model" branch in the slash command handler');
  assert.ok(!modelCase.includes('document.'), '/model should not look the picker up in the DOM');
  assert.match(modelCase, /setModelOpen\(true\)/);

  const switcherProps = panel.match(/<ModelSwitcher((?:(?!\/>)[\s\S])*)\/>/)?.[1] ?? '';
  assert.match(switcherProps, /open=\{modelOpen\}/, 'ChatPanel should control its picker\'s open state');
  assert.match(switcherProps, /onOpenChange=\{setModelOpen\}/);

  const switcher = readFileSync(new URL('../../components/ModelSwitcher.tsx', import.meta.url), 'utf8');
  assert.match(switcher, /open\?: boolean;/);
  assert.match(switcher, /onOpenChange\?: \(open: boolean\) => void;/);
});

// Enter in the composer used to send "/model" as a chat message, which also unmounted the
// menu before its window keydown listener could pick the command.
test('Enter picks a listed slash command instead of sending it as a message', () => {
  const composer = readFileSync(new URL('../../components/chat/Composer.tsx', import.meta.url), 'utf8');
  assert.match(composer, /slashMenuHasCommands = showSlashMenu && matchSlashCommands\(value\)\.length > 0/);
  const enter = composer.match(/if \(e\.key === "Enter"[^{]*\{([\s\S]*?)onSubmit\(\)/)?.[1] ?? '';
  assert.match(enter, /if \(slashMenuHasCommands\) return;/, 'Enter should leave a listed command to the menu');

  const menu = readFileSync(new URL('../../components/chat/SlashCommandMenu.tsx', import.meta.url), 'utf8');
  assert.match(menu, /const filtered = matchSlashCommands\(query\);/, 'The menu and the composer should share one matcher');
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
