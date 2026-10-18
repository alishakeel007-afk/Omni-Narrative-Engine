import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadStudio, StudioError } from "@/lib/studio/store";
import {
  changeSceneJob,
  enqueueSceneJob,
  listSceneJobs,
} from "@/lib/studio/scene-jobs";
export const runtime = "nodejs";
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("submit"),
    requestId: z.string().uuid(),
    text: z.string().trim().min(1).max(24000),
    sceneId: z.string().optional(),
    threadId: z.string().optional(),
    parentTakeId: z.string().optional(),
    parentJobId: z.string().optional(),
    kind: z.enum(["chat", "image", "video"]).optional(),
    direct: z.boolean().optional(),
  }),
  z.object({ action: z.enum(["cancel", "retry"]), jobId: z.string().uuid() }),
]);
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof z.ZodError
          ? error.issues[0]?.message
          : error instanceof StudioError
            ? error.message
            : "Scene jobs couldn't be updated. Check the worker and database connection.",
    },
    {
      status:
        error instanceof StudioError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 503,
    },
  );
}
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) throw new StudioError("Unauthorized", 401);
    const id = (await context.params).id;
    const [queue, loaded] = await Promise.all([
      listSceneJobs(user.id, id),
      loadStudio(user.id, id),
    ]);
    return NextResponse.json(
      { ...queue, state: loaded.state },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) throw new StudioError("Unauthorized", 401);
    const id = (await context.params).id;
    const input = schema.parse(await request.json());
    if (input.action === "submit") {
      const job = await enqueueSceneJob(user.id, id, input);
      return NextResponse.json({ job }, { status: 202 });
    }
    await changeSceneJob(user.id, id, input.jobId, input.action);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
