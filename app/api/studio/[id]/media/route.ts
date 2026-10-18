import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadStudio, StudioError } from "@/lib/studio/store";
import { prisma } from "@/lib/prisma";
import type { StudioTake } from "@/types/studio";
import { mediaSource } from "@/lib/studio/ltx";
export const runtime = "nodejs";
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) throw new StudioError("Unauthorized", 401);
    const loaded = await loadStudio(user.id, (await context.params).id);
    const params = new URL(req.url).searchParams;
    const scene = loaded.state.scenes.find(
      (item) => item.id === params.get("sceneId"),
    );
    const messageId = params.get("messageId");
    const jobId = params.get("jobId");
    const job = jobId
      ? await prisma.filmSceneJob.findFirst({
          where: { id: jobId, workspaceId: loaded.project.id, userId: user.id },
        })
      : null;
    const jobTake = (job?.result as { take?: StudioTake } | null)?.take;
    const exportItem = loaded.state.exports?.find(item => item.id === params.get("exportId"));
    if (!scene && !messageId && !jobTake && !exportItem)
      throw new StudioError("Scene not found.", 404);
    const kind = params.get("kind");
    const url =
      exportItem?.url || jobTake?.url ||
      (messageId
        ? loaded.state.messages.find((item) => item.id === messageId)?.image
            ?.url
        : kind === "voice"
          ? scene!.dialogues[Number(params.get("index"))]?.audioUrl
          : kind === "music"
            ? scene!.musicUrl
            : scene!.takes.find((item) => item.id === params.get("takeId"))
                ?.url);
    if (!url) throw new StudioError("Media not ready.", 404);
    const parsed = new URL(url);
    const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;
    if (
      parsed.protocol !== "https:" ||
      !(
        parsed.host === supabaseHost ||
        parsed.hostname.endsWith(".magichour.ai") ||
        parsed.hostname === "magichour.ai"
      )
    )
      throw new StudioError("Media source is not supported.", 400);
    const source = mediaSource(url);
    const headers: Record<string, string> = source.headers;
    if (req.headers.get("range")) headers.Range = req.headers.get("range")!;
    const response = await fetch(source.url, {
      headers,
      signal: AbortSignal.timeout(45000),
      redirect: "error",
    });
    if (!response.ok && response.status !== 206)
      throw new StudioError(
        "Media link expired. Refresh the project's media status.",
        502,
      );
    const outputHeaders: Record<string, string> = {
      "Content-Type":
        response.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    for (const name of ["content-length", "content-range", "accept-ranges"]) {
      const value = response.headers.get(name);
      if (value) outputHeaders[name] = value;
    }
    return new Response(response.body, {
      status: response.status,
      headers: outputHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof StudioError ? error.message : "Media unavailable.",
      },
      { status: error instanceof StudioError ? error.status : 500 },
    );
  }
}
