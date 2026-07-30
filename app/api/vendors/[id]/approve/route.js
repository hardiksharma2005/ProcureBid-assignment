import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";
import { sendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/auditLog";

export async function POST(request, { params }) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;
  const body = await request.json().catch(() => null);
  const rating = Number(body?.rating ?? 3.5);

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be between 1.0 and 5.0." }, { status: 400 });
  }

  const { data: vendor, error } = await supabaseAdmin
    .from("vendors")
    .update({ status: "approved", approved_at: new Date().toISOString(), rejection_reason: null, rating })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to approve vendor", error);
    return NextResponse.json({ error: "Failed to approve vendor." }, { status: 500 });
  }

  await logActivity({
    rfq_id: null,
    actor_email: buyerEmail,
    actor_role: "buyer",
    action: "vendor_approved",
    details: { vendor_id: id, vendor_email: vendor.email, rating },
  });

  try {
    await sendMail({
      to: vendor.email,
      subject: "You're approved — you'll now receive RFQ invitations",
      html: `<p>Good news — your ProcureBid vendor account has been approved. You'll now receive email invitations for new RFQs and can submit sealed bids.</p>`,
    });
  } catch (err) {
    console.error(`Failed to send approval email to ${vendor.email}`, err);
  }

  return NextResponse.json({ vendor });
}
