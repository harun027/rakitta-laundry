import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/* W02 — refresh the Supabase session cookie on every request so a Route Handler
 * never runs with a token that expired mid-shift. Cookies are HttpOnly/SameSite
 * by Supabase default; we only shuttle them between request and response.
 * Next.js 16 convention: proxy instead of middleware. */

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: CookieToSet[]) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Touching the user is what triggers the refresh; do not remove it.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the public tracking page.
    "/((?!_next/static|_next/image|favicon.ico|t/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
