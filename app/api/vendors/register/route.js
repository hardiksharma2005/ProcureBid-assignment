import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendMail } from "@/lib/mailer";
import { getOrigin } from "@/lib/getOrigin";
import { getBuyerEmails, isBuyerEmail } from "@/lib/buyers";
import { logActivity } from "@/lib/auditLog";

const MIN_PASSWORD_LENGTH = 8;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(request) {
  const origin = getOrigin(request);
  const body = await request.json().catch(() => null);

  const companyName = typeof body?.company_name === "string" ? body.company_name.trim() : "";
  const contactName = typeof body?.contact_name === "string" ? body.contact_name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!companyName || !contactName || !email || !phone) {
    return NextResponse.json(
      { error: "Company name, contact name, email, and phone are all required." },
      { status: 400 }
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const { data: existingVendor, error: existingError } = await supabaseAdmin
    .from("vendors")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    console.error("Failed to check existing vendor", existingError);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
  if (existingVendor) {
    return NextResponse.json(
      { error: "This email is already registered." },
      { status: 409 }
    );
  }

  if (isBuyerEmail(email)) {
    return NextResponse.json(
      { error: "This email is registered as a buyer." },
      { status: 409 }
    );
  }

  // Email confirmed true: the buyer's approval is the real gate on access,
  // not inbox verification — a pending/rejected vendor still can't reach
  // any vendor data (see requireVendor).
  const { data: authUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createUserError) {
    console.error("Failed to create auth user for vendor registration", createUserError);
    const isDuplicate =
      createUserError.code === "email_exists" ||
      createUserError.message?.toLowerCase().includes("already been registered");
    return NextResponse.json(
      {
        error: isDuplicate
          ? "This email is already registered."
          : "Registration failed. Please try again.",
      },
      { status: isDuplicate ? 409 : 500 }
    );
  }

  const { error: insertError } = await supabaseAdmin.from("vendors").insert({
    name: contactName,
    company_name: companyName,
    contact_phone: phone,
    email,
    status: "pending",
    rating: null,
  });

  if (insertError) {
    console.error("Failed to insert vendor row", insertError);
    // Roll back the auth user so a failed registration doesn't leave an
    // orphaned account the vendor can't re-register with.
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id).catch((err) => {
      console.error("Failed to roll back auth user after vendor insert failure", err);
    });
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }

  await logActivity({
    rfq_id: null,
    actor_email: email,
    actor_role: "vendor",
    action: "vendor_registered",
    details: { company_name: companyName, contact_name: contactName, phone },
  });

  let emailErrors = 0;

  for (const buyerEmail of getBuyerEmails()) {
    try {
      await sendMail({
        to: buyerEmail,
        subject: "New vendor registration pending approval",
        html: `
          <p>A new vendor has registered on ProcureBid and is awaiting your approval.</p>
          <table style="width:100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
            <tr><td style="padding:6px 0; color:#64748b;">Company</td><td style="padding:6px 0; font-weight:600;">${escapeHtml(companyName)}</td></tr>
            <tr><td style="padding:6px 0; color:#64748b;">Contact</td><td style="padding:6px 0; font-weight:600;">${escapeHtml(contactName)}</td></tr>
            <tr><td style="padding:6px 0; color:#64748b;">Email</td><td style="padding:6px 0; font-weight:600;">${escapeHtml(email)}</td></tr>
            <tr><td style="padding:6px 0; color:#64748b;">Phone</td><td style="padding:6px 0; font-weight:600;">${escapeHtml(phone)}</td></tr>
          </table>
          <a href="${origin}/buyer/vendors" style="display:inline-block; background:#4f46e5; color:#ffffff; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:600;">Review vendor</a>
        `,
      });
    } catch (err) {
      console.error(`Failed to send registration notice to buyer ${buyerEmail}`, err);
      emailErrors += 1;
    }
  }

  try {
    await sendMail({
      to: email,
      subject: "Registration received — pending buyer approval",
      html: `
        <p>Thanks for registering <strong>${escapeHtml(companyName)}</strong> on ProcureBid.</p>
        <p>Your account is pending buyer approval. We'll email you as soon as it's reviewed.</p>
      `,
    });
  } catch (err) {
    console.error(`Failed to send registration confirmation to vendor ${email}`, err);
    emailErrors += 1;
  }

  return NextResponse.json({ message: "Registration received — pending buyer approval.", emailErrors });
}
