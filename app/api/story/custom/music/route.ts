import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { uploadImportedMusicToStorage } from "@/lib/audio/music-storage";
import { MAX_IMPORTED_MUSIC_BYTES, validateImportedWav, WavValidationError } from "@/lib/audio/wav-validation";
import { deleteFromSupabaseStorage } from "@/lib/supabase-storage";
import { saveOwnedCustomSceneMedia } from "@/lib/custom-story-media";

export const runtime = "nodejs";
const PROVIDER = "Sample-Based Cinematic Score v1";

function isOwnedCustomScene(progressState: unknown, sceneId: string) {
  if (!progressState || typeof progressState !== "object" || Array.isArray(progressState)) return false;
  const custom = (progressState as Record<string, unknown>).customBuilder;
  const state = custom && typeof custom === "object" && !Array.isArray(custom) ? (custom as Record<string, unknown>).state : null;
  const scenes = state && typeof state === "object" && !Array.isArray(state) ? (state as { scenes?: unknown }).scenes : null;
  return Array.isArray(scenes) && scenes.some((scene) => scene && typeof scene === "object" && (scene as { id?: unknown }).id === sceneId);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const form = await request.formData();
    const projectId = form.get("projectId"); const draftId = form.get("draftId"); const sceneId = form.get("sceneId"); const sceneNumber = form.get("sceneNumber"); const file = form.get("file");
    if (typeof projectId !== "string" || typeof draftId !== "string" || typeof sceneId !== "string" || typeof sceneNumber !== "string" || !/^\d+$/.test(sceneNumber) || !(file instanceof File)) {
      return NextResponse.json({ error: "A saved Custom project, scene, and WAV score are required." }, { status: 400 });
    }
    if (file.size > MAX_IMPORTED_MUSIC_BYTES) return NextResponse.json({ error: "Music files must be 25 MB or smaller." }, { status: 413 });
    const draft = await prisma.storyDraft.findFirst({ where: { id: draftId, storyProjectId: projectId, isActive: true, project: { userId: user.id } }, select: { progressState: true } });
    if (!draft || !isOwnedCustomScene(draft.progressState, sceneId)) return NextResponse.json({ error: "Custom scene not found or access denied." }, { status: 404 });
    const audioBuffer = await file.arrayBuffer(); const wav = validateImportedWav(audioBuffer);
    const uploaded = await uploadImportedMusicToStorage({ audioBuffer, projectId, sceneNumber: Number(sceneNumber) });
    const saved = await saveOwnedCustomSceneMedia({
      draftId,
      projectId,
      sceneId,
      userId: user.id,
      patch: {
        backgroundMusicProvider: PROVIDER,
        backgroundMusicStatus: "ready",
        backgroundMusicUrl: uploaded.publicUrl,
      },
    }).catch(() => false);
    if (!saved) {
      // This path was created by this request under the already-verified
      // project ID. Cleaning it up cannot touch existing project media.
      await deleteFromSupabaseStorage({ bucket: "audio", path: uploaded.storagePath.replace(/^audio\//, "") }).catch(() => undefined);
      return NextResponse.json({ error: "Could not attach the score to this Custom project. No score was saved." }, { status: 409 });
    }
    return NextResponse.json({ success: true, audioUrl: uploaded.publicUrl, provider: PROVIDER, durationSeconds: wav.durationSeconds });
  } catch (error) {
    const message = error instanceof WavValidationError ? error.message : "Unable to save the cinematic score. Please try again.";
    return NextResponse.json({ error: message }, { status: error instanceof WavValidationError ? 400 : 500 });
  }
}
