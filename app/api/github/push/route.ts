import { auth } from "@/auth";
import { pushFiles } from "@/lib/github";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.githubAccessToken) {
    return Response.json({ error: "Not signed in with GitHub." }, { status: 401 });
  }

  const { owner, repo, branch, files, message } = (await request.json()) as {
    owner?: string;
    repo?: string;
    branch?: string;
    files?: { path: string; content: string }[];
    message?: string;
  };

  if (!owner || !repo || !branch || !files?.length) {
    return Response.json({ error: "Missing owner, repo, branch, or files." }, {
      status: 400,
    });
  }

  try {
    const result = await pushFiles(
      session.githubAccessToken,
      owner,
      repo,
      branch,
      files,
      message?.trim() || "Update from Nimbus"
    );
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Push failed." },
      { status: 502 }
    );
  }
}
