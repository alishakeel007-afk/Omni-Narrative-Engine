import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteFromSupabaseStorage } from "@/lib/supabase-storage";
import { uploadImportedMusicToStorage } from "@/lib/audio/music-storage";
import { MAX_IMPORTED_MUSIC_BYTES, validateImportedWav, WavValidationError } from "@/lib/audio/wav-validation";
import { getOwnedSceneMediaTarget, replaceSceneMusic } from "@/lib/story-database";

export const runtime = "nodejs";
const PROVIDER = "Sample-Based Cinematic Score v1";
function sceneNumberFrom(value: FormDataEntryValue | null) { if (typeof value !== "string" || !/^\d+$/.test(value)) return null; const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null; }
function descriptionFrom(value: FormDataEntryValue | null) { return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1_000) || "Scene-aware sample-based instrumental score." : "Scene-aware sample-based instrumental score."; }

export async function POST(request: Request) {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const form = await request.formData(); const draftId = form.get("draftId"); const sceneNumber = sceneNumberFrom(form.get("sceneNumber")); const file = form.get("file");
    if (typeof draftId !== "string" || !draftId || !sceneNumber) return NextResponse.json({ error: "A saved draft and valid scene number are required." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "A generated WAV file is required." }, { status: 400 });
    if (file.size > MAX_IMPORTED_MUSIC_BYTES) return NextResponse.json({ error: "Music files must be 25 MB or smaller." }, { status: 413 });
    const target = await getOwnedSceneMediaTarget(draftId, sceneNumber, user.id); if (!target) return NextResponse.json({ error: "Saved scene not found or access denied." }, { status: 404 });
    const audioBuffer = await file.arrayBuffer(); const wav = validateImportedWav(audioBuffer); const uploaded = await uploadImportedMusicToStorage({ audioBuffer, projectId: target.draft.storyProjectId, sceneNumber });
    try { if (!await replaceSceneMusic(draftId, sceneNumber, { url: uploaded.publicUrl, storagePath: uploaded.storagePath, provider: PROVIDER, prompt: descriptionFrom(form.get("description")) })) throw new Error("The saved scene could not be found."); }
    catch (error) { await deleteFromSupabaseStorage({ bucket: "audio", path: uploaded.storagePath.replace(/^audio\//, "") }).catch(() => undefined); throw error; }
    return NextResponse.json({ success: true, audioUrl: uploaded.publicUrl, provider: PROVIDER, durationSeconds: wav.durationSeconds });
  } catch (error) { const message = error instanceof WavValidationError ? error.message : "Unable to save the cinematic score. Please try again."; return NextResponse.json({ error: message }, { status: error instanceof WavValidationError ? 400 : 500 }); }
}
