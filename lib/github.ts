const API = "https://api.github.com";

export class GithubApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function gh<T>(
  token: string | undefined | null,
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GithubApiError(
      `GitHub API ${init?.method ?? "GET"} ${path} failed: ${res.status} ${body}`,
      res.status
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
};

export async function listUserRepos(token: string): Promise<GithubRepo[]> {
  return gh<GithubRepo[]>(
    token,
    "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator"
  );
}

export async function createRepo(
  token: string,
  name: string,
  isPrivate: boolean
): Promise<GithubRepo> {
  return gh<GithubRepo>(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({ name, private: isPrivate, auto_init: true }),
  });
}

export type PushFile = { path: string; content: string };

/**
 * Commits one or more files to a branch as a single atomic commit using the
 * Git Data API (blob -> tree -> commit -> ref), rather than repeated Contents
 * API PUTs which would create one commit per file.
 */
export async function pushFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: PushFile[],
  message: string
): Promise<{ commitUrl: string; commitSha: string }> {
  let parentSha: string | undefined;
  let baseTreeSha: string | undefined;

  try {
    const ref = await gh<{ object: { sha: string } }>(
      token,
      `/repos/${owner}/${repo}/git/ref/heads/${branch}`
    );
    parentSha = ref.object.sha;
    const commit = await gh<{ tree: { sha: string } }>(
      token,
      `/repos/${owner}/${repo}/git/commits/${parentSha}`
    );
    baseTreeSha = commit.tree.sha;
  } catch {
    // Branch has no commits yet (brand-new repo) -- create the first commit
    // with no parent and no base tree.
  }

  const blobs = await Promise.all(
    files.map(async (file) => {
      const blob = await gh<{ sha: string }>(
        token,
        `/repos/${owner}/${repo}/git/blobs`,
        {
          method: "POST",
          body: JSON.stringify({
            content: Buffer.from(file.content, "utf8").toString("base64"),
            encoding: "base64",
          }),
        }
      );
      return { path: file.path, sha: blob.sha };
    })
  );

  const tree = await gh<{ sha: string }>(
    token,
    `/repos/${owner}/${repo}/git/trees`,
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: blobs.map((b) => ({
          path: b.path,
          mode: "100644",
          type: "blob",
          sha: b.sha,
        })),
      }),
    }
  );

  const commit = await gh<{ sha: string; html_url: string }>(
    token,
    `/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: parentSha ? [parentSha] : [],
      }),
    }
  );

  if (parentSha) {
    await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } else {
    await gh(token, `/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  }

  return { commitUrl: commit.html_url, commitSha: commit.sha };
}

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "svg", "woff", "woff2", "ttf",
  "eot", "mp4", "mov", "webm", "mp3", "wav", "zip", "gz", "tar", "pdf",
  "lock",
]);

/** Fetches text file contents from a repo's default branch, for backfilling
 * project memory from files ARO didn't push itself. Skips binary-looking
 * extensions and caps size/count so the embedding job stays bounded. */
export async function listRepoTextFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  options?: { maxFiles?: number; maxBytes?: number }
): Promise<PushFile[]> {
  const maxFiles = options?.maxFiles ?? 150;
  const maxBytes = options?.maxBytes ?? 60000;

  const tree = await gh<{
    tree: { path: string; type: string; sha: string; size?: number }[];
  }>(token, `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);

  const candidates = tree.tree
    .filter((entry) => entry.type === "blob")
    .filter((entry) => {
      const ext = entry.path.split(".").pop()?.toLowerCase() ?? "";
      return !BINARY_EXTENSIONS.has(ext);
    })
    .filter((entry) => !entry.size || entry.size <= maxBytes)
    .slice(0, maxFiles);

  const files = await Promise.all(
    candidates.map(async (entry) => {
      try {
        const blob = await gh<{ content: string; encoding: string }>(
          token,
          `/repos/${owner}/${repo}/git/blobs/${entry.sha}`
        );
        if (blob.encoding !== "base64") return null;
        const buf = Buffer.from(blob.content, "base64");
        const hasNulByte = buf.indexOf(0) !== -1;
        if (hasNulByte) return null;
        return { path: entry.path, content: buf.toString("utf8") };
      } catch {
        return null;
      }
    })
  );

  return files.filter((f): f is PushFile => f !== null);
}

// Folders that are generated or vendored: listing them only wastes the model's context.
const SKIPPED_DIRS =
  /(^|\/)(node_modules|\.git|\.next|\.turbo|\.vercel|dist|build|out|coverage|vendor|__pycache__)(\/|$)/;

export type RepoTreeEntry = { path: string; size?: number };

/** Every file path on a branch, minus generated and vendored folders. */
export async function listRepoTree(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<{ entries: RepoTreeEntry[]; truncated: boolean }> {
  const tree = await gh<{
    tree: { path: string; type: string; size?: number }[];
    truncated: boolean;
  }>(token, `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);

  return {
    entries: tree.tree
      .filter((entry) => entry.type === "blob" && !SKIPPED_DIRS.test(entry.path))
      .map((entry) => ({ path: entry.path, size: entry.size })),
    truncated: tree.truncated,
  };
}

