import { auth } from "@/auth";
import { gh } from "@/lib/github";
import { parseSkillFrontMatter } from "@/lib/skillParser";
import {
  CURATED_SKILL_SOURCES,
  isCuratedSource,
  parseSkillGitHubUrl,
  type CatalogSkill,
} from "@/lib/skillSources";

type CacheEntry = {
  timestamp: number;
  skills: CatalogSkill[];
};

// 10 minutes server side cache
const CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;
const catalogCache = new Map<string, CacheEntry>();

export async function GET(request: Request) {
  const session = await auth();
  const token = session?.githubAccessToken || undefined;

  const { searchParams } = new URL(request.url);
  const rawSource = searchParams.get("source") || "anthropics/skills";
  const branchOverride = searchParams.get("branch");
  const pathOverride = searchParams.get("path");
  const forceRefresh = searchParams.get("refresh") === "1";

  // Resolve source parameters
  let owner = "anthropics";
  let repo = "skills";
  let branch = "main";
  let folderPath = "skills";

  const curated = CURATED_SKILL_SOURCES.find(
    (s) => s.id.toLowerCase() === rawSource.trim().toLowerCase()
  );

  if (curated && curated.owner && curated.repo) {
    owner = curated.owner;
    repo = curated.repo;
    branch = curated.branch;
    folderPath = curated.path;
  } else {
    const parsed = parseSkillGitHubUrl(rawSource);
    if (!parsed) {
      return Response.json(
        { error: "Invalid skill source format. Expected owner/repo or GitHub URL." },
        { status: 400 }
      );
    }
    owner = parsed.owner;
    repo = parsed.repo;
    branch = parsed.branch || "main";
    folderPath = parsed.path;
  }

  if (branchOverride) branch = branchOverride;
  if (pathOverride !== null && pathOverride !== undefined) folderPath = pathOverride;

  const verified = isCuratedSource(owner, repo);
  const cacheKey = `${owner}/${repo}/${branch}/${folderPath}`;

  if (!forceRefresh) {
    const cached = catalogCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CATALOG_CACHE_TTL_MS) {
      return Response.json(
        {
          skills: cached.skills,
          source: { owner, repo, branch, path: folderPath, verified },
          cached: true,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=600, stale-while-revalidate=60",
          },
        }
      );
    }
  }

  try {
    const treeData = await gh<{
      tree: { path: string; type: string; sha: string; size?: number }[];
      truncated: boolean;
    }>(token, `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);

    const entries = treeData.tree || [];

    // Locate candidate SKILL.md files
    const skillMdEntries = entries.filter((e) => {
      if (e.type !== "blob") return false;
      const lower = e.path.toLowerCase();
      if (!lower.endsWith("skill.md")) return false;
      if (folderPath) {
        const normFolder = folderPath.replace(/^\/+|\/+$/g, "");
        return e.path.startsWith(`${normFolder}/`) || e.path === `${normFolder}/SKILL.md`;
      }
      return true;
    });

    // If folderPath yielded zero matches but repo might have skills in root or elsewhere,
    // fallback to any SKILL.md in the repo.
    const finalEntries =
      skillMdEntries.length > 0
        ? skillMdEntries
        : entries.filter((e) => e.type === "blob" && e.path.toLowerCase().endsWith("skill.md"));

    const skills: CatalogSkill[] = await Promise.all(
      finalEntries.map(async (entry) => {
        const fullPath = entry.path;
        let skillFolder = "";
        const lastSlash = fullPath.lastIndexOf("/");
        if (lastSlash !== -1) {
          skillFolder = fullPath.slice(0, lastSlash);
        }

        const segments = skillFolder ? skillFolder.split("/") : [];
        const folderName = segments.length > 0 ? segments[segments.length - 1] : "root";

        let skillName = folderName;
        let skillDescription = "";
        let bodyPreview = "";

        try {
          const blob = await gh<{ content: string; encoding: string }>(
            token,
            `/repos/${owner}/${repo}/git/blobs/${entry.sha}`
          );
          if (blob.encoding === "base64" && blob.content) {
            const rawText = Buffer.from(blob.content, "base64").toString("utf8");
            const parsed = parseSkillFrontMatter(rawText);
            if (parsed.name) skillName = parsed.name;
            if (parsed.description) skillDescription = parsed.description;
            bodyPreview = parsed.body.slice(0, 300);
          }
        } catch {
          // If blob fetch fails, keep folder name fallback
        }

        return {
          id: folderName,
          name: skillName,
          description: skillDescription,
          repo: `${owner}/${repo}`,
          owner,
          branch,
          path: skillFolder,
          verified,
          skillMdPath: fullPath,
          bodyPreview,
        };
      })
    );

    catalogCache.set(cacheKey, {
      timestamp: Date.now(),
      skills,
    });

    return Response.json(
      {
        skills,
        source: { owner, repo, branch, path: folderPath, verified },
        cached: false,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=60",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load skill catalog.";
    const status = (err as { status?: number }).status || 502;
    return Response.json({ error: message }, { status });
  }
}
