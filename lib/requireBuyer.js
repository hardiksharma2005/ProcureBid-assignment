import "server-only";
import { createClient } from "./supabaseServer";
import { isBuyerEmail } from "./buyers";

/**
 * Verifies the current request's session belongs to a registered buyer
 * (BUYER_EMAILS). Server-only: never import this in client components.
 *
 * @returns {Promise<string | null>} the signed-in buyer's email, or null if
 * the caller is unauthenticated or not a buyer.
 */
export async function requireBuyer() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  if (!isBuyerEmail(user.email)) {
    return null;
  }

  return user.email;
}
