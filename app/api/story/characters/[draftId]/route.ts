import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCharactersForDraft } from "@/lib/story-database";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const session = user ? { userId: user.id } : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { draftId } = await params;

    // Verify the draft belongs to this user
    const draft = await prisma.storyDraft.findFirst({
      where: {
        id: draftId,
        project: { userId: session.userId },
      },
      select: { id: true },
    });

    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const characters = await getCharactersForDraft(draftId);
    return NextResponse.json({ characters });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch characters.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
