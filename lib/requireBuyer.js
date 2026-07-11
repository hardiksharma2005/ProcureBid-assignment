import "server-only";
import { createClient } from "./supabaseServer";

/**
 * Verifies the current request's session belongs to the buyer (BUYER_EMAIL).
 * Server-only: never import this in client components.
 *
 * @returns {Promise<string | null>} the signed-in buyer's email, or null if
 * the caller is unauthenticated or not the buyer.
 */
export async function requireBuyer() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const buyerEmail = process.env.BUYER_EMAIL?.trim().toLowerCase();
  if (!buyerEmail || user.email.trim().toLowerCase() !== buyerEmail) {
    return null;
  }

  return user.email;
}
