import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";
import { closeExpiredRfqs } from "@/lib/closeExpired";
import { getRankedBids } from "@/lib/rankBids";

// The live monitor is buyer-only, unlike the vendor-facing views — it shows
// every bidder's price and identity while the auction is still running.
const MONITORABLE_STATUSES = new Set(["open", "closed", "awarded", "reauction"]);

export async function GET(request, { params }) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await closeExpiredRfqs();

  const { id } = params;

  const { data: rfq, error: rfqError } = await supabaseAdmin
    .from("rfqs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (rfqError) {
    console.error("Failed to fetch RFQ for monitor", rfqError);
    return NextResponse.json({ error: "Failed to fetch RFQ." }, { status: 500 });
  }
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
  }
  if (!MONITORABLE_STATUSES.has(rfq.status)) {
    return NextResponse.json(
      { error: "RFQ is not available for monitoring." },
      { status: 400 }
    );
  }

  const rankedBids = await getRankedBids(id, rfq.ceiling_price_inr);

  const bids = rankedBids.map((bid, index) => ({
    rank: index + 1,
    vendor_id: bid.vendor_id,
    vendor_name: bid.vendor_name,
    rating: bid.rating,
    price_inr: bid.price_inr,
    delivery_days: bid.delivery_days,
    price_component: bid.price_component,
    delivery_component: bid.delivery_component,
    rating_component: bid.rating_component,
    total: bid.score,
    created_at: bid.created_at,
  }));

  return NextResponse.json({ rfq, bids });
}
