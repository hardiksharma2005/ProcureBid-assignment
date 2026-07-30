import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import SignOutButton from "@/components/SignOutButton";
import RfqDashboard from "@/components/RfqDashboard";

export const metadata = {
  title: "ProcureBid — Buyer",
};

export default async function BuyerDashboard() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { count: pendingCount } = await supabaseAdmin
    .from("vendors")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Buyer Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">Signed in as {user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/buyer/vendors"
              className="relative rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              Vendors
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
            <SignOutButton />
          </div>
        </div>

        <div className="mt-8">
          <RfqDashboard />
        </div>
      </div>
    </main>
  );
}
