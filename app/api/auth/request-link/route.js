import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getRole } from "@/lib/getRole";
import { getOrigin } from "@/lib/getOrigin";

export async function POST(request) {
  const origin = getOrigin(request);
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  const role = email ? await getRole(email) : null;

  if (!role) {
    return NextResponse.json(
      { error: "This email is not registered on ProcureBid." },
      { status: 403 }
    );
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
