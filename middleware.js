import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { getRole } from "@/lib/getRole";

const PROTECTED_PREFIXES = ["/buyer", "/vendor"];

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() re-validates the token against Supabase Auth (unlike
  // getSession(), which just trusts the local cookie), and also refreshes
  // the session cookie if it's expired.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );

  if (!isProtected) {
    return response;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const role = await getRole(user.email);

  if (path.startsWith("/buyer") && role !== "buyer") {
    const url = request.nextUrl.clone();
    url.pathname = role === "vendor" ? "/vendor" : "/login";
    return NextResponse.redirect(url);
  }

  if (path.startsWith("/vendor") && role !== "vendor") {
    const url = request.nextUrl.clone();
    url.pathname = role === "buyer" ? "/buyer" : "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
