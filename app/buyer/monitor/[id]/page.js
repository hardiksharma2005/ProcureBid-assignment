import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import SignOutButton from "@/components/SignOutButton";
import BuyerMonitorConsole from "@/components/BuyerMonitorConsole";

export const metadata = {
  title: "ProcureBid — Live Monitor",
};

export default async function BuyerMonitorPage({ params }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Live Auction Monitor
            </h1>
            <p className="mt-1 text-sm text-slate-500">Signed in as {user.email}</p>
          </div>
          <SignOutButton />
        </div>

        <div className="mt-8 flex justify-center">
          <BuyerMonitorConsole rfqId={params.id} />
        </div>
      </div>
    </main>
  );
}
