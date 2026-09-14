export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "code"; language: string; path?: string; content: string };

const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

/** Splits message text on fenced code blocks. Fence info supports the
 * `lang:relative/path` convention used to target a GitHub push. */
export function parseSegments(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    const info = match[1].trim();
    const [language, path] = info.includes(":")
      ? [info.slice(0, info.indexOf(":")), info.slice(info.indexOf(":") + 1)]
      : [info, undefined];
    segments.push({
      type: "code",
      language: language || "text",
      path: path?.trim() || undefined,
      content: match[2].replace(/\n$/, ""),
    });
    lastIndex = FENCE_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }
  return segments;
}

export type DiffRow = {
  old: number | null;
  cur: number | null;
  type: "ctx" | "add" | "del";
  text: string;
};

/** True for content shaped like a unified diff (`---`/`+++`/`@@` markers),
 * the heuristic used to route a code fence through FileDiff instead of a
 * plain code block. */
export function looksLikeUnifiedDiff(content: string): boolean {
  return /^--- /m.test(content) && /^\+\+\+ /m.test(content) && /^@@ /m.test(content);
}

/** Parses a single-file unified diff into FileDiff's {file, rows} shape.
 * Returns null if the hunk header can't be parsed. Multi-file diffs render
 * only the first file's hunks — good enough for the single-patch responses
 * Aro's agent produces. */
export function parseUnifiedDiff(content: string): { file: string; rows: DiffRow[] } | null {
  const lines = content.split("\n");
  let file = "";
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let curLine = 0;
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("+++ ")) {
      file = line.slice(4).replace(/^b\//, "").trim();
      continue;
    }
    if (line.startsWith("--- ")) {
      if (!file) file = line.slice(4).replace(/^a\//, "").trim();
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldLine = parseInt(hunk[1], 10);
      curLine = parseInt(hunk[2], 10);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+")) {
      rows.push({ old: null, cur: curLine++, type: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      rows.push({ old: oldLine++, cur: null, type: "del", text: line.slice(1) });
    } else if (line.startsWith(" ") || line === "") {
      rows.push({ old: oldLine++, cur: curLine++, type: "ctx", text: line.slice(1) });
    }
  }

  return rows.length > 0 ? { file: file || "diff", rows } : null;
}

export type PushableFile = { path: string; content: string };

/** Extracts the path-tagged code blocks across a message's text parts,
 * suitable for pushing to GitHub. Blocks without a path are skipped. */
export function extractPushableFiles(texts: string[]): PushableFile[] {
  const files: PushableFile[] = [];
  for (const text of texts) {
    for (const segment of parseSegments(text)) {
      if (segment.type === "code" && segment.path) {
        files.push({ path: segment.path, content: segment.content });
      }
    }
  }
  return files;
}
