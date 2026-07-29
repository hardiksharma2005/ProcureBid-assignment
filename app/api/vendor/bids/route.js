import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireVendor } from "@/lib/requireVendor";
import { closeExpiredRfqs } from "@/lib/closeExpired";
import { getRankedBids, findRank } from "@/lib/rankBids";
import { broadcastBidsChanged } from "@/lib/broadcastBidsChanged";
import { logActivity } from "@/lib/auditLog";

const EXTEND_WITHIN_MS = 120_000;
const EXTEND_BY_MS = 180_000;
const MAX_EXTENSIONS = 3;

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
    .select("id, status, window_end, ceiling_price_inr, auto_extend_enabled, extension_count, paused_at")
    .eq("id", rfq_id)
    .maybeSingle();

  if (rfqError) {
    console.error("Failed to fetch RFQ for bid", rfqError);
    return NextResponse.json({ error: "Failed to submit bid." }, { status: 500 });
  }
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
  }
  if (rfq.paused_at) {
    return NextResponse.json(
      { error: "Bidding is paused by the buyer." },
      { status: 409 }
    );
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

  await logActivity({
    rfq_id,
    actor_email: vendor.email,
    actor_role: "vendor",
    action: "bid_placed",
    details: { vendor: vendor.name, price_inr, delivery_days },
  });

  // Late-entry auto-extension: if this bid landed within the final 2
  // minutes and the buyer hasn't opted out or hit the extension cap, push
  // window_end out by 3 minutes so a last-second bid can't unfairly lock
  // out other vendors who were about to respond.
  let extended = false;
  let broadcastPayload = {};

  if (rfq.auto_extend_enabled && rfq.extension_count < MAX_EXTENSIONS) {
    const msRemaining = new Date(rfq.window_end).getTime() - Date.now();
    if (msRemaining > 0 && msRemaining <= EXTEND_WITHIN_MS) {
      const newWindowEnd = new Date(new Date(rfq.window_end).getTime() + EXTEND_BY_MS).toISOString();
      const newExtensionCount = rfq.extension_count + 1;

      const { error: extendError } = await supabaseAdmin
        .from("rfqs")
        .update({ window_end: newWindowEnd, extension_count: newExtensionCount })
        .eq("id", rfq_id);

      if (extendError) {
        console.error("Failed to extend RFQ window", extendError);
      } else {
        extended = true;
        broadcastPayload = { extended: true, extension_count: newExtensionCount };
        await logActivity({
          rfq_id,
          actor_email: vendor.email,
          actor_role: "vendor",
          action: "auction_extended",
          details: { extension_count: newExtensionCount, new_window_end: newWindowEnd },
        });
      }
    }
  }

  try {
    await broadcastBidsChanged(rfq_id, broadcastPayload);
  } catch (err) {
    console.error("Failed to broadcast bids_changed", err);
  }

  const rankedBids = await getRankedBids(rfq_id, rfq.ceiling_price_inr);
  const { rank, total_bids } = findRank(rankedBids, vendor.id);

  return NextResponse.json({ rank, total_bids, extended });
}
