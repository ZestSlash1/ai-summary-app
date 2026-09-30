import { auth } from "@/auth";
import { gh, isSafeRepoSegment } from "@/lib/github";
import { parseSkillFrontMatter, validateSkillFiles } from "@/lib/skillParser";
import {
  isCuratedSource,
  parseSkillGitHubUrl,
  type InstalledSkill,
} from "@/lib/skillSources";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const session = await auth();
  const token = session?.githubAccessToken || undefined;

  const body = (await request.json().catch(() => ({}))) as {
    repo?: string;
    path?: string;
    ref?: string;
    url?: string;
  };

  let owner = "";
  let repoName = "";
  let branch = body.ref || "main";
  let skillPath = body.path || "";

  if (body.url) {
    const parsed = parseSkillGitHubUrl(body.url);
    if (!parsed) {
      return Response.json({ error: "Invalid GitHub URL." }, { status: 400 });
    }
    owner = parsed.owner;
    repoName = parsed.repo;
    branch = body.ref || parsed.branch || "main";
    skillPath = body.path || parsed.path || "";
  } else if (body.repo) {
    const parts = body.repo.split("/").filter(Boolean);
    if (parts.length !== 2) {
      return Response.json(
        { error: "Invalid repo format. Expected owner/repo." },
        { status: 400 }
      );
    }
    owner = parts[0];
    repoName = parts[1];
  } else {
    return Response.json(
      { error: "Missing required repo or url parameter." },
      { status: 400 }
    );
  }

  if (!isSafeRepoSegment(owner) || !isSafeRepoSegment(repoName)) {
    return Response.json({ error: "Invalid owner or repo name." }, { status: 400 });
  }

  const normalizedSkillPath = skillPath.replace(/^\/+|\/+$/g, "");

  try {
    const treeData = await gh<{
      tree: { path: string; type: string; sha: string; size?: number }[];
      truncated?: boolean;
    }>(token, `/repos/${owner}/${repoName}/git/trees/${encodeURIComponent(branch)}?recursive=1`);

    // A huge repo comes back cut off, and a skill in the missing part would look like it does
    // not exist. Say so instead of reporting "No SKILL.md found".
    if (treeData.truncated) {
      return Response.json(
        { error: "This repository is too large to scan for skills. Point at a folder with a full GitHub URL." },
        { status: 422 }
      );
    }

    const entries = treeData.tree || [];

    // Filter files in this skill folder
    const skillEntries = entries.filter((e) => {
      if (e.type !== "blob") return false;
      if (!normalizedSkillPath) {
        // If skill is in root of repo
        return !e.path.includes("/") || e.path.toLowerCase() === "skill.md";
      }
      return (
        e.path === normalizedSkillPath ||
        e.path.startsWith(`${normalizedSkillPath}/`)
      );
    });

    // SKILL.md must sit at the top of the skill folder (or be the file itself). Accepting one
    // anywhere below let a folder with no real skill install as an empty one.
    const rootSkillMd = normalizedSkillPath ? `${normalizedSkillPath.toLowerCase()}/skill.md` : "skill.md";
    const hasSkillMd = skillEntries.some((e) => {
      const lower = e.path.toLowerCase();
      return lower === rootSkillMd || (lower === normalizedSkillPath.toLowerCase() && lower.endsWith("skill.md"));
    });

    if (!hasSkillMd) {
      return Response.json(
        {
          error: `No SKILL.md found in repository path '${normalizedSkillPath || "root"}'.`,
        },
        { status: 400 }
      );
    }

    // Pre-calculate declared sizes
    let estimatedSize = 0;
    for (const entry of skillEntries) {
      if (entry.size) estimatedSize += entry.size;
    }
    if (estimatedSize > 200 * 1024) {
      return Response.json(
        {
          error: `Skill files exceed the 200 KB maximum size limit (${estimatedSize} bytes).`,
        },
        { status: 413 }
      );
    }

    // Download files in parallel
    const files: Record<string, string> = {};

    await Promise.all(
      skillEntries.map(async (entry) => {
        const blob = await gh<{ content: string; encoding: string }>(
          token,
          `/repos/${owner}/${repoName}/git/blobs/${entry.sha}`
        );
        if (blob.encoding !== "base64" || !blob.content) {
          throw new Error(`Unable to decode content for file: ${entry.path}`);
        }

        const buf = Buffer.from(blob.content, "base64");
        if (buf.indexOf(0) !== -1) {
          throw new Error(
            `Binary content detected in ${entry.path}. Only text files are permitted.`
          );
        }

        let relativePath = entry.path;
        if (normalizedSkillPath && relativePath.startsWith(`${normalizedSkillPath}/`)) {
          relativePath = relativePath.slice(normalizedSkillPath.length + 1);
        } else if (normalizedSkillPath && relativePath === normalizedSkillPath) {
          relativePath = "SKILL.md";
        }

        files[relativePath] = buf.toString("utf8");
      })
    );

    // Validate size and text safety guards
    validateSkillFiles(files);

    // Locate SKILL.md key
    const skillMdKey =
      Object.keys(files).find((k) => k.toLowerCase() === "skill.md") || "SKILL.md";
    const skillMdContent = files[skillMdKey] || "";

    const parsed = parseSkillFrontMatter(skillMdContent);
    const skillName =
      parsed.name ||
      normalizedSkillPath.split("/").pop() ||
      repoName ||
      "unnamed-skill";
    const skillDescription = parsed.description || "";
    const verified = isCuratedSource(owner, repoName);

    const safeId = `${owner}/${repoName}/${normalizedSkillPath || skillName}`
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .toLowerCase();

    const installedSkill: InstalledSkill = {
      id: safeId,
      name: skillName,
      description: skillDescription,
      repo: `${owner}/${repoName}`,
      owner,
      branch,
      path: normalizedSkillPath,
      skillMd: skillMdContent,
      files,
      installedAt: Date.now(),
      enabled: true,
      verified,
    };

    // Store in Supabase if configured and user is signed in
    let storedInDb = false;
    if (isSupabaseConfigured() && session?.githubUserId) {
      try {
        // onConflict matches the unique (user_id, skill_id) in schema.sql, so reinstalling
        // updates the row. Without it every reinstall added a duplicate.
        const { error } = await supabase.from("installed_skills").upsert(
          {
            user_id: session.githubUserId,
            skill_id: installedSkill.id,
            name: installedSkill.name,
            description: installedSkill.description,
            repo: installedSkill.repo,
            path: installedSkill.path,
            branch: installedSkill.branch,
            files: installedSkill.files,
            enabled: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,skill_id" }
        );
        if (!error) storedInDb = true;
      } catch {
        // Fall back to client storage
      }
    }

    return Response.json({
      ok: true,
      skill: installedSkill,
      storage: storedInDb ? "database" : "client",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to install skill.";
    const status = (err as { status?: number }).status || 500;
    return Response.json({ error: message }, { status });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.githubUserId || !isSupabaseConfigured()) {
    return Response.json({ skills: [], storage: "client" });
  }

  try {
    const { data, error } = await supabase
      .from("installed_skills")
      .select("*")
      .eq("user_id", session.githubUserId)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ skills: [], storage: "client" });
    }

    return Response.json({
      skills: (data || []).map((row) => ({
        id: row.skill_id,
        name: row.name,
        description: row.description,
        repo: row.repo,
        path: row.path,
        branch: row.branch,
        files: row.files,
        enabled: row.enabled ?? true,
      })),
      storage: "database",
    });
  } catch {
    return Response.json({ skills: [], storage: "client" });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  const body = (await request.json().catch(() => ({}))) as { skillId?: string };

  if (!body.skillId) {
    return Response.json({ error: "Missing skillId parameter." }, { status: 400 });
  }

  if (isSupabaseConfigured() && session?.githubUserId) {
    try {
      await supabase
        .from("installed_skills")
        .delete()
        .eq("skill_id", body.skillId)
        .eq("user_id", session.githubUserId);
    } catch {
      // Handled on client
    }
  }

  return Response.json({ ok: true, skillId: body.skillId });
}

export async function PATCH(request: Request) {
  const session = await auth();
  const body = (await request.json().catch(() => ({}))) as {
    skillId?: string;
    enabled?: boolean;
  };

  if (!body.skillId || typeof body.enabled !== "boolean") {
    return Response.json(
      { error: "Missing skillId or enabled boolean." },
      { status: 400 }
    );
  }

  if (isSupabaseConfigured() && session?.githubUserId) {
    try {
      await supabase
        .from("installed_skills")
        .update({ enabled: body.enabled })
        .eq("skill_id", body.skillId)
        .eq("user_id", session.githubUserId);
    } catch {
      // Handled on client
    }
  }

  return Response.json({ ok: true, skillId: body.skillId, enabled: body.enabled });
}
