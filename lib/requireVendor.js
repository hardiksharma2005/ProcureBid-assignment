import "server-only";
import { createClient } from "./supabaseServer";
import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Verifies the current request's session belongs to a registered vendor.
 * Server-only: never import this in client components.
 *
 * @returns {Promise<{ id: string, rating: number } | null>} the vendor's
 * row (id, rating) if the caller is a signed-in vendor, else null.
 */
export async function requireVendor() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data: vendor } = await supabaseAdmin
    .from("vendors")
    .select("id, rating")
    .eq("email", user.email.trim().toLowerCase())
    .maybeSingle();

  return vendor ?? null;
}
