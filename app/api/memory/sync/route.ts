import { auth } from "@/auth";
import { listRepoTextFiles } from "@/lib/github";
import { ingestFiles } from "@/lib/memory";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.githubAccessToken || !session.githubUserId) {
    return Response.json({ error: "Not signed in with GitHub." }, { status: 401 });
  }

  const { owner, repo, branch } = (await request.json()) as {
    owner?: string;
    repo?: string;
    branch?: string;
  };

  if (!owner || !repo || !branch) {
    return Response.json({ error: "Missing owner, repo, or branch." }, { status: 400 });
  }

  try {
    const files = await listRepoTextFiles(
      session.githubAccessToken,
      owner,
      repo,
      branch
    );
    const count = await ingestFiles(
      session.githubUserId,
      `${owner}/${repo}`,
      files
    );
    return Response.json({ ingested: count });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Sync failed." },
      { status: 502 }
    );
  }
}
