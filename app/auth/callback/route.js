import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getRole } from "@/lib/getRole";
import { getOrigin } from "@/lib/getOrigin";
import { getRedirectPathForRole } from "@/lib/roleRedirect";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const origin = getOrigin(request);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.user?.email) {
      const role = await getRole(data.user.email);
      return NextResponse.redirect(`${origin}${getRedirectPathForRole(role)}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
