import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { claimGuest, GUEST_COOKIE } from "@/lib/studio/guest";
import { StudioError } from "@/lib/studio/store";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Sign in to continue." },
        { status: 401 },
      );
    const { id } = z
      .object({ id: z.string().uuid().optional() })
      .parse(await request.json());
    const claimed = await claimGuest(
      user.id,
      request.cookies.get(GUEST_COOKIE)?.value,
      id,
    );
    const response = NextResponse.json(claimed || { id: null }, {
      headers: { "Cache-Control": "no-store" },
    });
    if (claimed)
      response.cookies.set(GUEST_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof StudioError
            ? error.message
            : "Could not continue your trial. Please try again.",
      },
      { status: error instanceof StudioError ? error.status : 400 },
    );
  }
}
