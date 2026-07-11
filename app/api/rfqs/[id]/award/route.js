import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";
import { getRankedBids } from "@/lib/rankBids";
import { sendMail } from "@/lib/mailer";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Ties are compared on the rounded score, not the raw float, so two bids
// that are mathematically equal but differ only in floating-point noise
// still count as a tie.
function round4(value) {
  return Math.round(value * 10000) / 10000;
}

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
    console.error("Failed to fetch RFQ for award", rfqError);
    return NextResponse.json({ error: "Failed to fetch RFQ." }, { status: 500 });
  }
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
  }
  if (rfq.status !== "closed") {
    return NextResponse.json(
      { error: "Only closed RFQs can be awarded." },
      { status: 400 }
    );
  }

  const rankedBids = await getRankedBids(id, rfq.ceiling_price_inr);

  if (rankedBids.length === 0) {
    const { data: updatedRfq } = await supabaseAdmin
      .from("rfqs")
      .update({ status: "reauction" })
      .eq("id", id)
      .select()
      .single();

    return NextResponse.json(
      { error: "No bids received — relaunch the RFQ.", rfq: updatedRfq },
      { status: 409 }
    );
  }

  if (rankedBids.length >= 2 && round4(rankedBids[0].score) === round4(rankedBids[1].score)) {
    const { data: updatedRfq } = await supabaseAdmin
      .from("rfqs")
      .update({ status: "reauction" })
      .eq("id", id)
      .select()
      .single();

    return NextResponse.json({ tie: true, rfq: updatedRfq });
  }

  const winner = rankedBids[0];
  const losers = rankedBids.slice(1);

  const { error: awardError } = await supabaseAdmin.from("awards").insert({
    rfq_id: id,
    vendor_id: winner.vendor_id,
    winning_score: winner.score,
  });

  if (awardError) {
    console.error("Failed to insert award", awardError);
    return NextResponse.json({ error: "Failed to record award." }, { status: 500 });
  }

  const { data: updatedRfq, error: updateError } = await supabaseAdmin
    .from("rfqs")
    .update({ status: "awarded" })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to mark RFQ as awarded", updateError);
    return NextResponse.json({ error: "Failed to mark RFQ as awarded." }, { status: 500 });
  }

  // Emails are best-effort from here — the award itself is already
  // committed, so a send failure shouldn't make the request look failed.
  let emailErrors = 0;

  try {
    await sendMail({
      to: winner.vendor_email,
      subject: `Congratulations — you won the contract for ${rfq.material}`,
      html: `
        <p>Congratulations! Your sealed bid was selected for the following RFQ on ProcureBid.</p>
        <table style="width:100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <tr><td style="padding:6px 0; color:#64748b;">Material</td><td style="padding:6px 0; font-weight:600;">${escapeHtml(rfq.material)}</td></tr>
          <tr><td style="padding:6px 0; color:#64748b;">Quantity</td><td style="padding:6px 0; font-weight:600;">${rfq.quantity_kg} kg</td></tr>
          <tr><td style="padding:6px 0; color:#64748b;">Your price</td><td style="padding:6px 0; font-weight:600;">&#8377;${winner.price_inr}/kg</td></tr>
          <tr><td style="padding:6px 0; color:#64748b;">Your delivery time</td><td style="padding:6px 0; font-weight:600;">${winner.delivery_days} day(s)</td></tr>
        </table>
        <p>We'll be in touch shortly with next steps.</p>
      `,
    });
  } catch (err) {
    console.error(`Failed to send winner email to ${winner.vendor_email}`, err);
    emailErrors += 1;
  }

  for (const loser of losers) {
    try {
      await sendMail({
        to: loser.vendor_email,
        subject: `RFQ result: ${rfq.material}`,
        html: `
          <p>Thank you for submitting a sealed bid for <strong>${escapeHtml(rfq.material)}</strong> on ProcureBid.</p>
          <p>The contract has been awarded — thank you for participating. We hope to see your bids on future RFQs.</p>
        `,
      });
    } catch (err) {
      console.error(`Failed to send result email to ${loser.vendor_email}`, err);
      emailErrors += 1;
    }
  }

  try {
    await sendMail({
      to: buyerEmail,
      subject: `RFQ awarded: ${rfq.material}`,
      html: `
        <p>Your RFQ has been awarded.</p>
        <table style="width:100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <tr><td style="padding:6px 0; color:#64748b;">Material</td><td style="padding:6px 0; font-weight:600;">${escapeHtml(rfq.material)}</td></tr>
          <tr><td style="padding:6px 0; color:#64748b;">Awarded to</td><td style="padding:6px 0; font-weight:600;">${escapeHtml(winner.vendor_name)}</td></tr>
          <tr><td style="padding:6px 0; color:#64748b;">Winning price</td><td style="padding:6px 0; font-weight:600;">&#8377;${winner.price_inr}/kg</td></tr>
          <tr><td style="padding:6px 0; color:#64748b;">Winning score</td><td style="padding:6px 0; font-weight:600;">${winner.score.toFixed(2)}</td></tr>
        </table>
      `,
    });
  } catch (err) {
    console.error(`Failed to send award confirmation to buyer ${buyerEmail}`, err);
    emailErrors += 1;
  }

  return NextResponse.json({ rfq: updatedRfq, emailErrors });
}
