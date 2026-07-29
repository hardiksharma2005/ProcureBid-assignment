import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";
import { broadcastBidsChanged } from "@/lib/broadcastBidsChanged";
import { logActivity } from "@/lib/auditLog";

export async function POST(request, { params }) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;

  const { data: rfq, error: rfqError } = await supabaseAdmin
    .from("rfqs")
    .select("id, status, paused_at")
    .eq("id", id)
    .maybeSingle();

  if (rfqError) {
    console.error("Failed to fetch RFQ for pause", rfqError);
    return NextResponse.json({ error: "Failed to fetch RFQ." }, { status: 500 });
  }
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
  }
  if (rfq.status !== "open" || rfq.paused_at) {
    return NextResponse.json(
      { error: "Only an open, unpaused RFQ can be paused." },
      { status: 400 }
    );
  }

  const { data: updatedRfq, error: updateError } = await supabaseAdmin
    .from("rfqs")
    .update({ paused_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to pause RFQ", updateError);
    return NextResponse.json({ error: "Failed to pause bidding." }, { status: 500 });
  }

  try {
    await broadcastBidsChanged(id);
  } catch (err) {
    console.error("Failed to broadcast bids_changed after pause", err);
  }

  await logActivity({
    rfq_id: id,
    actor_email: buyerEmail,
    actor_role: "buyer",
    action: "auction_paused",
    details: null,
  });

  return NextResponse.json({ rfq: updatedRfq });
}
