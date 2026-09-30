import { auth } from "@/auth";
import { ingestFiles } from "@/lib/memory";
import { isSupabaseConfigured, supabaseMissing } from "@/lib/supabase";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.githubUserId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) return supabaseMissing();

  const { repo, files } = (await request.json()) as {
    repo?: string;
    files?: { path: string; content: string }[];
  };

  if (!repo || !files?.length) {
    return Response.json({ error: "Missing repo or files." }, { status: 400 });
  }

  try {
    const count = await ingestFiles(session.githubUserId, repo, files);
    return Response.json({ ingested: count });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Ingest failed." },
      { status: 502 }
    );
  }
}
