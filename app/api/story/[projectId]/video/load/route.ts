import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFullVideoStudioState } from "@/lib/story-database";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await loadFullVideoStudioState(projectId, user.id);

  if (!state) {
    return NextResponse.json(
      { error: "Project not found, access denied, or no active draft." },
      { status: 404 }
    );
  }

  return NextResponse.json({ videoStudioState: state }, { status: 200 });
}
