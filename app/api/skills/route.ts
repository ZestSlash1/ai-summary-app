import { auth } from "@/auth";
import { isSupabaseConfigured, supabase, supabaseMissing } from "@/lib/supabase";
import { getUserSkills } from "@/lib/skillDiscovery";

export async function GET() {
  const session = await auth();
  if (!session?.githubUserId || !isSupabaseConfigured()) {
    return Response.json({ approved: [], proposed: [] });
  }

  try {
    return Response.json(await getUserSkills(session.githubUserId));
  } catch {
    return Response.json({ approved: [], proposed: [] });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.githubUserId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) return supabaseMissing();

  const { id, status } = (await request.json()) as {
    id?: string;
    status?: string;
  };
  if (!id || (status !== "approved" && status !== "rejected")) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { error } = await supabase
    .from("skills")
    .update({ status })
    .eq("id", id)
    .eq("user_id", session.githubUserId);

  if (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.githubUserId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) return supabaseMissing();

  const { id } = (await request.json()) as { id?: string };
  if (!id) {
    return Response.json({ error: "Missing id." }, { status: 400 });
  }

  const { error } = await supabase
    .from("skills")
    .delete()
    .eq("id", id)
    .eq("user_id", session.githubUserId);

  if (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }
  return Response.json({ ok: true });
}
