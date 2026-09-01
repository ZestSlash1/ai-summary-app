import { auth } from "@/auth";
import { supabase } from "@/lib/supabase";
import { DEFAULT_MODEL } from "@/lib/types";

export async function GET() {
  const session = await auth();
  if (!session?.githubUserId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

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
    }))
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.githubUserId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    model?: string;
  };

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: session.githubUserId,
      title: "New chat",
      model: body.model || DEFAULT_MODEL,
      messages: [],
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
  });
}
