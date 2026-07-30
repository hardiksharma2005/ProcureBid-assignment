import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import { isBuyerEmail } from "./buyers";

/**
 * Determines a signed-in user's role from their email.
 *
 * Always queries `vendors` with supabaseAdmin (service role), not the
 * caller's session-scoped client — this runs both pre-login (request-link
 * route, where there is no session at all) and post-login (middleware,
 * auth callback), and the RLS policy on `vendors` only grants SELECT to
 * `authenticated`, so a plain anon/session client can't be relied on here
 * consistently. Server-only: never import this in client components.
 *
 * A vendor's status gates which "vendor" role comes back: 'pending' and
 * 'rejected' get their own roles (rather than just "vendor") so callers —
 * middleware, the vendor portal — can route them to a waiting/rejection
 * screen instead of the real RFQ list, without a second lookup.
 *
 * @param {string | null | undefined} email
 * @returns {Promise<"buyer" | "vendor" | "vendor_pending" | "vendor_rejected" | null>}
 */
export async function getRole(email) {
  if (!email) return null;

  const normalizedEmail = email.trim().toLowerCase();

  if (isBuyerEmail(normalizedEmail)) {
    return "buyer";
  }

  const { data } = await supabaseAdmin
    .from("vendors")
    .select("status")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (!data) return null;
  if (data.status === "pending") return "vendor_pending";
  if (data.status === "rejected") return "vendor_rejected";
  return "vendor";
}
