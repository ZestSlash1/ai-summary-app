import { auth } from "@/auth";
import { createRepo, listUserRepos } from "@/lib/github";

export async function GET() {
  const session = await auth();
  if (!session?.githubAccessToken) {
    return Response.json({ error: "Not signed in with GitHub." }, { status: 401 });
  }

  try {
    const repos = await listUserRepos(session.githubAccessToken);
    return Response.json(
      repos.map((r) => ({
        owner: r.owner.login,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
      }))
    );
  } catch {
    return Response.json({ error: "Failed to list repos." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.githubAccessToken) {
    return Response.json({ error: "Not signed in with GitHub." }, { status: 401 });
  }

  const { name, private: isPrivate } = (await request.json()) as {
    name?: string;
    private?: boolean;
  };
  if (!name?.trim()) {
    return Response.json({ error: "Repo name is required." }, { status: 400 });
  }

  try {
    const repo = await createRepo(
      session.githubAccessToken,
      name.trim(),
      isPrivate ?? true
    );
    return Response.json({
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch,
    });
  } catch {
    return Response.json({ error: "Failed to create repo." }, { status: 502 });
  }
}
