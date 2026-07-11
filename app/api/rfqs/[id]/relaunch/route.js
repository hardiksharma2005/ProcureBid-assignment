import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";

export async function POST(request, { params }) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;

  const { data: rfq, error: rfqError } = await supabaseAdmin
    .from("rfqs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (rfqError) {
    console.error("Failed to fetch RFQ for relaunch", rfqError);
    return NextResponse.json({ error: "Failed to fetch RFQ." }, { status: 500 });
  }
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
  }
  if (rfq.status !== "reauction") {
    return NextResponse.json(
      { error: "Only RFQs pending re-auction can be relaunched." },
      { status: 400 }
    );
  }

  const note = `(Re-auction of RFQ ${id.slice(0, 8)})`;
  const description = rfq.description ? `${rfq.description}\n\n${note}` : note;

  const { data: newRfq, error: insertError } = await supabaseAdmin
    .from("rfqs")
    .insert({
      material: rfq.material,
      quantity_kg: rfq.quantity_kg,
      ceiling_price_inr: rfq.ceiling_price_inr,
      description,
      window_minutes: rfq.window_minutes,
      status: "draft",
    })
    .select()
    .single();

  if (insertError) {
    console.error("Failed to create relaunch RFQ", insertError);
    return NextResponse.json({ error: "Failed to relaunch RFQ." }, { status: 500 });
  }

  return NextResponse.json(newRfq, { status: 201 });
}
