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
    .select("id, status, window_end, paused_at, total_paused_ms")
    .eq("id", id)
    .maybeSingle();

  if (rfqError) {
    console.error("Failed to fetch RFQ for resume", rfqError);
    return NextResponse.json({ error: "Failed to fetch RFQ." }, { status: 500 });
  }
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
  }
  if (!rfq.paused_at) {
    return NextResponse.json({ error: "This RFQ is not paused." }, { status: 400 });
  }

  const pausedMs = Date.now() - new Date(rfq.paused_at).getTime();
  const newWindowEnd = new Date(new Date(rfq.window_end).getTime() + pausedMs).toISOString();

  const { data: updatedRfq, error: updateError } = await supabaseAdmin
    .from("rfqs")
    .update({
      window_end: newWindowEnd,
      total_paused_ms: Number(rfq.total_paused_ms ?? 0) + pausedMs,
      paused_at: null,
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to resume RFQ", updateError);
    return NextResponse.json({ error: "Failed to resume bidding." }, { status: 500 });
  }

  try {
    await broadcastBidsChanged(id);
  } catch (err) {
    console.error("Failed to broadcast bids_changed after resume", err);
  }

  await logActivity({
    rfq_id: id,
    actor_email: buyerEmail,
    actor_role: "buyer",
    action: "auction_resumed",
    details: { paused_ms: pausedMs },
  });

  return NextResponse.json({ rfq: updatedRfq });
}
