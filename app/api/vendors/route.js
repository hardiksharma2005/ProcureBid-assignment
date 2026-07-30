import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBuyer } from "@/lib/requireBuyer";

export async function GET() {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: vendors, error } = await supabaseAdmin
    .from("vendors")
    .select("id, name, company_name, email, contact_phone, status, rating, registered_at, approved_at, rejection_reason")
    .order("registered_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch vendors", error);
    return NextResponse.json({ error: "Failed to fetch vendors." }, { status: 500 });
  }

  return NextResponse.json(vendors);
}
