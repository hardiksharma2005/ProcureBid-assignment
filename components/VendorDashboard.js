"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import RfqCard from "./RfqCard";

export default function VendorDashboard() {
  const [rfqs, setRfqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchRfqs = useCallback(async () => {
    try {
      const res = await fetch("/api/vendor/rfqs");
      if (res.ok) {
        setRfqs(await res.json());
        setLoadError(null);
      } else {
        setLoadError("Failed to load RFQs. Please try again.");
      }
    } catch {
      setLoadError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRfqs();
  }, [fetchRfqs]);

  const openIds = rfqs
    .filter((r) => r.status === "open")
    .map((r) => r.id)
    .join(",");

  useEffect(() => {
    if (!openIds) return;

    const channels = openIds
      .split(",")
      .map((id) =>
        supabase
          .channel(`rfq-${id}`)
          .on("broadcast", { event: "bids_changed" }, () => {
            fetchRfqs();
          })
          .subscribe()
      );

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [openIds, fetchRfqs]);

  if (loading) {
    return <p className="text-center text-slate-400">Loading...</p>;
  }

  return (
    <div>
      {loadError && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-600">{loadError}</p>
      )}

      {rfqs.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm">
          Nothing to show right now. Check back soon.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rfqs.map((rfq) => (
            <RfqCard key={rfq.id} rfq={rfq} onChanged={fetchRfqs} />
          ))}
        </div>
      )}
    </div>
  );
}
