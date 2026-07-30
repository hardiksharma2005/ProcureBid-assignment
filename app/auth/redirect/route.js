import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getRole } from "@/lib/getRole";
import { getOrigin } from "@/lib/getOrigin";
import { getRedirectPathForRole } from "@/lib/roleRedirect";

// Landing spot for a full-navigation redirect right after a client-side
// supabase.auth.signInWithPassword() call. The client can't resolve a role
// itself (BUYER_EMAILS and vendor status are both server-only), so it just
// navigates here and this route reads the now-set session cookie and sends
// the user on to the right dashboard.
export async function GET(request) {
  const origin = getOrigin(request);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = await getRole(user?.email);
  return NextResponse.redirect(`${origin}${getRedirectPathForRole(role)}`);
}
