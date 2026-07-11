import { createBrowserClient } from "@supabase/ssr";

// Browser-safe client — uses the public anon key, respects RLS policies.
// Stores the session in cookies (via @supabase/ssr) so it stays in sync
// with the server-side session used by middleware and Server Components.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
