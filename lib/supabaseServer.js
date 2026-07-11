import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-only client for use in Server Components, Route Handlers, and
// Server Actions. Reads/writes the auth session via Next.js cookies so it
// stays in sync with the browser client and middleware.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // `setAll` was called from a Server Component, where cookies
            // can't be written. Safe to ignore because middleware refreshes
            // the session on every request.
          }
        },
      },
    }
  );
}
