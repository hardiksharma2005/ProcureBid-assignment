import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Records one row in activity_log. Never throws — a logging failure must
 * never break the calling request, so errors are swallowed and only
 * console.error'd. Server-only: never import this in client components.
 *
 * @param {{ rfq_id: string, actor_email?: string|null, actor_role?: string|null, action: string, details?: object|null }} params
 */
export async function logActivity({ rfq_id, actor_email = null, actor_role = null, action, details = null }) {
  try {
    const { error } = await supabaseAdmin.from("activity_log").insert({
      rfq_id,
      actor_email,
      actor_role,
      action,
      details,
    });
    if (error) {
      console.error("Failed to insert activity_log row", { action, rfq_id, error });
    }
  } catch (err) {
    console.error("logActivity threw unexpectedly", { action, rfq_id, err });
  }
}
