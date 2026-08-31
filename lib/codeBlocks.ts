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
