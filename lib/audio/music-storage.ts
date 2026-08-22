// ============================================================
// lib/audio/music-storage.ts
// Uploads generated background music buffers to Supabase Storage
// using the service-role client. No base64 fallback: if the upload
// fails, the caller must surface a real error, not inline data.
// ============================================================

import { uploadToSupabaseStorage } from "@/lib/supabase-storage";

export async function uploadMusicToStorage(params: {
  audioBuffer: ArrayBuffer;
  contentType: string;
  projectId?: string;
  sceneId: string;
}): Promise<string> {
  const path = `music/${params.projectId || "default"}/${params.sceneId}-${Date.now()}.mp3`;

  const { publicUrl } = await uploadToSupabaseStorage({
    bucket: "audio",
    path,
    body: params.audioBuffer,
    contentType: params.contentType,
  });

  return publicUrl;
}
