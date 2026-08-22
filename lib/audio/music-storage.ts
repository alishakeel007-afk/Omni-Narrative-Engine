import { createClient } from "@/lib/supabase/server";

export async function uploadMusicToStorage(params: {
  audioBuffer: ArrayBuffer;
  contentType: string;
  projectId?: string;
  sceneId: string;
}): Promise<string> {
  const supabase = await createClient();
  
  try {
    const path = `music/${params.projectId || 'default'}/${params.sceneId}-${Date.now()}.mp3`;
    
    const { data, error } = await supabase
      .storage
      .from('audio')
      .upload(path, params.audioBuffer, {
        contentType: params.contentType,
        upsert: false,
      });
      
    if (error) {
      console.warn("Supabase upload failed, falling back to base64", error);
      return bufferToBase64DataUrl(params.audioBuffer, params.contentType);
    }
    
    const { data: publicData } = supabase
      .storage
      .from('audio')
      .getPublicUrl(path);
      
    return publicData.publicUrl;
  } catch (error) {
    console.warn("Storage upload exception, falling back to base64", error);
    return bufferToBase64DataUrl(params.audioBuffer, params.contentType);
  }
}

function bufferToBase64DataUrl(buffer: ArrayBuffer, contentType: string): string {
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:${contentType};base64,${base64}`;
}
