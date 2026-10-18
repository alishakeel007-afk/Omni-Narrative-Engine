import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  GUEST_COOKIE,
  GUEST_LIFETIME,
  GUEST_LIMIT,
  guestCredentials,
  guestTurn,
  guestView,
  loadGuest,
} from "@/lib/studio/guest";
import { EMPTY_STUDIO } from "@/types/studio";
import { StudioError } from "@/lib/studio/store";

export const runtime = "nodejs";
export const maxDuration = 180;
const schema = z.object({
  text: z.string().trim().min(1).max(24000),
  tab: z.enum(["plan", "scenes", "assemble"]),
  requestId: z.string().uuid(),
  mode: z.enum(["discover", "develop"]).optional(),
});
function setCookie(response: NextResponse, cookie: string) {
  response.cookies.set(GUEST_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_LIFETIME,
  });
}
function failure(error: unknown) {
  const response = NextResponse.json(
    {
      error:
        error instanceof StudioError || error instanceof z.ZodError
          ? error.message
          : "Your director couldn't reply. Please try again.",
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
    setCookie(response, error.guestCookie);
  return response;
}
export async function GET(request: NextRequest) {
  try {
    const loaded = await loadGuest(request.cookies.get(GUEST_COOKIE)?.value);
    return NextResponse.json(
      loaded
        ? guestView(loaded.project.id, loaded.state)
        : {
            id: null,
            state: EMPTY_STUDIO,
            remaining: GUEST_LIMIT,
            limit: GUEST_LIMIT,
          },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  // Prevent cross-site forms from spending anonymous model turns.
  // Next's internal URL may use localhost behind a loopback/proxy host.
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
      { error: "Open the studio on this site to continue." },
      { status: 403 },
    );
  try {
    const result = await guestTurn(
      request.cookies.get(GUEST_COOKIE)?.value,
      schema.parse(await request.json()),
    );
    const { cookie, ...data } = result;
    const response = NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
    if (cookie) setCookie(response, cookie);
    return response;
  } catch (error) {
    return failure(error);
  }
}
