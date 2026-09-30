/**
 * Curated GitHub sources and URL parser for ARO skills.
 */

export type SkillSource = {
  id: string;
  name: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  description: string;
  curated: boolean;
};

export type ParsedSkillUrl = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
};

export type CatalogSkill = {
  id: string;
  name: string;
  description: string;
  repo: string;
  owner: string;
  branch: string;
  path: string;
  verified: boolean;
  skillMdPath: string;
  bodyPreview?: string;
};

export type InstalledSkill = {
  id: string;
  name: string;
  description: string;
  repo: string;
  owner: string;
  branch: string;
  path: string;
  skillMd: string;
  files: Record<string, string>;
  installedAt: number;
  enabled: boolean;
  verified: boolean;
};

export const CURATED_SKILL_SOURCES: SkillSource[] = [
  {
    id: "anthropics/skills",
    name: "Anthropic Skills",
    owner: "anthropics",
    repo: "skills",
    branch: "main",
    path: "skills",
    description: "Official Anthropic skills library",
    curated: true,
  },
  {
    id: "NousResearch/hermes-agent",
    name: "Hermes Agent Skills",
    owner: "NousResearch",
    repo: "hermes-agent",
    branch: "main",
    path: "skills",
    description: "NousResearch Hermes Agent skills collection",
    curated: true,
  },
  {
    id: "user",
    name: "Your repositories",
    owner: "",
    repo: "",
    branch: "main",
    path: "skills",
    description: "Skills located in your connected GitHub repositories",
    curated: true,
  },
];

/**
 * Checks whether an owner and repo match a curated source.
 */
export function isCuratedSource(owner: string, repo: string): boolean {
  const normOwner = owner.trim().toLowerCase();
  const normRepo = repo.trim().toLowerCase();
  return CURATED_SKILL_SOURCES.some(
    (s) =>
      s.owner &&
      s.repo &&
      s.owner.toLowerCase() === normOwner &&
      s.repo.toLowerCase() === normRepo
  );
}

/**
 * Parses GitHub repository or skill URLs into owner, repo, branch, and relative path.
 * Supports:
 * - https://github.com/<owner>/<repo>/tree/<branch>/<path...>
 * - https://github.com/<owner>/<repo>/blob/<branch>/<path...>/SKILL.md
 * - https://github.com/<owner>/<repo>
 * - github.com/<owner>/<repo>/...
 * - <owner>/<repo>
 */
export function parseSkillGitHubUrl(input: string): ParsedSkillUrl | null {
  if (!input || typeof input !== "string") return null;

  const raw = input.trim();
  if (!raw) return null;

  // Normalize scheme and hostname
  const pathPart = raw
    .replace(/^https?:\/\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\/+$/, "");

  // Shorthand owner/repo pattern (e.g. "anthropics/skills" or "owner/repo/tree/main/skills/foo")
  const parts = pathPart.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1];

  // Basic validation on owner and repo characters
  const validIdentifier = /^[a-zA-Z0-9_.-]+$/;
  if (!validIdentifier.test(owner) || !validIdentifier.test(repo)) {
    return null;
  }

  // Root repo URL: owner/repo
  if (parts.length === 2) {
    return {
      owner,
      repo,
      branch: "main",
      path: "",
    };
  }

  // Handle /tree/<branch>/<subpath...> or /blob/<branch>/<subpath...>
  if (parts[2] === "tree" || parts[2] === "blob") {
    if (parts.length === 3) {
      return {
        owner,
        repo,
        branch: "main",
        path: "",
      };
    }
    const branch = parts[3];
    let skillPath = parts.slice(4).join("/");

    // If pointing directly to SKILL.md, strip the file name to get folder path
    if (skillPath.endsWith("/SKILL.md") || skillPath.endsWith("/skill.md")) {
      skillPath = skillPath.slice(0, -"/SKILL.md".length);
    } else if (skillPath.toLowerCase() === "skill.md") {
      skillPath = "";
    }

    return {
      owner,
      repo,
      branch,
      path: skillPath,
    };
  }

  // Arbitrary subpath after owner/repo without explicit tree/blob prefix
  let subpath = parts.slice(2).join("/");
  if (subpath.endsWith("/SKILL.md") || subpath.endsWith("/skill.md")) {
    subpath = subpath.slice(0, -"/SKILL.md".length);
  } else if (subpath.toLowerCase() === "skill.md") {
    subpath = "";
  }

  return {
    owner,
    repo,
    branch: "main",
    path: subpath,
  };
}
