"use client";

import { useEffect, useState } from "react";

function formatIST(isoString) {
  return new Date(isoString).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function describe(entry) {
  const d = entry.details ?? {};
  switch (entry.action) {
    case "rfq_created":
      return "RFQ created";
    case "rfq_published":
      return `Published — ${d.vendor_count ?? "all"} vendor(s) notified, ${d.window_minutes ?? "?"} minute window`;
    case "bid_placed":
      return `Sealed bid placed by ${d.vendor ?? "a vendor"} — ₹${d.price_inr}/kg, ${d.delivery_days} day(s) delivery`;
    case "auction_paused":
      return "Bidding paused by buyer";
    case "auction_resumed":
      return "Bidding resumed by buyer";
    case "auction_extended":
      return `Window extended by 3 minutes (extension ${d.extension_count ?? "?"}/3)`;
    case "closed_early":
      return "Bidding closed early by buyer";
    case "awarded":
      return d.overridden
        ? `Awarded to ${d.vendor} (score ${Number(d.score).toFixed(2)}) — override${d.reason ? `: ${d.reason}` : ""}`
        : `Awarded to ${d.vendor} (score ${Number(d.score).toFixed(2)})`;
    case "relaunched":
      return "Relaunched as a new draft RFQ";
    case "rfq_archived":
      return "Archived by buyer";
    case "rfq_unarchived":
      return "Unarchived by buyer";
    default:
      return entry.action;
  }
}

export default function ActivityLog({ rfqId }) {
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/rfqs/${rfqId}/activity`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Failed to load activity.");
          return;
        }
        setEntries(body.entries);
        setError(null);
      } catch {
        if (!cancelled) setError("Something went wrong. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [rfqId]);

  if (loading) return <p className="text-sm text-slate-400">Loading activity...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!entries || entries.length === 0) {
    return <p className="text-sm text-slate-400">No activity recorded yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 border-b border-slate-100 pb-2 text-sm last:border-0">
          <span className="w-40 shrink-0 text-xs text-slate-400">{formatIST(entry.created_at)}</span>
          <div className="flex-1">
            <p className="text-slate-700">{describe(entry)}</p>
            {entry.actor_email && (
              <p className="text-xs text-slate-400">
                {entry.actor_role ? `${entry.actor_role} · ` : ""}
                {entry.actor_email}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
