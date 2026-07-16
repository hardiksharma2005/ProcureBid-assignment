import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole } from "@/lib/getRole";
import { getOrigin } from "@/lib/getOrigin";

export async function POST(request) {
  const origin = getOrigin(request);
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const normalizedEmail = email.trim().toLowerCase();

  // TEMPORARY — remove after diagnosing. Never logs the actual env value.
  console.log("buyer-check", {
    received: normalizedEmail,
    allowlistCount: (process.env.BUYER_EMAILS || process.env.BUYER_EMAIL || "").split(",").length,
    hasEnv: !!process.env.BUYER_EMAILS,
  });

  const role = email ? await getRole(email) : null;

  if (!role) {
    return NextResponse.json(
      { error: "This email is not registered on ProcureBid." },
      { status: 403 }
    );
  }

  // Evaluation-only bypass — still gated by the allowlist check above, just
  // skips proving inbox ownership. See README "Security model".
  if (process.env.DEMO_MODE === "true") {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (error || !data?.properties?.hashed_token) {
      console.error("generateLink failed (demo mode)", error);
      return NextResponse.json(
        { error: "Something went wrong signing you in. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      demo: true,
      token_hash: data.properties.hashed_token,
      role,
    });
  }

  const supabase = createClient();

  let otpError;
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Signups are allowed at the Supabase project level; our vendors-table
        // allowlist check above is the real gate on who can request a link.
        shouldCreateUser: true,
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });
    otpError = error;
  } catch (err) {
    otpError = err;
  }

  if (otpError) {
    console.error("signInWithOtp failed", {
      email,
      status: otpError.status,
      name: otpError.name,
      code: otpError.code,
      message: otpError.message,
    });

    const status = Number.isInteger(otpError.status) ? otpError.status : 500;
    const message =
      otpError.message && otpError.message !== "{}"
        ? otpError.message
        : "Something went wrong sending the login link. Please try again.";

    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ message: "Check your email for the login link." });
}
