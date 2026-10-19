import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSafeRedirectPath } from "@/lib/auth-redirect";

export async function GET(request: NextRequest) {
  const target = getSafeRedirectPath(request.nextUrl.searchParams.get("next"));
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, request.url));
  }
  const recovery = new URL("/auth", request.url);
  recovery.searchParams.set("next", target);
  recovery.searchParams.set("error", "confirmation_expired");
  return NextResponse.redirect(recovery);
}
