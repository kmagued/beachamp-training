import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that don't require authentication
const publicRoutes = ["/", "/login", "/register", "/verify-email", "/forgot-password", "/reset-password", "/auth/callback", "/admin-setup"];

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
  if (!user && !publicRoutes.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // If authenticated but email not verified, block access to protected routes
  if (user && !user.email_confirmed_at && !publicRoutes.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/verify-email";
    return NextResponse.redirect(url);
  }

  // If user is authenticated and verified
  if (user && user.email_confirmed_at) {
    // Redirect away from login/register/verify-email if already verified
    if (pathname === "/login" || pathname === "/register" || pathname === "/verify-email") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const url = request.nextUrl.clone();

      switch (profile?.role) {
        case "admin":
          url.pathname = "/admin/dashboard";
          break;
        case "coach":
          url.pathname = "/coach/dashboard";
          break;
        default:
          url.pathname = "/player/dashboard";
      }
      return NextResponse.redirect(url);
    }

    // For portal routes, check role access
    if (pathname.startsWith("/admin") || pathname.startsWith("/coach") || pathname.startsWith("/player")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const role = profile?.role || "player";
      const url = request.nextUrl.clone();

      // Admin can access everything
      if (role === "admin") return supabaseResponse;

      // Non-admin users can only access their own portal
      if (role === "coach" && !pathname.startsWith("/coach")) {
        url.pathname = "/coach/dashboard";
        return NextResponse.redirect(url);
      }

      if (role === "player" && !pathname.startsWith("/player")) {
        url.pathname = "/player/dashboard";
        return NextResponse.redirect(url);
      }
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
