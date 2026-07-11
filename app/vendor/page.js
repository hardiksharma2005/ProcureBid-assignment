import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import SignOutButton from "@/components/SignOutButton";
import VendorDashboard from "@/components/VendorDashboard";

export const metadata = {
  title: "ProcureBid — Vendor",
};

export default async function VendorPortal() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Vendor Portal
            </h1>
            <p className="mt-1 text-sm text-slate-500">Signed in as {user.email}</p>
          </div>
          <SignOutButton />
        </div>

        <div className="mt-8">
          <VendorDashboard />
        </div>
      </div>
    </main>
  );
}
