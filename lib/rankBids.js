import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import { computeScoreBreakdown } from "./scoring";

/**
 * Fetches all bids for an RFQ and returns them scored (full breakdown plus
 * vendor name/email) and sorted best-first (highest score first).
 * Server-only: never import in client components — this is the one place
 * allowed to see every vendor's price and identity. Callers that expose
 * this to a vendor-facing route MUST pick only that vendor's own entry and
 * strip vendor_name/vendor_email/other vendors' data before responding —
 * this function itself does no filtering.
 *
 * @param {string} rfqId
 * @param {number} ceilingPriceInr
 * @returns {Promise<Array<{ vendor_id: string, vendor_name: string, vendor_email: string, rating: number, price_inr: number, delivery_days: number, price_component: number, delivery_component: number, rating_component: number, score: number }>>}
 */
export async function getRankedBids(rfqId, ceilingPriceInr) {
  const { data: bids, error } = await supabaseAdmin
    .from("bids")
    .select("vendor_id, price_inr, delivery_days, vendors(name, email, rating)")
    .eq("rfq_id", rfqId);

  if (error) {
    console.error(`Failed to fetch bids for RFQ ${rfqId}`, error);
    return [];
  }

  return bids
    .map((bid) => {
      const breakdown = computeScoreBreakdown({
        price_inr: Number(bid.price_inr),
        ceiling_price_inr: Number(ceilingPriceInr),
        delivery_days: bid.delivery_days,
        max_delivery_days: 60,
        rating: bid.vendors?.rating ?? 0,
      });

      return {
        vendor_id: bid.vendor_id,
        vendor_name: bid.vendors?.name ?? "Unknown vendor",
        vendor_email: bid.vendors?.email ?? null,
        rating: bid.vendors?.rating ?? null,
        price_inr: Number(bid.price_inr),
        delivery_days: bid.delivery_days,
        price_component: breakdown.price,
        delivery_component: breakdown.delivery,
        rating_component: breakdown.rating,
        score: breakdown.total,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Finds a vendor's 1-based rank within an already-sorted (best-first) bid
 * list, along with the total number of bids.
 *
 * @param {Array<{ vendor_id: string }>} rankedBids
 * @param {string} vendorId
 * @returns {{ rank: number | null, total_bids: number }} rank is null if the vendor hasn't bid.
 */
export function findRank(rankedBids, vendorId) {
  const index = rankedBids.findIndex((bid) => bid.vendor_id === vendorId);
  return {
    rank: index === -1 ? null : index + 1,
    total_bids: rankedBids.length,
  };
}
