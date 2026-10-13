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

export async function uploadTtsAudioToStorage(params: {
  audioBuffer: ArrayBuffer;
  contentType: string;
  projectId?: string;
  dialogueId: string;
}): Promise<string> {
  const extension = extensionForContentType(params.contentType);
  const path = `tts/${params.projectId || "default"}/${params.dialogueId}-${Date.now()}.${extension}`;

  const { publicUrl } = await uploadToSupabaseStorage({
    bucket: "audio",
    path,
    body: params.audioBuffer,
    contentType: params.contentType,
  });

  return publicUrl;
}
