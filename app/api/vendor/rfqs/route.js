import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireVendor } from "@/lib/requireVendor";
import { closeExpiredRfqs } from "@/lib/closeExpired";
import { getRankedBids, findRank } from "@/lib/rankBids";

const RFQ_FIELDS = "id, material, quantity_kg, ceiling_price_inr, description, status, window_end";

export async function GET() {
  const vendor = await requireVendor();
  if (!vendor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await closeExpiredRfqs();

  const { data: openRfqs, error: openError } = await supabaseAdmin
    .from("rfqs")
    .select(RFQ_FIELDS)
    .eq("status", "open")
    .order("window_end", { ascending: true });

  if (openError) {
    console.error("Failed to fetch open RFQs", openError);
    return NextResponse.json({ error: "Failed to fetch RFQs." }, { status: 500 });
  }

  const openResults = await Promise.all(
    openRfqs.map(async (rfq) => {
      const rankedBids = await getRankedBids(rfq.id, rfq.ceiling_price_inr);
      const myBid = rankedBids.find((bid) => bid.vendor_id === vendor.id);

      if (!myBid) {
        return { ...rfq, has_bid: false, vendor_rating: vendor.rating };
      }

      const { rank, total_bids } = findRank(rankedBids, vendor.id);

      return {
        ...rfq,
        has_bid: true,
        price_inr: myBid.price_inr,
        delivery_days: myBid.delivery_days,
        rank,
        total_bids,
        vendor_rating: vendor.rating,
      };
    })
  );

  // RFQs this vendor bid on that have since been decided (awarded or sent
  // to re-auction) — surfaced so the vendor learns the outcome. Never
  // includes other vendors' data, only whether *this* vendor won.
  const { data: myBids, error: myBidsError } = await supabaseAdmin
    .from("bids")
    .select("rfq_id")
    .eq("vendor_id", vendor.id);

  if (myBidsError) {
    console.error("Failed to fetch vendor's bids", myBidsError);
  }

  const myRfqIds = (myBids ?? []).map((bid) => bid.rfq_id);
  let outcomeResults = [];

  if (myRfqIds.length > 0) {
    const { data: decidedRfqs, error: decidedError } = await supabaseAdmin
      .from("rfqs")
      .select(RFQ_FIELDS)
      .in("id", myRfqIds)
      .in("status", ["awarded", "reauction"]);

    if (decidedError) {
      console.error("Failed to fetch decided RFQs", decidedError);
    }

    const awardedRfqIds = (decidedRfqs ?? [])
      .filter((rfq) => rfq.status === "awarded")
      .map((rfq) => rfq.id);

    let winnerByRfq = new Map();
    if (awardedRfqIds.length > 0) {
      const { data: awards, error: awardsError } = await supabaseAdmin
        .from("awards")
        .select("rfq_id, vendor_id")
        .in("rfq_id", awardedRfqIds);

      if (awardsError) {
        console.error("Failed to fetch awards", awardsError);
      }

      winnerByRfq = new Map((awards ?? []).map((award) => [award.rfq_id, award.vendor_id]));
    }

    outcomeResults = (decidedRfqs ?? []).map((rfq) => {
      const outcome =
        rfq.status === "awarded"
          ? winnerByRfq.get(rfq.id) === vendor.id
            ? "won"
            : "lost"
          : "reauction";

      return { ...rfq, has_bid: true, outcome };
    });
  }

  return NextResponse.json([...openResults, ...outcomeResults]);
}
