import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Broadcasts a "bids_changed" realtime event on the "rfq-{rfqId}" channel
 * with an empty payload — clients that receive it re-fetch their own
 * authorized view instead of trusting anything in the broadcast itself, so
 * no bid data ever travels over this channel. Best-effort: failures are
 * logged, not thrown, since the bid itself is already committed by the
 * time this runs. Server-only: never import in client components.
 *
 * @param {string} rfqId
 */
export async function broadcastBidsChanged(rfqId) {
  const channel = supabaseAdmin.channel(`rfq-${rfqId}`);

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      supabaseAdmin.removeChannel(channel);
      resolve();
    };

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel
          .send({ type: "broadcast", event: "bids_changed", payload: {} })
          .catch((err) => console.error("Failed to send bids_changed broadcast", err))
          .finally(finish);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        finish();
      }
    });

    setTimeout(finish, 5000);
  });
}
