// Writes an installed skill into the folder Hermes reads skills from.
//
// A skill is instructions for an agent that can run commands on this PC, so this is the most
// sensitive write the gateway does. It only ever creates a skill folder it owns: it will not
// touch one it did not create (Pinokio's, or one you made by hand), validates every path
// before writing any file, and writes to a temp folder that is renamed into place.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const MAX_SKILL_TOTAL_BYTES = 200 * 1024;
export const MAX_SKILL_FILES = 200;
export const MARKER = '.aro-managed.json';
const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'woff', 'woff2', 'ttf',
  'eot', 'mp4', 'mov', 'webm', 'mp3', 'wav', 'zip', 'gz', 'tar', 'pdf',
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'wasm', 'pyc', 'class', 'lock',
]);

export class SkillInstallError extends Error {
  constructor(status, message, type) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

/** Checks the request and returns the files to write, or throws SkillInstallError. */
export function planSkillInstall(skillsDir, name, files) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    throw new SkillInstallError(400, 'Invalid or missing skill name. Only letters, digits, dashes, and underscores are allowed.');
  }
  if (!files || typeof files !== 'object' || Array.isArray(files) || Object.keys(files).length === 0) {
    throw new SkillInstallError(400, 'Missing or empty files object.');
  }
  const entries = Object.entries(files);
  if (entries.length > MAX_SKILL_FILES) throw new SkillInstallError(413, `Too many files (limit ${MAX_SKILL_FILES}).`);

  // Validate against a stand-in folder when none is set, so input errors win over config errors.
  const root = path.resolve(skillsDir || path.join(os.tmpdir(), 'aro-skills-unset'), name);
  const planned = [];
  const seen = new Set();
  let total = 0;
  for (const [relPath, content] of entries) {
    if (!relPath || typeof relPath !== 'string') throw new SkillInstallError(400, 'Invalid file path in files.');
    const rel = relPath.replace(/\\/g, '/');
    if (
      rel.startsWith('/') ||
      /^[A-Za-z]:/.test(rel) ||
      rel.split('/').some((part) => part === '..' || part === '' || part === '.') ||
      rel.includes('\0')
    ) {
      throw new SkillInstallError(400, `Path not allowed: ${relPath}`);
    }
    if (rel === MARKER) throw new SkillInstallError(400, `Reserved file name: ${relPath}`);
    const key = rel.toLowerCase(); // Windows folders are case-insensitive
    if (seen.has(key)) throw new SkillInstallError(400, `Duplicate file path: ${relPath}`);
    seen.add(key);
    const ext = rel.split('.').pop()?.toLowerCase() ?? '';
    if (BINARY_EXTENSIONS.has(ext)) throw new SkillInstallError(400, `Binary extension not allowed: ${relPath}`);
    if (typeof content !== 'string') throw new SkillInstallError(400, `File content must be text: ${relPath}`);
    if (content.includes('\0')) throw new SkillInstallError(400, `Binary content detected in: ${relPath}`);
    total += Buffer.byteLength(content, 'utf8');
    if (total > MAX_SKILL_TOTAL_BYTES) throw new SkillInstallError(413, `Total skill size exceeds the 200 KB limit (${total} bytes).`);
    const dest = path.resolve(root, rel);
    if (!dest.startsWith(root + path.sep)) throw new SkillInstallError(400, `Path escapes the skill folder: ${relPath}`);
    planned.push({ rel, dest, content });
  }
  if (!planned.some((f) => f.rel.toLowerCase() === 'skill.md')) {
    throw new SkillInstallError(400, 'A skill needs a SKILL.md at its top level.');
  }
  if (!skillsDir) {
    throw new SkillInstallError(
      503,
      'Set HERMES_SKILLS_DIR to the folder Hermes reads skills from. For Hermes in WSL that is a \\\\wsl.localhost\\Ubuntu\\home\\<user>\\.hermes\\skills path.',
      'skills_dir_unconfigured',
    );
  }
  return { root, planned, total };
}

/** Writes a planned install. Replaces a previous ARO install; refuses anything else. */
export function writeSkillInstall({ root, planned }) {
  const replacing = fs.existsSync(root);
  if (replacing && !fs.existsSync(path.join(root, MARKER))) {
    throw new SkillInstallError(
      409,
      'A skill with this name already exists and was not installed by ARO, so it was left alone.',
      'skill_exists',
    );
  }
  fs.mkdirSync(path.dirname(root), { recursive: true });
  const staging = `${root}.tmp-${randomBytes(4).toString('hex')}`;
  try {
    for (const file of planned) {
      const dest = path.join(staging, file.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content, 'utf8');
    }
    fs.writeFileSync(path.join(staging, MARKER), JSON.stringify({ installedBy: 'aro', installedAt: new Date().toISOString() }));
    if (replacing) fs.rmSync(root, { recursive: true, force: true });
    fs.renameSync(staging, root);
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw new SkillInstallError(500, `Failed to write skill files: ${err.message}`);
  }
  return { replaced: replacing, files: planned.length };
}
