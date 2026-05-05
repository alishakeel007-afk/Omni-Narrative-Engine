import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      // Silently skip — don't block user action if not logged in
      return NextResponse.json({ ok: false });
    }

    const body = await request.json();
    const { activityType, metadata } = body || {};

    if (!activityType || typeof activityType !== "string") {
      return NextResponse.json({ error: "activityType is required" }, { status: 400 });
    }

    await prisma.userActivity.create({
      data: {
        userId: session.userId as string,
        activityType: activityType.trim(),
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Never let activity logging crash the user experience
    const message = error instanceof Error ? error.message : "Activity log failed";
    console.error("[activity] Failed to log:", message);
    return NextResponse.json({ ok: false });
  }
}
