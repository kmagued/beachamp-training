import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  VIEW_COOKIE,
  VIEW_COOKIE_OPTIONS,
  accountOf,
  homePath,
  portalOfPath,
  portalsFor,
  viewToRemember,
} from "@/lib/auth/portals";

// Routes that don't require authentication
const publicRoutes = ["/", "/login", "/register", "/verify-email", "/forgot-password", "/reset-password", "/auth/callback", "/admin-setup"];

/** Public routes, plus coach invite links (/invite/<token>) */
function isPublic(pathname: string): boolean {
  return publicRoutes.includes(pathname) || pathname.startsWith("/invite/");
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          );
        },
      },
    }
  );

  // Refresh the auth session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // If user is not authenticated and trying to access a protected route
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // If authenticated but email not verified, block access to protected routes
  if (user && !user.email_confirmed_at && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/verify-email";
    return NextResponse.redirect(url);
  }

  // If user is authenticated and verified
  if (user && user.email_confirmed_at) {
    // The view a player who coaches used last on this device
    const lastView = request.cookies.get(VIEW_COOKIE)?.value;

    // Redirect away from login/register/verify-email if already verified
    if (pathname === "/login" || pathname === "/register" || pathname === "/verify-email") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_coach, is_player")
        .eq("id", user.id)
        .single();

      const url = request.nextUrl.clone();
      url.pathname = homePath(accountOf(profile), lastView);
      return NextResponse.redirect(url);
    }

    // Portal routes: remember the view of an account that has two, then check access
    // (access is skipped in dev mode for portal switching)
    if (pathname.startsWith("/admin") || pathname.startsWith("/coach") || pathname.startsWith("/player")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_coach, is_player")
        .eq("id", user.id)
        .single();

      const account = accountOf(profile);
      const view = viewToRemember(account, pathname, lastView, request.headers);
      if (view) supabaseResponse.cookies.set(VIEW_COOKIE, view, VIEW_COOKIE_OPTIONS);

      if (process.env.NODE_ENV === "development") return supabaseResponse;

      // Admin can access everything
      if (account.role === "admin") return supabaseResponse;

      // Everyone else opens only the views their account has (a player who coaches has two).
      // Anything else under these prefixes, like /admin-setup, still bounces non-admins home.
      const portal = portalOfPath(pathname);
      if (portal && portalsFor(account).includes(portal)) return supabaseResponse;

      const url = request.nextUrl.clone();
      url.pathname = homePath(account, lastView);
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
