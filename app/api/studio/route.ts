import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { createStudio } from "@/lib/studio/store";
import { nativeVideoEnabled } from "@/lib/studio/ltx";
export const runtime = "nodejs";
export async function GET() {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const projects = await prisma.filmWorkspace.findMany({
      where: { userId: user.id },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ projects, capabilities: { nativeVideo: nativeVideoEnabled(), mp4Export: !!process.env.STUDIO_LTX_URL } });
  } catch {
    return NextResponse.json(
      { error: "Could not load projects. Check the database connection." },
      { status: 503 },
    );
  }
}
export async function POST() {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await createStudio(user.id));
  } catch {
    return NextResponse.json(
      { error: "Could not create the project. Check the database connection." },
      { status: 503 },
    );
  }
}
