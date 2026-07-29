import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";
import { sendMail } from "@/lib/mailer";
import { getOrigin } from "@/lib/getOrigin";
import { broadcastBidsChanged } from "@/lib/broadcastBidsChanged";
import { logActivity } from "@/lib/auditLog";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(request, { params }) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;
  const origin = getOrigin(request);

  const { data: rfq, error: rfqError } = await supabaseAdmin
    .from("rfqs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (rfqError) {
    console.error("Failed to fetch RFQ for early close", rfqError);
    return NextResponse.json({ error: "Failed to fetch RFQ." }, { status: 500 });
  }
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
  }
  if (rfq.status !== "open") {
    return NextResponse.json(
      { error: "Only open RFQs can be closed early." },
      { status: 400 }
    );
  }

  const { data: updatedRfq, error: updateError } = await supabaseAdmin
    .from("rfqs")
    .update({ status: "closed", window_end: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to close RFQ early", updateError);
    return NextResponse.json({ error: "Failed to close bidding." }, { status: 500 });
  }

  const { data: vendors, error: vendorsError } = await supabaseAdmin
    .from("vendors")
    .select("email");

  if (vendorsError) {
    console.error("Failed to fetch vendors for early-close notification", vendorsError);
  }

  let emailErrors = 0;

  for (const vendor of vendors ?? []) {
    try {
      await sendMail({
        to: vendor.email,
        subject: `Bidding closed early: ${updatedRfq.material}`,
        html: `
          <p>Bidding for <strong>${escapeHtml(updatedRfq.material)}</strong> on ProcureBid has been closed early by the buyer.</p>
          <p>Results will follow shortly.</p>
          <a href="${origin}/vendor" style="display:inline-block; background:#4f46e5; color:#ffffff; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:600;">View on ProcureBid</a>
        `,
      });
    } catch (err) {
      console.error(`Failed to send early-close notice to ${vendor.email}`, err);
      emailErrors += 1;
    }
  }

  try {
    await broadcastBidsChanged(id);
  } catch (err) {
    console.error("Failed to broadcast bids_changed after early close", err);
  }

  await logActivity({
    rfq_id: id,
    actor_email: buyerEmail,
    actor_role: "buyer",
    action: "closed_early",
    details: null,
  });

  return NextResponse.json({ rfq: updatedRfq, emailErrors });
}
