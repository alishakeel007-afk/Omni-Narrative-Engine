import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFullDraftState } from "@/lib/story-database";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Load + ownership check in one query (loadFullDraftState handles both)
  const storyState = await loadFullDraftState(projectId, user.id);

  if (!storyState) {
    return NextResponse.json(
      { error: "Project not found, access denied, or no active draft." },
      { status: 404 }
    );
  }

  return NextResponse.json({ storyState }, { status: 200 });
}
