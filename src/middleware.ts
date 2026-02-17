import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that don't require authentication
const publicRoutes = ["/", "/login", "/register"];

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
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
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

  // If user is authenticated and trying to access login/register
  if (user && (pathname === "/login" || pathname === "/register")) {
    // Fetch their role and redirect accordingly
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

  // Role-based route protection
  if (user && (pathname.startsWith("/admin") || pathname.startsWith("/coach") || pathname.startsWith("/player"))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role || "player";
    const url = request.nextUrl.clone();

    // Admin can access everything
    if (role === "admin") return supabaseResponse;

    // Coach can only access /coach routes
    if (pathname.startsWith("/admin") && role !== "admin") {
      url.pathname = role === "coach" ? "/coach/dashboard" : "/player/dashboard";
      return NextResponse.redirect(url);
    }

    // Player can only access /player routes
    if (pathname.startsWith("/coach") && role === "player") {
      url.pathname = "/player/dashboard";
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
