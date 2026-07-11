import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";
import { sendMail } from "@/lib/mailer";
import { getOrigin } from "@/lib/getOrigin";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildInviteHtml({ rfq, windowEndIST, origin }) {
  return `
    <p>A new RFQ has been published on ProcureBid.</p>
    <table style="width:100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="padding:6px 0; color:#64748b;">Material</td><td style="padding:6px 0; font-weight:600;">${escapeHtml(rfq.material)}</td></tr>
      <tr><td style="padding:6px 0; color:#64748b;">Quantity</td><td style="padding:6px 0; font-weight:600;">${rfq.quantity_kg} kg</td></tr>
      <tr><td style="padding:6px 0; color:#64748b;">Ceiling price</td><td style="padding:6px 0; font-weight:600;">&#8377;${rfq.ceiling_price_inr} / kg</td></tr>
      ${
        rfq.description
          ? `<tr><td style="padding:6px 0; color:#64748b; vertical-align:top;">Description</td><td style="padding:6px 0;">${escapeHtml(rfq.description)}</td></tr>`
          : ""
      }
      <tr><td style="padding:6px 0; color:#64748b;">Bidding closes</td><td style="padding:6px 0; font-weight:600;">${windowEndIST} IST</td></tr>
    </table>
    <a href="${origin}/vendor" style="display:inline-block; background:#4f46e5; color:#ffffff; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:600;">Submit your bid</a>
  `;
}

export async function POST(request, { params }) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;
  const origin = getOrigin(request);

  const { data: rfq, error: fetchError } = await supabaseAdmin
    .from("rfqs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to fetch RFQ for publish", fetchError);
    return NextResponse.json({ error: "Failed to fetch RFQ." }, { status: 500 });
  }

  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
  }

  if (rfq.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft RFQs can be published." },
      { status: 400 }
    );
  }

  const windowMinutes = rfq.window_minutes;
  const windowStart = new Date();
  const windowEnd = new Date(windowStart.getTime() + windowMinutes * 60_000);

  const { data: updatedRfq, error: updateError } = await supabaseAdmin
    .from("rfqs")
    .update({
      status: "open",
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to publish RFQ", updateError);
    return NextResponse.json({ error: "Failed to publish RFQ." }, { status: 500 });
  }

  const { data: vendors, error: vendorsError } = await supabaseAdmin
    .from("vendors")
    .select("email, name");

  if (vendorsError) {
    console.error("Failed to fetch vendors for RFQ notification", vendorsError);
  }

  const windowEndIST = windowEnd.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  let emailErrors = 0;

  for (const vendor of vendors ?? []) {
    try {
      await sendMail({
        to: vendor.email,
        subject: `New RFQ: ${updatedRfq.material} — bidding open for ${windowMinutes} minutes`,
        html: buildInviteHtml({ rfq: updatedRfq, windowEndIST, origin }),
      });
    } catch (err) {
      console.error(`Failed to send RFQ invite to ${vendor.email}`, err);
      emailErrors += 1;
    }
  }

  return NextResponse.json({ rfq: updatedRfq, emailErrors });
}
