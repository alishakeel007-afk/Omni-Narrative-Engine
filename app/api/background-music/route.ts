import { NextResponse } from 'next/server';
import { createClient } from "@/lib/supabase/server";
import { generateSceneMusic } from "@/lib/audio/music-service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const session = user ? { userId: user.id } : null;
    
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { 
      mood, 
      soundDesign, 
      sceneTitle, 
      sceneLocation, 
      narration, 
      estimatedDuration, 
      genres, 
      existingHash, 
      projectId, 
      sceneId 
    } = body;

    try {
      const result = await generateSceneMusic({
        sceneId,
        mood,
        soundDesign,
        sceneTitle,
        sceneLocation,
        narration,
        estimatedDuration,
        genres,
        existingHash,
        projectId
      });

      return NextResponse.json({
        success: true,
        audioUrl: result.url,
        prompt: result.prompt,
        hash: result.hash,
        provider: result.provider
      });
    } catch (error: any) {
      if (error.message === 'DUPLICATE') {
        return NextResponse.json({
          success: true,
          duplicate: true,
          hash: existingHash
        });
      }
      throw error;
    }

  } catch (error: any) {
    console.error("Background music generation error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate music" },
      { status: 500 }
    );
  }
}
