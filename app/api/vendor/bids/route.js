import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireVendor } from "@/lib/requireVendor";
import { closeExpiredRfqs } from "@/lib/closeExpired";
import { getRankedBids, findRank } from "@/lib/rankBids";
import { broadcastBidsChanged } from "@/lib/broadcastBidsChanged";

export async function POST(request) {
  const vendor = await requireVendor();
  if (!vendor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await closeExpiredRfqs();

  const body = await request.json().catch(() => null);
  const rfq_id = typeof body?.rfq_id === "string" ? body.rfq_id : "";
  const price_inr = Number(body?.price_inr);
  const delivery_days = Number(body?.delivery_days);

  if (!rfq_id) {
    return NextResponse.json({ error: "rfq_id is required." }, { status: 400 });
  }

  const { data: rfq, error: rfqError } = await supabaseAdmin
    .from("rfqs")
    .select("id, status, window_end, ceiling_price_inr")
    .eq("id", rfq_id)
    .maybeSingle();

  if (rfqError) {
    console.error("Failed to fetch RFQ for bid", rfqError);
    return NextResponse.json({ error: "Failed to submit bid." }, { status: 500 });
  }
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
  }
  if (rfq.status !== "open" || new Date(rfq.window_end).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Bidding is closed for this RFQ." }, { status: 400 });
  }
  if (
    !Number.isFinite(price_inr) ||
    price_inr <= 0 ||
    price_inr > Number(rfq.ceiling_price_inr)
  ) {
    return NextResponse.json(
      { error: "Price must be a positive number that does not exceed the ceiling price." },
      { status: 400 }
    );
  }
  if (!Number.isInteger(delivery_days) || delivery_days < 1 || delivery_days > 60) {
    return NextResponse.json(
      { error: "Delivery days must be a whole number between 1 and 60." },
      { status: 400 }
    );
  }

  const { error: insertError } = await supabaseAdmin.from("bids").insert({
    rfq_id,
    vendor_id: vendor.id,
    price_inr,
    delivery_days,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "You have already placed your sealed bid for this RFQ." },
        { status: 409 }
      );
    }
    console.error("Failed to insert bid", insertError);
    return NextResponse.json({ error: "Failed to submit bid." }, { status: 500 });
  }

  try {
    await broadcastBidsChanged(rfq_id);
  } catch (err) {
    console.error("Failed to broadcast bids_changed", err);
  }

  const rankedBids = await getRankedBids(rfq_id, rfq.ceiling_price_inr);
  const { rank, total_bids } = findRank(rankedBids, vendor.id);

  return NextResponse.json({ rank, total_bids });
}
