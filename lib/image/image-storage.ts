// ============================================================
// lib/image/image-storage.ts
// Uploads generated image buffers to Supabase Storage using the
// service-role client. No base64 fallback: if the upload fails,
// the caller must surface a real error, not inline data.
// ============================================================

import { uploadToSupabaseStorage } from "@/lib/supabase-storage";

export async function uploadImageToStorage(params: {
  imageBuffer: ArrayBuffer;
  contentType: string;
  projectId?: string;
  sceneId: string;
}): Promise<string> {
  const path = `${params.projectId || "default"}/${params.sceneId}-${Date.now()}.png`;

  const { publicUrl } = await uploadToSupabaseStorage({
    bucket: "images",
    path,
    body: params.imageBuffer,
    contentType: params.contentType,
  });

  return publicUrl;
}
