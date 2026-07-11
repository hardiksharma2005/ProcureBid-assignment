import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

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
 * @param {string | null | undefined} email
 * @returns {Promise<"buyer" | "vendor" | null>}
 */
export async function getRole(email) {
  if (!email) return null;

  const normalizedEmail = email.trim().toLowerCase();
  const buyerEmail = process.env.BUYER_EMAIL?.trim().toLowerCase();

  if (buyerEmail && normalizedEmail === buyerEmail) {
    return "buyer";
  }

  const { data } = await supabaseAdmin
    .from("vendors")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  return data ? "vendor" : null;
}
