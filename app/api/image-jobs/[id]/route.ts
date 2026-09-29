import { auth } from "@/auth";
import { canUseBonsai, bonsaiDenied } from "@/lib/access";
import { comfy, friendlyComfyError, isJobId, ComfyError } from "@/lib/comfy";

// Per-user and polled: never cache.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!canUseBonsai(session)) return bonsaiDenied(session, "image editing");

  const { id } = await ctx.params;
  if (!isJobId(id)) return Response.json({ error: "Invalid job id." }, { status: 400 });

  try {
    const state = await comfy().getJob(id);
    // The image itself is fetched separately, so ComfyUI's file names never reach the browser.
    if (state.status === "done") return Response.json({ status: "done" });
    return Response.json(state);
  } catch (err) {
    const status = err instanceof ComfyError && err.code === "rejected" ? 400 : 502;
    return Response.json({ error: friendlyComfyError(err) }, { status });
  }
}
