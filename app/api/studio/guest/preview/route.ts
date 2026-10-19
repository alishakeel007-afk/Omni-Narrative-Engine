import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  GUEST_COOKIE,
  GUEST_LIFETIME,
  guestCredentials,
  guestPreview,
} from "@/lib/studio/guest";
import { StudioError } from "@/lib/studio/store";
import { clipLengthProblem } from "@/lib/film/duration";
import { generationBlockedReason } from "@/lib/film/language";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * The landing page's Step 2 preview.
 *
 * Runs the product's own script generator against the visitor's idea, so what
 * they see on the public page is the real thing rather than a mock-up. One
 * model call, no GPU, counted against the same three-turn guest allowance.
 */
const schema = z.object({
  idea: z.string().trim().min(10).max(5000),
  sourceScript: z.string().max(24000).optional(),
  assist: z.enum(["guided", "custom"]),
  language: z.enum(["en", "ur"]),
  visualStyle: z.string().trim().max(300).optional(),
  clipSeconds: z.number().positive().max(60).optional(),
  requestId: z.string().uuid(),
});

function failure(error: unknown) {
  const response = NextResponse.json(
    {
      error:
        error instanceof StudioError || error instanceof z.ZodError
          ? error instanceof z.ZodError
            ? error.issues[0]?.message || "Check what you entered."
            : error.message
          : "Your director couldn't draft that. Please try again.",
    },
    {
      status:
        error instanceof StudioError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
  if (
    error &&
    typeof error === "object" &&
    "guestCookie" in error &&
    typeof error.guestCookie === "string" &&
    guestCredentials(error.guestCookie)
  )
    response.cookies.set(GUEST_COOKIE, error.guestCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GUEST_LIFETIME,
    });
  return response;
}

export async function POST(request: NextRequest) {
  // Same-origin only, so another site cannot spend anonymous model turns.
  const host = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    new URL(request.url).host
  )
    .split(",")[0]
    .trim();
  const protocol = (
    request.headers.get("x-forwarded-proto") ||
    new URL(request.url).protocol.replace(":", "")
  )
    .split(",")[0]
    .trim();
  if (request.headers.get("origin") !== `${protocol}://${host}`)
    return NextResponse.json(
      { error: "Open this page on the site to continue." },
      { status: 403 },
    );
  try {
    const input = schema.parse(await request.json());
    // Writing a draft is allowed in any language; only GENERATION is gated. A
    // visitor choosing Urdu still gets their script, and is told plainly that
    // video for it is coming.
    const blocked = generationBlockedReason(input.language);
    const lengthProblem = clipLengthProblem(input.clipSeconds);
    if (lengthProblem) throw new StudioError(lengthProblem);
    const result = await guestPreview(request.cookies.get(GUEST_COOKIE)?.value, input);
    const { cookie, ...data } = result;
    const response = NextResponse.json(
      { ...data, generationBlocked: blocked },
      { headers: { "Cache-Control": "no-store" } },
    );
    if (cookie)
      response.cookies.set(GUEST_COOKIE, cookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: GUEST_LIFETIME,
      });
    return response;
  } catch (error) {
    return failure(error);
  }
}
