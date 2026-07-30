import "server-only";
import { createClient } from "./supabaseServer";
import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Verifies the current request's session belongs to an approved vendor.
 * Pending/rejected vendors deliberately fall through to null here — this is
 * the gate that keeps them out of every vendor API (RFQ list, bid
 * submission) even though they have a valid session. Server-only: never
 * import this in client components.
 *
 * @returns {Promise<{ id: string, name: string, email: string, rating: number } | null>} the vendor's
 * row (id, name, email, rating) if the caller is a signed-in, approved vendor, else null.
 */
export async function requireVendor() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data: vendor } = await supabaseAdmin
    .from("vendors")
    .select("id, name, email, rating")
    .eq("email", user.email.trim().toLowerCase())
    .eq("status", "approved")
    .maybeSingle();

  return vendor ?? null;
}
