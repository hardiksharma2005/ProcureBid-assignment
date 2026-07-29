import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";
import { logActivity } from "@/lib/auditLog";

const ARCHIVABLE_STATUSES = new Set(["closed", "awarded", "reauction"]);

export async function POST(request, { params }) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;

  const { data: rfq, error: rfqError } = await supabaseAdmin
    .from("rfqs")
    .select("id, status, archived_at")
    .eq("id", id)
    .maybeSingle();

  if (rfqError) {
    console.error("Failed to fetch RFQ for archive toggle", rfqError);
    return NextResponse.json({ error: "Failed to fetch RFQ." }, { status: 500 });
  }
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
  }
  if (!ARCHIVABLE_STATUSES.has(rfq.status)) {
    return NextResponse.json(
      { error: "Finish or close the auction before archiving." },
      { status: 400 }
    );
  }

  const willArchive = !rfq.archived_at;

  const { data: updatedRfq, error: updateError } = await supabaseAdmin
    .from("rfqs")
    .update({ archived_at: willArchive ? new Date().toISOString() : null })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to toggle RFQ archive state", updateError);
    return NextResponse.json({ error: "Failed to update archive state." }, { status: 500 });
  }

  await logActivity({
    rfq_id: id,
    actor_email: buyerEmail,
    actor_role: "buyer",
    action: willArchive ? "rfq_archived" : "rfq_unarchived",
    details: null,
  });

  return NextResponse.json({ rfq: updatedRfq });
}
