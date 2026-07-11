import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Closes any RFQ whose bidding window has expired but is still marked
 * 'open'. Called lazily at the start of vendor-facing routes instead of via
 * a cron job — cheap and idempotent, good enough for MVP scale.
 * Server-only: never import this in client components.
 */
export async function closeExpiredRfqs() {
  const { error } = await supabaseAdmin
    .from("rfqs")
    .update({ status: "closed" })
    .eq("status", "open")
    .lt("window_end", new Date().toISOString());

  if (error) {
    console.error("Failed to close expired RFQs", error);
  }
}
