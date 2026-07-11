import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only client — uses the service role key, bypasses RLS.
// Never import this in client components; it must only be used in
// server-side code (route handlers, server actions, etc.). The
// "server-only" import above makes any accidental client-side import
// fail at build time instead of throwing at runtime in the browser.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
