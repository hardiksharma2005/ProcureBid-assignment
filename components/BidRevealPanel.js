"use client";

import { useEffect, useState } from "react";

function formatPoints(value, max) {
  return `${value.toFixed(2)} / ${max}`;
}

export default function BidRevealPanel({ rfq, onClose, onRfqUpdated, onRelaunch, relaunching }) {
  const [bids, setBids] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [awarding, setAwarding] = useState(false);
  const [awardNotice, setAwardNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchBids() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/rfqs/${rfq.id}/bids`);
        const body = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setLoadError(body.error ?? "Failed to load bids.");
          return;
        }
        setBids(body);
      } catch {
        if (!cancelled) setLoadError("Something went wrong. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBids();
    return () => {
      cancelled = true;
    };
  }, [rfq.id]);

  async function handleAward() {
    const confirmed = window.confirm(
      "Award this RFQ to the L1 (top-ranked) vendor? This cannot be undone."
    );
    if (!confirmed) return;

    setAwarding(true);
    setAwardNotice(null);
    try {
      const res = await fetch(`/api/rfqs/${rfq.id}/award`, { method: "POST" });
      const body = await res.json();

      if (body.rfq) onRfqUpdated?.(body.rfq);

      if (res.status === 409) {
        setAwardNotice({ type: "error", message: body.error });
        return;
      }
      if (!res.ok) {
        setAwardNotice({ type: "error", message: body.error ?? "Failed to award RFQ." });
        return;
      }
      if (body.tie) {
        setAwardNotice({ type: "tie", message: "Exact score tie — re-auction required." });
        return;
      }

      setAwardNotice({
        type: body.emailErrors > 0 ? "warning" : "success",
        message:
          body.emailErrors > 0
            ? `Awarded, but ${body.emailErrors} notification email(s) failed to send.`
            : "Awarded — vendors have been notified.",
      });
    } catch {
      setAwardNotice({ type: "error", message: "Something went wrong. Please try again." });
    } finally {
      setAwarding(false);
    }
  }

  const winner = bids?.find((b) => b.rank === 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{rfq.material}</h2>
            <p className="text-sm text-slate-500">Sealed bid reveal</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            Close
          </button>
        </div>

        {rfq.status === "awarded" && winner && (
          <p className="mt-4 rounded-md bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
            Awarded to {winner.vendor_name}
          </p>
        )}

        {rfq.status === "reauction" && !awardNotice && (
          <p className="mt-4 rounded-md bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
            This RFQ needs a re-auction.
          </p>
        )}

        {awardNotice && (
          <p
            className={`mt-4 rounded-md px-4 py-2 text-sm font-semibold ${
              awardNotice.type === "success"
                ? "bg-green-50 text-green-700"
                : awardNotice.type === "tie" || awardNotice.type === "warning"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-red-50 text-red-700"
            }`}
          >
            {awardNotice.message}
          </p>
        )}

        {loading && <p className="mt-6 text-center text-slate-400">Loading bids...</p>}
        {loadError && <p className="mt-6 text-center text-red-600">{loadError}</p>}

        {!loading && !loadError && bids && (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Rank</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Vendor</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Rating</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Price</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Delivery</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Price pts</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Delivery pts</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Rating pts</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bids.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-slate-400">
                      No bids were received for this RFQ.
                    </td>
                  </tr>
                )}
                {bids.map((bid) => (
                  <tr key={bid.vendor_id} className={bid.rank === 1 ? "bg-green-50" : ""}>
                    <td className="px-3 py-2 font-semibold text-slate-900">L{bid.rank}</td>
                    <td className="px-3 py-2 text-slate-700">{bid.vendor_name}</td>
                    <td className="px-3 py-2 text-slate-600">{bid.rating}</td>
                    <td className="px-3 py-2 text-slate-600">&#8377;{bid.price_inr}/kg</td>
                    <td className="px-3 py-2 text-slate-600">{bid.delivery_days}d</td>
                    <td className="px-3 py-2 text-slate-600">{formatPoints(bid.price_component, 60)}</td>
                    <td className="px-3 py-2 text-slate-600">{formatPoints(bid.delivery_component, 25)}</td>
                    <td className="px-3 py-2 text-slate-600">{formatPoints(bid.rating_component, 15)}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{bid.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          {rfq.status === "closed" && (
            <button
              onClick={handleAward}
              disabled={awarding}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {awarding ? "Awarding..." : "Award to L1"}
            </button>
          )}
          {rfq.status === "reauction" && (
            <button
              onClick={() => onRelaunch?.(rfq)}
              disabled={relaunching}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {relaunching ? "Relaunching..." : "Relaunch RFQ"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
