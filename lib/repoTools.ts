import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  GithubApiError,
  RepoFileError,
  downloadRepoTextFiles,
  listRepoTree,
  readRepoFile,
  searchRepoCode,
  type RepoTreeEntry,
} from "./github";

export type RepoRef = { owner: string; name: string; branch: string };

// Sized for the smallest context in use (Bonsai, 32k tokens): a full listing plus one
// long file still leaves room for the conversation.
const MAX_LISTED_FILES = 400;
const MAX_FILE_CHARS = 14_000;
const MAX_SEARCH_HITS = 40;

/** A sentence the model can act on, never a raw API error body. */
function githubErrorText(err: unknown): string {
  if (err instanceof RepoFileError) return err.message;
  if (err instanceof GithubApiError) {
    if (err.status === 401) return "GitHub rejected the sign-in. The user should sign out and sign in again.";
    if (err.status === 403) return "GitHub refused the request (rate limit or missing access). Try again shortly.";
    if (err.status === 404) return "Not found. Check the path with listRepoFiles.";
    if (err.status === 413) return "The repo is too large to search here. Use listRepoFiles and readRepoFile instead.";
    if (err.status === 422) return "GitHub could not run that search. Try a simpler query.";
  }
  return "GitHub did not answer. Try again.";
}

/**
 * Read-only tools over the repo linked to this chat, authorized with the user's own
 * GitHub token. Nothing here writes: pushing stays an explicit action in the UI.
 */
export function createRepoTools(token: string, repo: RepoRef): ToolSet {
  const { owner, name, branch } = repo;
  const full = `${owner}/${name}`;

  // One tree fetch per request, shared by every tool call in the turn.
  let treePromise: Promise<{ entries: RepoTreeEntry[]; truncated: boolean }> | null = null;
  const tree = () => (treePromise ??= listRepoTree(token, owner, name, branch));
  let filesPromise: Promise<Map<string, string>> | null = null;
  const textFiles = () => (filesPromise ??= downloadRepoTextFiles(token, owner, name, branch));

  return {
    listRepoFiles: tool({
      description:
        `List file paths in the connected GitHub repo ${full} (branch ${branch}). ` +
        "Generated folders such as node_modules are left out. Pass a folder to list only that folder.",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Folder to list, for example "app/api". Leave out to list the whole repo.'),
      }),
      execute: async ({ path }) => {
        try {
          const { entries, truncated } = await tree();
          const folder = (path ?? "").replace(/^\/+|\/+$/g, "");
          const matching = folder
            ? entries.filter((e) => e.path.startsWith(`${folder}/`))
            : entries;
          const files = matching.slice(0, MAX_LISTED_FILES).map((e) => e.path);
          return {
            repo: full,
            branch,
            folder: folder || null,
            total: matching.length,
            files,
            truncated: truncated || matching.length > files.length,
          };
        } catch (err) {
          return { error: githubErrorText(err) };
        }
      },
    }),

    readRepoFile: tool({
      description:
        `Read a text file from ${full}. Use listRepoFiles or searchRepo first when unsure of the path. ` +
        "Long files are cut off; pass startLine and endLine to read a specific range.",
      inputSchema: z.object({
        path: z.string().min(1).describe('File path from the repo root, for example "app/page.tsx".'),
        startLine: z.number().int().min(1).optional(),
        endLine: z.number().int().min(1).optional(),
      }),
      execute: async ({ path, startLine, endLine }) => {
        try {
          const text = await readRepoFile(token, owner, name, branch, path);
          const lines = text.split("\n");
          const start = Math.min(startLine ?? 1, Math.max(lines.length, 1));
          const wantedEnd = Math.min(endLine ?? lines.length, lines.length);

          let end = start - 1;
          let chars = 0;
          while (end < wantedEnd && chars + lines[end].length + 1 <= MAX_FILE_CHARS) {
            chars += lines[end].length + 1;
            end += 1;
          }
          // A single line longer than the cap still returns something.
          if (end < start && lines.length > 0) end = start;

          return {
            path,
            totalLines: lines.length,
            startLine: start,
            endLine: end,
            cutOff: end < wantedEnd,
            content: lines.slice(start - 1, end).join("\n").slice(0, MAX_FILE_CHARS),
          };
        } catch (err) {
          return { path, error: githubErrorText(err) };
        }
      },
    }),

    searchRepo: tool({
      description:
        `Search every text file in ${full} for a word, identifier, or phrase (case-insensitive). ` +
        "Returns matching lines as path:line, plus files whose path contains the query.",
      inputSchema: z.object({
        query: z.string().min(2).max(120).describe("What to look for, for example a function name."),
      }),
      execute: async ({ query }) => {
        const needle = query.toLowerCase();
        try {
          const files = await textFiles();
          const matches: { path: string; line: number; text: string }[] = [];
          const matchedFiles = new Set<string>();
          for (const [path, text] of files) {
            const lines = text.split("\n");
            for (let i = 0; i < lines.length && matches.length < MAX_SEARCH_HITS; i++) {
              if (lines[i].toLowerCase().includes(needle)) {
                matches.push({ path, line: i + 1, text: lines[i].trim().slice(0, 200) });
                matchedFiles.add(path);
              }
            }
            if (matches.length >= MAX_SEARCH_HITS) break;
          }
          const pathMatches = [...files.keys()]
            .filter((p) => p.toLowerCase().includes(needle))
            .slice(0, 20);
          return {
            query,
            filesSearched: files.size,
            filesWithMatches: matchedFiles.size,
            matches,
            pathMatches,
            truncated: matches.length >= MAX_SEARCH_HITS,
          };
        } catch (err) {
          // Tarball too large or unavailable: fall back to GitHub code search.
          try {
            const hits = await searchRepoCode(token, owner, name, query);
            return {
              query,
              matches: hits,
              note: "Searched with GitHub code search, which covers the default branch only.",
            };
          } catch {
            return { query, error: githubErrorText(err) };
          }
        }
      },
    }),
  };
}

export function repoSystemPrompt(repo: RepoRef, canRead: boolean): string {
  const full = `${repo.owner}/${repo.name}`;
  if (!canRead) {
    return (
      `\n\nThe user linked the GitHub repo ${full} to this chat, but this session has no GitHub access. ` +
      "Tell them to sign in with GitHub again so you can read it. Do not guess at its contents."
    );
  }
  return (
    `\n\nThe user connected the GitHub repo ${full} (branch ${repo.branch}) to this chat. ` +
    "You can read it with listRepoFiles, readRepoFile, and searchRepo. " +
    'When the user mentions "the repo", "this project", "the code", or anything attached, look at the repo with those tools before answering. ' +
    "Start with listRepoFiles for an overview, then read the files that matter. Never say you cannot see or browse the repo. " +
    "Cite file paths when you explain code."
  );
}
