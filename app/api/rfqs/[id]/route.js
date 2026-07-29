import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";

export async function DELETE(request, { params }) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;

  const { data: rfq, error: rfqError } = await supabaseAdmin
    .from("rfqs")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (rfqError) {
    console.error("Failed to fetch RFQ for delete", rfqError);
    return NextResponse.json({ error: "Failed to fetch RFQ." }, { status: 500 });
  }
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
  }
  if (rfq.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft RFQs can be deleted." },
      { status: 400 }
    );
  }

  const { count: bidCount, error: bidsError } = await supabaseAdmin
    .from("bids")
    .select("id", { count: "exact", head: true })
    .eq("rfq_id", id);

  if (bidsError) {
    console.error("Failed to check bids before RFQ delete", bidsError);
    return NextResponse.json({ error: "Failed to fetch bids." }, { status: 500 });
  }
  if (bidCount > 0) {
    return NextResponse.json(
      { error: "Only draft RFQs can be deleted." },
      { status: 400 }
    );
  }

  const { error: deleteError } = await supabaseAdmin.from("rfqs").delete().eq("id", id);

  if (deleteError) {
    console.error("Failed to delete RFQ", deleteError);
    return NextResponse.json({ error: "Failed to delete RFQ." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
