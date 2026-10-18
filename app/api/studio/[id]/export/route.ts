import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadStudio, saveStudio, StudioError } from "@/lib/studio/store";
import { uploadToSupabaseStorage } from "@/lib/supabase-storage";
import { filmContinuityProblem } from "@/lib/studio/identity";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) throw new StudioError("Unauthorized", 401);
    const id = (await context.params).id;
    let loaded = await loadStudio(user.id, id);
    const problem = filmContinuityProblem(loaded.state);
    if (problem) throw new StudioError(problem);
    if (
      loaded.state.operation &&
      Date.now() - Date.parse(loaded.state.operation.startedAt) < 240000
    )
      throw new StudioError(
        "Wait for the current generation submission before saving an export.",
        409,
      );
    const form = await req.formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.type !== "video/webm" ||
      file.size > 100 * 1024 * 1024 ||
      file.size < 100
    )
      throw new StudioError("Choose a WebM export smaller than 100 MB.");
    if ((loaded.state.exports?.length || 0) >= 30)
      throw new StudioError("This project has reached its saved export limit.");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
      throw new StudioError("The export is not a valid WebM file.");
    const exportId = crypto.randomUUID();
    const uploaded = await uploadToSupabaseStorage({
      bucket: process.env.SUPABASE_VIDEO_BUCKET || "generated-videos",
      path: `studio/${id}/exports/${exportId}.webm`,
      body: bytes,
      contentType: "video/webm",
    });
    const item = {
      id: exportId,
      url: uploaded.publicUrl,
      name: `${loaded.state.title}.webm`,
      createdAt: new Date().toISOString(),
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      loaded = await loadStudio(user.id, id);
      const changedProblem = filmContinuityProblem(loaded.state);
      if (changedProblem) throw new StudioError(changedProblem);
      if (
        loaded.state.operation &&
        Date.now() - Date.parse(loaded.state.operation.startedAt) < 240000
      )
        throw new StudioError(
          "Generation is being submitted. Retry saving the export in a moment.",
          409,
        );
      const state = structuredClone(loaded.state);
      state.exports = [...(state.exports || []), item];
      try {
        return NextResponse.json({ state: await saveStudio(loaded, state) });
      } catch (error) {
        if (
          !(error instanceof StudioError) ||
          error.status !== 409 ||
          attempt === 2
        )
          throw error;
      }
    }
    throw new StudioError(
      "Could not save the export. Download your local copy before leaving.",
      503,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof StudioError
            ? error.message
            : "Could not save the export. Your local download is still available.",
      },
      { status: error instanceof StudioError ? error.status : 502 },
    );
  }
}
