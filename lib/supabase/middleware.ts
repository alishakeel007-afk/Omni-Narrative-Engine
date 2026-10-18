import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth-redirect";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Email links can return to the configured site URL, including /dashboard.
  // Establish the cookie session before checking protected-route access.
  const authCode = request.nextUrl.searchParams.get("code");
  if (authCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(authCode);
    const url = request.nextUrl.clone();
    url.searchParams.delete("code");
    if (error) {
      const next = getSafeRedirectPath(url.pathname + url.search);
      url.pathname = "/auth";
      url.search = "";
      url.searchParams.set("next", next);
      url.searchParams.set(
        "error",
        "This sign-in link expired or could not be verified. Please sign in or request a new link.",
      );
    }
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const protectedRoutes = [
    "/studio",
    "/dashboard",
    "/setup",
    "/story",
    "/audio-generation",
    "/video-preview",
    "/video",
  ];

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  const isAuthRoute =
    pathname === "/auth" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";

  if (isAuthRoute && user) {
    const url = new URL(
      getSafeRedirectPath(request.nextUrl.searchParams.get("next")),
      request.url,
    );
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  return supabaseResponse;
}
