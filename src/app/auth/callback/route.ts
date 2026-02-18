import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // We need to create the response after determining the redirect URL,
  // but the cookie setter needs the response object. Use a temp response
  // to exchange the code, then create the final redirect.
  let cookiesToApply: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToApply = cookiesToSet;
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Determine redirect based on role
  const { data: { user } } = await supabase.auth.getUser();
  let redirectPath = "/player/dashboard";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    switch (profile?.role) {
      case "admin":
        redirectPath = "/admin/dashboard";
        break;
      case "coach":
        redirectPath = "/coach/dashboard";
        break;
      default:
        redirectPath = "/player/dashboard";
    }
  }

  const response = NextResponse.redirect(`${origin}${redirectPath}`);

  // Apply the auth cookies to the final response
  cookiesToApply.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
  );

  return response;
}
