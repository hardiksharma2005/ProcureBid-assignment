import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";
import { closeExpiredRfqs } from "@/lib/closeExpired";
import { getRankedBids } from "@/lib/rankBids";

// Bids are sealed while an RFQ is still being bid on — only once it's
// closed/awarded/reauction can even the buyer see who bid what. This is
// the buyer-only reveal; never expose this route to vendors.
const SEALED_STATUSES = new Set(["open", "draft"]);

export async function GET(request, { params }) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await closeExpiredRfqs();

  const { id } = params;

  const { data: rfq, error: rfqError } = await supabaseAdmin
    .from("rfqs")
    .select("id, status, ceiling_price_inr")
    .eq("id", id)
    .maybeSingle();

  if (rfqError) {
    console.error("Failed to fetch RFQ for bid reveal", rfqError);
    return NextResponse.json({ error: "Failed to fetch RFQ." }, { status: 500 });
  }
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
  }
  if (SEALED_STATUSES.has(rfq.status)) {
    return NextResponse.json(
      { error: "Bids are sealed until the window closes." },
      { status: 403 }
    );
  }

  const rankedBids = await getRankedBids(id, rfq.ceiling_price_inr);

  const reveal = rankedBids.map((bid, index) => ({
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
  }));

  return NextResponse.json(reveal);
}
