import { auth } from "@/auth";
import { isSupabaseConfigured, supabase, supabaseMissing } from "@/lib/supabase";
import { FALLBACK_MODEL } from "@/lib/types";

export async function GET() {
  const session = await auth();
  if (!session?.githubUserId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return supabaseMissing();

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", session.githubUserId)
    .order("updated_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }

  return Response.json(
    data.map((row) => ({
      id: row.id,
      title: row.title,
      messages: row.messages,
      model: row.model,
      createdAt: new Date(row.created_at).getTime(),
      githubRepo: row.github_repo ?? undefined,
      mode: row.mode ?? "chat",
    }))
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.githubUserId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) return supabaseMissing();

  const body = (await request.json().catch(() => ({}))) as {
    model?: string;
    mode?: "chat" | "code";
    title?: string;
  };

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: session.githubUserId,
      title: body.title || (body.mode === "code" ? "New coding session" : "New chat"),
      model: body.model || FALLBACK_MODEL,
      messages: [],
      ...(body.mode ? { mode: body.mode } : {}),
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }

  return Response.json({
    id: data.id,
    title: data.title,
    messages: data.messages,
    model: data.model,
    createdAt: new Date(data.created_at).getTime(),
    githubRepo: data.github_repo ?? undefined,
    mode: data.mode ?? body.mode ?? "chat",
  });
}
