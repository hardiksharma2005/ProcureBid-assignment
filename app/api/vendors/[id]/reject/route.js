import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";
import { sendMail } from "@/lib/mailer";
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
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  const { data: vendor, error } = await supabaseAdmin
    .from("vendors")
    .update({ status: "rejected", rejection_reason: reason })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to reject vendor", error);
    return NextResponse.json({ error: "Failed to reject vendor." }, { status: 500 });
  }

  await logActivity({
    rfq_id: null,
    actor_email: buyerEmail,
    actor_role: "buyer",
    action: "vendor_rejected",
    details: { vendor_id: id, vendor_email: vendor.email, reason },
  });

  try {
    await sendMail({
      to: vendor.email,
      subject: "Update on your ProcureBid registration",
      html: `
        <p>Thanks for your interest in ProcureBid. After review, we're not able to approve your vendor account at this time.</p>
        ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""}
      `,
    });
  } catch (err) {
    console.error(`Failed to send rejection email to ${vendor.email}`, err);
  }

  return NextResponse.json({ vendor });
}
