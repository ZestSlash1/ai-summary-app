/**
 * Skill parser and size safety validation.
 * Zero external dependencies to allow direct execution in Node test runner.
 */

export const MAX_SKILL_TOTAL_BYTES = 200 * 1024; // 200 KB limit for all skill files combined

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "svg", "woff", "woff2", "ttf",
  "eot", "mp4", "mov", "webm", "mp3", "wav", "zip", "gz", "tar", "pdf",
  "exe", "dll", "so", "dylib", "bin", "iso", "wasm", "pyc", "class", "lock",
]);

export type ParsedSkillFrontMatter = {
  name: string;
  description: string;
  body: string;
  metadata?: Record<string, string>;
};

/**
 * Strips outer quotes (single or double) from a string.
 */
function unquote(str: string): string {
  const trimmed = str.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parses YAML front matter from SKILL.md.
 * Supports standard front matter delimiters, key: value pairs, and folded/quoted values.
 */
export function parseSkillFrontMatter(content: string): ParsedSkillFrontMatter {
  if (!content) {
    return { name: "", description: "", body: "" };
  }

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    // No YAML front matter. Fallback to first heading for name if available.
    const headingMatch = content.match(/^#\s+(.+)$/m);
    const fallbackName = headingMatch ? headingMatch[1].trim() : "";
    return {
      name: fallbackName,
      description: "",
      body: content.trim(),
    };
  }

  const rawYaml = fmMatch[1];
  const body = fmMatch[2].trim();
  const metadata: Record<string, string> = {};

  const lines = rawYaml.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentValue = "";

  for (const line of lines) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (keyMatch) {
      if (currentKey) {
        metadata[currentKey] = unquote(currentValue);
      }
      currentKey = keyMatch[1].toLowerCase();
      currentValue = keyMatch[2];
    } else if (currentKey && /^\s+/.test(line)) {
      const continuation = line.trim();
      if (currentValue === ">" || currentValue === "|") {
        currentValue = continuation;
      } else {
        currentValue += (currentValue ? " " : "") + continuation;
      }
    }
  }

  if (currentKey) {
    metadata[currentKey] = unquote(currentValue);
  }

  let name = metadata["name"] || "";
  const description = metadata["description"] || "";

  if (!name) {
    const headingMatch = body.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      name = headingMatch[1].trim();
    }
  }

  return {
    name,
    description,
    body,
    metadata,
  };
}

/**
 * Validates that skill files meet safety guidelines:
 * 1. Total size must not exceed 200 KB.
 * 2. Only text files are permitted (no binary extensions, no NUL bytes).
 * 3. File paths must be safe relative paths without directory traversal.
 */
export function validateSkillFiles(
  files: Record<string, string | Uint8Array> | Map<string, string | Uint8Array>
): void {
  const entries =
    files instanceof Map ? Array.from(files.entries()) : Object.entries(files);

  if (entries.length === 0) {
    throw new Error("No skill files provided.");
  }

  let totalBytes = 0;

  for (const [filePath, content] of entries) {
    const normalized = filePath.replace(/\\/g, "/");
    if (
      normalized.startsWith("/") ||
      normalized.includes("../") ||
      normalized.includes("/..") ||
      normalized === ".."
    ) {
      throw new Error(`Invalid file path (${filePath}): directory traversal is not permitted.`);
    }

    const ext = normalized.split(".").pop()?.toLowerCase() ?? "";
    if (BINARY_EXTENSIONS.has(ext)) {
      throw new Error(
        `Binary file detected (${filePath}). Only text files are permitted.`
      );
    }

    let size = 0;
    if (typeof content === "string") {
      if (content.includes("\0")) {
        throw new Error(
          `Binary content detected in ${filePath} (contains NUL bytes). Only text files are permitted.`
        );
      }
      size = Buffer.byteLength(content, "utf8");
    } else if (content instanceof Uint8Array) {
      if (content.indexOf(0) !== -1) {
        throw new Error(
          `Binary content detected in ${filePath} (contains NUL bytes). Only text files are permitted.`
        );
      }
      size = content.byteLength;
    } else {
      throw new Error(`Unsupported content type for file ${filePath}.`);
    }

    totalBytes += size;
    if (totalBytes > MAX_SKILL_TOTAL_BYTES) {
      throw new Error(
        `Skill files are too large (${totalBytes} bytes). Total size must not exceed 200 KB (${MAX_SKILL_TOTAL_BYTES} bytes).`
      );
    }
  }
}
