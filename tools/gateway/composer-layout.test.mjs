import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// A class name that runs straight into the next one ("px-0text-[13px]") is just an unknown word to
// Tailwind: both classes silently stop working, and no build step or linter says so. It happens
// when an edit drops the space between two classes.
const GLUED = /[a-z0-9\])](?:max-(?:sm|md):|data-\[|text-(?:\[|nimbus)|bg-nimbus|border-nimbus)/;

const sourceFiles = (dir) =>
  readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

test('the glued-class check catches the cases that shipped once', () => {
  for (const glued of [
    'max-sm:overflow-visibledata-[fade=both]:[mask-image:none]',
    'max-sm:px-0text-[13px]',
    'max-sm:text-[14px]text-nimbus-text-muted',
  ]) {
    assert.match(glued, GLUED);
  }
  for (const fine of [
    'max-sm:px-0 text-[13px] hover:text-nimbus-text data-[fade=end]:[mask-image:none]',
    'group-hover/chip:-rotate-12 placeholder:text-nimbus-text-faint disabled:bg-nimbus-surface-3',
  ]) {
    assert.doesNotMatch(fine, GLUED);
  }
});

test('no class name in the app runs into the next one', () => {
  for (const file of ['app', 'components'].flatMap(sourceFiles)) {
    const hit = read(file).match(new RegExp(`\\S*${GLUED.source}\\S*`))?.[0];
    assert.equal(hit, undefined, `${file} has a class name with a missing space: ${hit}`);
  }
});

// The composer's chips used to spill past its border on desktop (Skills ended up outside the
// box and Options under Send): the row was overflow-visible from the sm breakpoint up.
test('the composer controls row is a container that never spills past the composer', () => {
  const composer = read('components/chat/Composer.tsx');
  const row = composer.match(/ref=\{controlsRef\}[\s\S]*?className="([^"]+)"/)?.[1] ?? '';
  assert.match(row, /@container\/controls/, 'chip labels fold against the row width');
  assert.match(row, /(^|\s)overflow-x-auto(\s|$)/, 'the row scrolls as a last resort');
  assert.doesNotMatch(row, /overflow-visible/, 'the row must not overflow the composer');
});

test('secondary chip labels fold, least needed first, and stay readable to screen readers', () => {
  const classes = read('components/ui/classes.ts');
  const rem = (name) => Number(classes.match(new RegExp(`${name} = "@max-\\[(\\d+)rem\\]/controls:sr-only"`))?.[1]);
  assert.ok(rem('CHIP_LABEL_EXTRA') > rem('CHIP_LABEL_REPO'), 'Options and Skills fold before the repo name');
  assert.ok(rem('CHIP_LABEL_REPO') > rem('CHIP_LABEL'), 'the repo name folds before MCP and Plan');

  const uses = {
    'components/chat/AgentOptionsPopover.tsx': 'CHIP_LABEL_EXTRA',
    'components/chat/SkillsPicker.tsx': 'CHIP_LABEL_EXTRA',
    'components/RepoConnect.tsx': 'CHIP_LABEL_REPO',
    'components/McpConnectors.tsx': 'CHIP_LABEL',
    'components/ChatPanel.tsx': 'CHIP_LABEL',
  };
  for (const [file, token] of Object.entries(uses)) {
    assert.ok(read(file).includes(`{${token}}`) || read(file).includes(`\${${token}}`), `${file} should fold its label with ${token}`);
  }
});

test('press feedback that moves things is motion-safe', () => {
  const classes = read('components/ui/classes.ts');
  for (const token of ['CHIP', 'MENU_ROW', 'BUTTON_PRIMARY', 'BUTTON_SECONDARY', 'ICON_BUTTON']) {
    const value = classes.match(new RegExp(`export const ${token} =\\s*"([^"]+)"`))?.[1] ?? '';
    assert.ok(value, `${token} exists`);
    assert.doesNotMatch(value, /(^|\s)active:scale/, `${token} scales on press only under motion-safe`);
    assert.match(value, /motion-safe:active:scale/, `${token} still answers a press`);
  }
});

test('Send and Stop are one button that swaps its face, with its name following the state', () => {
  const composer = read('components/chat/Composer.tsx');
  assert.match(composer, /aria-label=\{streaming \? "Stop the reply" : "Send message"\}/);
  assert.match(composer, /onClick=\{streaming \? onStop : onSubmit\}/);
  assert.match(composer, /disabled=\{!streaming && !canSend\}/, 'Stop is never disabled');
});
