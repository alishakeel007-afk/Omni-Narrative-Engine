// ============================================================
// lib/audio/tts-storage.ts
// Uploads generated Deepgram TTS audio to the Supabase "audio" bucket
// using the service-role client. No base64 fallback: if the upload
// fails, the caller must surface a real error, not inline data.
// ============================================================

import { uploadToSupabaseStorage } from "@/lib/supabase-storage";

function extensionForContentType(contentType: string): string {
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("ogg")) return "ogg";
  return "mp3";
}

export async function uploadTtsAudioAssetToStorage(params: {
  audioBuffer: ArrayBuffer;
  contentType: string;
  projectId?: string;
  dialogueId: string;
}): Promise<{ audioUrl: string; storagePath: string }> {
  const extension = extensionForContentType(params.contentType);
  // A generated clip is immutable. A UUID path prevents concurrent character
  // clips (or a narrator and dialogue) from ever sharing an object key.
  const path = `tts/${params.projectId || "default"}/${crypto.randomUUID()}.${extension}`;

  const { publicUrl, storagePath } = await uploadToSupabaseStorage({
    bucket: "audio",
    path,
    body: params.audioBuffer,
    contentType: params.contentType,
  });

  return { audioUrl: publicUrl, storagePath };
}

/** Compatibility helper for existing dialogue TTS callers. */
export async function uploadTtsAudioToStorage(params: {
  audioBuffer: ArrayBuffer;
  contentType: string;
  projectId?: string;
  dialogueId: string;
}): Promise<string> {
  return (await uploadTtsAudioAssetToStorage(params)).audioUrl;
}
