import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";

export async function GET() {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: rfqs, error: rfqsError } = await supabaseAdmin
    .from("rfqs")
    .select("id, status, ceiling_price_inr, quantity_kg")
    .neq("status", "draft");

  if (rfqsError) {
    console.error("Failed to fetch RFQs for stats", rfqsError);
    return NextResponse.json({ error: "Failed to compute stats." }, { status: 500 });
  }

  const { data: awards, error: awardsError } = await supabaseAdmin
    .from("awards")
    .select("rfq_id, vendor_id");

  if (awardsError) {
    console.error("Failed to fetch awards for stats", awardsError);
    return NextResponse.json({ error: "Failed to compute stats." }, { status: 500 });
  }

  const { data: bids, error: bidsError } = await supabaseAdmin
    .from("bids")
    .select("rfq_id, vendor_id, price_inr");

  if (bidsError) {
    console.error("Failed to fetch bids for stats", bidsError);
    return NextResponse.json({ error: "Failed to compute stats." }, { status: 500 });
  }

  const rfqById = new Map(rfqs.map((rfq) => [rfq.id, rfq]));
  const priceByRfqVendor = new Map(bids.map((b) => [`${b.rfq_id}:${b.vendor_id}`, Number(b.price_inr)]));

  const totalRfqs = rfqs.length;
  const totalAwarded = rfqs.filter((rfq) => rfq.status === "awarded").length;

  let cumulativeSavings = 0;
  let savingsPercentSum = 0;
  let savingsSamples = 0;

  for (const award of awards) {
    const rfq = rfqById.get(award.rfq_id);
    if (!rfq || rfq.status !== "awarded") continue;

    const winningPrice = priceByRfqVendor.get(`${award.rfq_id}:${award.vendor_id}`);
    if (winningPrice == null) continue;

    const baseline = Number(rfq.ceiling_price_inr) * Number(rfq.quantity_kg);
    const final = winningPrice * Number(rfq.quantity_kg);
    const savings = baseline - final;

    cumulativeSavings += savings;
    if (baseline > 0) {
      savingsPercentSum += (savings / baseline) * 100;
      savingsSamples += 1;
    }
  }

  const totalBids = bids.length;

  return NextResponse.json({
    total_rfqs: totalRfqs,
    total_awarded: totalAwarded,
    cumulative_savings_inr: cumulativeSavings,
    avg_savings_percent: savingsSamples > 0 ? savingsPercentSum / savingsSamples : 0,
    avg_bids_per_rfq: totalRfqs > 0 ? totalBids / totalRfqs : 0,
  });
}
