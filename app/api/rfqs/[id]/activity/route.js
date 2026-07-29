import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";

export async function GET(request, { params }) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;

  const { data: entries, error } = await supabaseAdmin
    .from("activity_log")
    .select("id, actor_email, actor_role, action, details, created_at")
    .eq("rfq_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch activity log", error);
    return NextResponse.json({ error: "Failed to fetch activity log." }, { status: 500 });
  }

  return NextResponse.json({ entries });
}
