// ============================================================
// lib/image/image-storage.ts
// Handles uploading generated image buffers to Supabase Storage,
// with safe fallback to Base64 Data URLs.
// ============================================================

import { createClient } from "@/lib/supabase/server";

export async function uploadImageToStorage(params: {
  imageBuffer: ArrayBuffer;
  contentType: string;
  projectId?: string;
  sceneId: string;
}): Promise<string> {
  try {
    const supabase = await createClient();
    const path = `images/${params.projectId || "default"}/${params.sceneId}-${Date.now()}.png`;

    const { data, error } = await supabase.storage
      .from("images")
      .upload(path, params.imageBuffer, {
        contentType: params.contentType,
        upsert: false,
      });

    if (error) {
      console.warn("Supabase image bucket upload skipped or failed, using base64 fallback:", error.message);
      return bufferToBase64DataUrl(params.imageBuffer, params.contentType);
    }

    const { data: publicData } = supabase.storage
      .from("images")
      .getPublicUrl(path);

    return publicData.publicUrl;
  } catch (error) {
    console.warn("Storage upload exception, using base64 fallback");
    return bufferToBase64DataUrl(params.imageBuffer, params.contentType);
  }
}

function bufferToBase64DataUrl(buffer: ArrayBuffer, contentType: string): string {
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${contentType};base64,${base64}`;
}
