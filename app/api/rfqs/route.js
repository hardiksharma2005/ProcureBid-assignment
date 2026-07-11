import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";
import { closeExpiredRfqs } from "@/lib/closeExpired";

const DEFAULT_WINDOW_MINUTES = 45;

function validateRfqInput(body) {
  const material = typeof body?.material === "string" ? body.material.trim() : "";
  const quantity_kg = Number(body?.quantity_kg);
  const ceiling_price_inr = Number(body?.ceiling_price_inr);
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";

  const rawWindow = body?.window_minutes;
  const window_minutes =
    rawWindow === undefined || rawWindow === null || rawWindow === ""
      ? DEFAULT_WINDOW_MINUTES
      : Number(rawWindow);

  if (!material) {
    return { error: "Material is required." };
  }
  if (!Number.isFinite(quantity_kg) || quantity_kg <= 0) {
    return { error: "Quantity (kg) must be a positive number." };
  }
  if (!Number.isFinite(ceiling_price_inr) || ceiling_price_inr <= 0) {
    return { error: "Ceiling price (INR/kg) must be a positive number." };
  }
  if (!Number.isInteger(window_minutes) || window_minutes <= 0) {
    return { error: "Window minutes must be a positive whole number." };
  }

  return {
    value: {
      material,
      quantity_kg,
      ceiling_price_inr,
      description: description || null,
      window_minutes,
    },
  };
}

export async function POST(request) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { value, error } = validateRfqInput(body);

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const { data, error: insertError } = await supabaseAdmin
    .from("rfqs")
    .insert({ ...value, status: "draft" })
    .select()
    .single();

  if (insertError) {
    console.error("Failed to create RFQ", insertError);
    return NextResponse.json({ error: "Failed to create RFQ." }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function GET() {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await closeExpiredRfqs();

  const { data: rfqs, error } = await supabaseAdmin
    .from("rfqs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch RFQs", error);
    return NextResponse.json({ error: "Failed to fetch RFQs." }, { status: 500 });
  }

  // Only counts, never prices — the buyer must not see bid prices while an
  // RFQ is open, so we deliberately select just rfq_id here, nothing else.
  const { data: bidRows, error: bidsError } = await supabaseAdmin
    .from("bids")
    .select("rfq_id");

  if (bidsError) {
    console.error("Failed to fetch bid counts", bidsError);
  }

  const countByRfq = new Map();
  for (const bid of bidRows ?? []) {
    countByRfq.set(bid.rfq_id, (countByRfq.get(bid.rfq_id) ?? 0) + 1);
  }

  const withCounts = rfqs.map((rfq) => ({
    ...rfq,
    bid_count: countByRfq.get(rfq.id) ?? 0,
  }));

  return NextResponse.json(withCounts);
}
