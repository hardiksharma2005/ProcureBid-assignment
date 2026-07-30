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
  const body = await request.json().catch(() => null);
  const rating = Number(body?.rating);

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be between 1.0 and 5.0." }, { status: 400 });
  }

  const { data: vendor, error } = await supabaseAdmin
    .from("vendors")
    .update({ rating })
    .eq("id", id)
    .eq("status", "approved")
    .select()
    .single();

  if (error) {
    console.error("Failed to update vendor rating", error);
    return NextResponse.json({ error: "Failed to update rating." }, { status: 500 });
  }

  await logActivity({
    rfq_id: null,
    actor_email: buyerEmail,
    actor_role: "buyer",
    action: "vendor_rating_updated",
    details: { vendor_id: id, vendor_email: vendor.email, rating },
  });

  return NextResponse.json({ vendor });
}
