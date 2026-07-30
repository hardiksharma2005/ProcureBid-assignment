import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole } from "@/lib/getRole";
import SignOutButton from "@/components/SignOutButton";
import VendorDashboard from "@/components/VendorDashboard";

export const metadata = {
  title: "ProcureBid — Vendor",
};

function StatusScreen({ title, message, tone, children }) {
  const toneClasses =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div className={`mt-8 rounded-lg border p-6 text-center ${toneClasses}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm">{message}</p>
      {children}
    </div>
  );
}

export default async function VendorPortal() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getRole(user.email);

  if (role !== "vendor" && role !== "vendor_pending" && role !== "vendor_rejected") {
    redirect("/login");
  }

  let rejectionReason = null;
  if (role === "vendor_rejected") {
    const { data } = await supabaseAdmin
      .from("vendors")
      .select("rejection_reason")
      .eq("email", user.email.trim().toLowerCase())
      .maybeSingle();
    rejectionReason = data?.rejection_reason ?? null;
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

        {role === "vendor_pending" && (
          <StatusScreen
            tone="pending"
            title="Your registration is awaiting approval"
            message="A buyer needs to review and approve your account before you can see or bid on RFQs. We'll email you as soon as a decision is made."
          />
        )}

        {role === "vendor_rejected" && (
          <StatusScreen
            tone="danger"
            title="Your registration was not approved"
            message={
              rejectionReason
                ? `Reason given: "${rejectionReason}"`
                : "No reason was given. Contact the buyer for details."
            }
          />
        )}

        {role === "vendor" && (
          <div className="mt-8">
            <VendorDashboard />
          </div>
        )}
      </div>
    </main>
  );
}
