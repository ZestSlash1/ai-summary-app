import { auth } from "@/auth";
import { isSafeRepoSegment, listRepoTree } from "@/lib/github";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.githubAccessToken) {
    return Response.json({ error: "Not signed in with GitHub." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const branch = searchParams.get("branch");

  if (!owner || !repo || !branch) {
    return Response.json({ error: "Missing owner, repo, or branch parameter." }, { status: 400 });
  }
  if (!isSafeRepoSegment(owner) || !isSafeRepoSegment(repo)) {
    return Response.json({ error: "Invalid owner or repo." }, { status: 400 });
  }

  try {
    const tree = await listRepoTree(session.githubAccessToken, owner, repo, branch);
    return Response.json(tree);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load repository tree." },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.githubAccessToken) {
    return Response.json({ error: "Not signed in with GitHub." }, { status: 401 });
  }

  const { owner, repo, branch } = (await request.json().catch(() => ({}))) as {
    owner?: string;
    repo?: string;
    branch?: string;
  };

  if (!owner || !repo || !branch) {
    return Response.json({ error: "Missing owner, repo, or branch." }, { status: 400 });
  }
  if (!isSafeRepoSegment(owner) || !isSafeRepoSegment(repo)) {
    return Response.json({ error: "Invalid owner or repo." }, { status: 400 });
  }

  try {
    const tree = await listRepoTree(session.githubAccessToken, owner, repo, branch);
    return Response.json(tree);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load repository tree." },
      { status: 502 }
    );
  }
}
