import { auth } from "@/auth";
import { canUseBonsai, bonsaiDenied } from "@/lib/access";
import { comfy, friendlyComfyError, isJobId, ComfyError } from "@/lib/comfy";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!canUseBonsai(session)) return bonsaiDenied(session, "image editing");

  const { id } = await ctx.params;
  if (!isJobId(id)) return Response.json({ error: "Invalid job id." }, { status: 400 });

  try {
    const image = await comfy().fetchImage(id);
    if (!image) return Response.json({ error: "Image not ready." }, { status: 404 });
    return new Response(image.body, {
      headers: {
        "content-type": image.contentType,
        // Private to the signed-in user. A finished job's image never changes.
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    const status = err instanceof ComfyError && err.code === "rejected" ? 400 : 502;
    return Response.json({ error: friendlyComfyError(err) }, { status });
  }
}
