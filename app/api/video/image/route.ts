// ============================================================
// app/api/video/image/route.ts
// Next.js API route for visual image generation.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSceneImage } from "@/lib/image/image-service";

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
      sceneId,
      imagePrompt,
      visualPrompt,
      sceneTitle,
      location,
      mood,
      genres,
      existingHash,
      projectId,
      characterNames,
      characterAppearances,
    } = body;

    if (!imagePrompt && !visualPrompt && !sceneTitle) {
      return NextResponse.json(
        { error: "Please provide an image prompt or scene visual description." },
        { status: 400 }
      );
    }

    try {
      const result = await generateSceneImage({
        sceneId: sceneId || `scene-${Date.now()}`,
        imagePrompt,
        visualPrompt,
        sceneTitle,
        location,
        mood,
        genres,
        existingHash,
        projectId,
        characterNames,
        characterAppearances,
      });

      return NextResponse.json({
        success: true,
        imageUrl: result.url,
        prompt: result.prompt,
        hash: result.hash,
        provider: result.provider,
      });
    } catch (error: any) {
      if (error.message === "DUPLICATE") {
        return NextResponse.json({
          success: true,
          duplicate: true,
          hash: existingHash,
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error("Visual image generation error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate image" },
      { status: 500 }
    );
  }
}
