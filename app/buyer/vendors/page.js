import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import SignOutButton from "@/components/SignOutButton";
import VendorApprovalConsole from "@/components/VendorApprovalConsole";

export const metadata = {
  title: "ProcureBid — Vendors",
};

export default async function BuyerVendorsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/buyer" className="text-sm font-medium text-indigo-600 hover:underline">
              &larr; Back to dashboard
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              Vendor Approvals
            </h1>
            <p className="mt-1 text-sm text-slate-500">Signed in as {user.email}</p>
          </div>
          <SignOutButton />
        </div>

        <div className="mt-8">
          <VendorApprovalConsole />
        </div>
      </div>
    </main>
  );
}
