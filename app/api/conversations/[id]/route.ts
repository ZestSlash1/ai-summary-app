import { auth } from "@/auth";
import { supabase } from "@/lib/supabase";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/conversations/[id]">
) {
  const session = await auth();
  if (!session?.githubUserId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await ctx.params;

  const body = (await request.json()) as {
    title?: string;
    messages?: unknown;
    model?: string;
    githubRepo?: unknown;
  };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) update.title = body.title;
  if (body.messages !== undefined) update.messages = body.messages;
  if (body.model !== undefined) update.model = body.model;
  if (body.githubRepo !== undefined) update.github_repo = body.githubRepo;

  const { error } = await supabase
    .from("conversations")
    .update(update)
    .eq("id", id)
    .eq("user_id", session.githubUserId);

  if (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/conversations/[id]">
) {
  const session = await auth();
  if (!session?.githubUserId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await ctx.params;

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", session.githubUserId);

  if (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }

  return Response.json({ ok: true });
}
