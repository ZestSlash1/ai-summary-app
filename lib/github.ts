const API = "https://api.github.com";

class GithubApiError extends Error {}

async function gh<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GithubApiError(
      `GitHub API ${init?.method ?? "GET"} ${path} failed: ${res.status} ${body}`
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
    // Branch has no commits yet (brand-new repo) — create the first commit
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
