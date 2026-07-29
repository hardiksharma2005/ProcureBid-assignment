import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Closes any RFQ whose bidding window has expired but is still marked
 * 'open'. Called lazily at the start of vendor-facing routes instead of via
 * a cron job — cheap and idempotent, good enough for MVP scale.
 * Server-only: never import this in client components.
 */
export async function closeExpiredRfqs() {
  // Paused RFQs are frozen — never auto-close one while paused_at is set,
  // even if window_end is already in the past. Resume is what un-freezes it.
  const { error } = await supabaseAdmin
    .from("rfqs")
    .update({ status: "closed" })
    .eq("status", "open")
    .is("paused_at", null)
    .lt("window_end", new Date().toISOString());

  if (error) {
    console.error("Failed to close expired RFQs", error);
  }
}
