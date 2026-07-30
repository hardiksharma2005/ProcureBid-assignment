import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";
import { logActivity } from "@/lib/auditLog";

export async function POST(request, { params }) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;

  const { data: vendor, error } = await supabaseAdmin
    .from("vendors")
    .update({ status: "pending", approved_at: null })
    .eq("id", id)
    .eq("status", "approved")
    .select()
    .single();

  if (error) {
    console.error("Failed to suspend vendor", error);
    return NextResponse.json({ error: "Failed to suspend vendor." }, { status: 500 });
  }

  await logActivity({
    rfq_id: null,
    actor_email: buyerEmail,
    actor_role: "buyer",
    action: "vendor_suspended",
    details: { vendor_id: id, vendor_email: vendor.email },
  });

  return NextResponse.json({ vendor });
}