/** Thrown for a path that exists but cannot be read as text (a folder, a binary). */
export class RepoFileError extends Error {}

function decodeText(base64: string): string {
  const buf = Buffer.from(base64, "base64");
  if (buf.indexOf(0) !== -1) throw new RepoFileError("That file is binary, not text.");
  return buf.toString("utf8");
}

/** The text of one file on a branch. Falls back to the blob API for files over 1 MB,
 * which the contents API returns without a body. */
export async function readRepoFile(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string
): Promise<string> {
  const encodedPath = path
    .replace(/^\/+/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const file = await gh<
    { type: string; content?: string; encoding?: string; sha: string } | unknown[]
  >(token, `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);

  if (Array.isArray(file)) {
    throw new RepoFileError("That path is a folder. List it with listRepoFiles instead.");
  }
  if (file.type !== "file") throw new RepoFileError("That path is not a regular file.");
  if (file.encoding === "base64" && file.content) return decodeText(file.content);

  const blob = await gh<{ content: string; encoding: string }>(
    token,
    `/repos/${owner}/${repo}/git/blobs/${file.sha}`
  );
  if (blob.encoding !== "base64") throw new RepoFileError("That file could not be decoded.");
  return decodeText(blob.content);
}

const MAX_TARBALL_BYTES = 25 * 1024 * 1024;
const MAX_GREP_FILE_BYTES = 256 * 1024;

function tarString(block: Buffer, start: number, length: number): string {
  const raw = block.toString("utf8", start, start + length);
  const nul = raw.indexOf("\0");
  return nul === -1 ? raw : raw.slice(0, nul);
}

/** The `path` record from a pax extended header, which tar uses for long file names. */
function paxPath(data: Buffer): string | null {
  let i = 0;
  while (i < data.length) {
    const space = data.indexOf(0x20, i);
    if (space === -1) break;
    const length = parseInt(data.toString("utf8", i, space), 10);
    if (!length) break;
    const record = data.toString("utf8", space + 1, i + length - 1);
    if (record.startsWith("path=")) return record.slice(5);
    i += length;
  }
  return null;
}

/**
 * Every small text file on a branch, from one tarball download: a single request instead of
 * one per file, and it covers any branch (GitHub code search only indexes the default one,
 * and often not private repos at all).
 */
export async function downloadRepoTextFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<Map<string, string>> {
  const { gunzipSync } = await import("node:zlib");
  // The API redirects to a signed codeload URL, so the token is only needed on this hop.
  const res = await fetch(`${API}/repos/${owner}/${repo}/tarball/${encodeURIComponent(branch)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new GithubApiError(`GitHub tarball for ${owner}/${repo} failed: ${res.status}`, res.status);
  }
  const compressed = Buffer.from(await res.arrayBuffer());
  if (compressed.length > MAX_TARBALL_BYTES) {
    throw new GithubApiError(`Repo ${owner}/${repo} is too large to search here.`, 413);
  }
  const tar = gunzipSync(compressed);

  const files = new Map<string, string>();
  let offset = 0;
  let longName: string | null = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const size = parseInt(tarString(header, 124, 12).trim() || "0", 8) || 0;
    const type = String.fromCharCode(header[156]);
    const data = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;

    if (type === "x") {
      longName = paxPath(data);
      continue;
    }
    if (type === "g") continue;
    const fullPath = longName ?? (prefix ? `${prefix}/${name}` : name);
    longName = null;
    if (type !== "0" && type !== "\0") continue;

    // Drop the "owner-repo-sha/" folder GitHub wraps every tarball in.
    const path = fullPath.slice(fullPath.indexOf("/") + 1);
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (!path || SKIPPED_DIRS.test(path) || BINARY_EXTENSIONS.has(ext)) continue;
    if (size > MAX_GREP_FILE_BYTES || data.indexOf(0) !== -1) continue;
    files.set(path, data.toString("utf8"));
  }
  return files;
}

export type CodeSearchHit = { path: string; snippets: string[] };

/** GitHub code search scoped to one repo. Only the default branch is indexed, and new
 * repos can take a while to be indexed, so callers should expect empty results. */
export async function searchRepoCode(
  token: string,
  owner: string,
  repo: string,
  query: string
): Promise<CodeSearchHit[]> {
  const q = `${query} repo:${owner}/${repo}`;
  const result = await gh<{
    items: { path: string; text_matches?: { fragment: string }[] }[];
  }>(token, `/search/code?q=${encodeURIComponent(q)}&per_page=10`, {
    headers: { Accept: "application/vnd.github.text-match+json" },
  });
  return result.items.map((item) => ({
    path: item.path,
    snippets: (item.text_matches ?? []).map((m) => m.fragment).slice(0, 2),
  }));
}
