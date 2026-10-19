import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSafeRedirectPath } from '@/lib/auth-redirect'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The only authenticated surfaces: the project list and the four-step film
  // workflow. The story-engine routes that used to be here are gone.
  const protectedRoutes = ['/dashboard', '/film', '/story', '/account'];

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  // getUser() above may have refreshed the session onto supabaseResponse. A
  // redirect that does not carry those cookies forward throws the refreshed
  // tokens away, which is what logs users out at random.
  const redirectKeepingSession = (url: URL) => {
    const response = NextResponse.redirect(url)
    for (const cookie of supabaseResponse.cookies.getAll()) {
      response.cookies.set(cookie.name, cookie.value, cookie)
    }
    return response
  }

  if (isProtectedRoute && !user) {
    // Keep the query string: it carries things like the pending studio entry
    // id, which the visitor would otherwise lose by signing in.
    const target = `${pathname}${request.nextUrl.search}`
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    url.search = ''
    url.searchParams.set('next', target)
    return redirectKeepingSession(url)
  }

  const isAuthRoute = pathname === '/auth' || pathname === '/signup' || pathname === '/forgot-password';

  if (isAuthRoute && user) {
    // Honour where the visitor was heading before being asked to sign in.
    // getSafeRedirectPath rejects off-site and auth-looping targets.
    const target = getSafeRedirectPath(request.nextUrl.searchParams.get('next'))
    const url = request.nextUrl.clone()
    url.search = ''
    const resolved = new URL(target, url)
    url.pathname = resolved.pathname
    url.search = resolved.search
    url.hash = resolved.hash
    return redirectKeepingSession(url)
  }

  return supabaseResponse
}
