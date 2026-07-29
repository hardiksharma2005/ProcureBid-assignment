"use client";

import { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import ActivityLog from "./ActivityLog";
import { useToast } from "./ToastProvider";
import { formatInr } from "@/lib/formatInr";

function formatPoints(value, max) {
  return `${value.toFixed(2)} / ${max}`;
}

export default function BidRevealPanel({ rfq, onClose, onRfqUpdated, onRelaunch, relaunching }) {
  const { push: pushToast } = useToast();
  const [bids, setBids] = useState(null);
  const [award, setAward] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [awarding, setAwarding] = useState(false);
  const [awardTarget, setAwardTarget] = useState(null);
  const [awardReason, setAwardReason] = useState("");
  const [tab, setTab] = useState("bids");

  const loadBids = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/rfqs/${rfq.id}/bids`);
      const body = await res.json();

      if (!res.ok) {
        setLoadError(body.error ?? "Failed to load bids.");
        return;
      }
      setBids(body.bids);
      setAward(body.award);
    } catch {
      setLoadError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [rfq.id]);

  useEffect(() => {
    loadBids();
  }, [loadBids]);

  const topRankedVendorId = bids?.find((bid) => bid.rank === 1)?.vendor_id ?? null;

  function openAwardConfirm(bid) {
    setAwardReason("");
    setAwardTarget(bid);
  }

  async function handleConfirmAward() {
    if (!awardTarget) return;

    setAwarding(true);
    try {
      const res = await fetch(`/api/rfqs/${rfq.id}/award`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_id: awardTarget.vendor_id,
          reason: awardReason.trim() || null,
        }),
      });
      const body = await res.json();

      if (body.rfq) onRfqUpdated?.(body.rfq);

      if (res.status === 409) {
        pushToast({ variant: "error", message: body.error });
        return;
      }
      if (!res.ok) {
        pushToast({ variant: "error", message: body.error ?? "Failed to award RFQ." });
        return;
      }
      if (body.tie) {
        pushToast({ variant: "info", message: "Exact score tie — re-auction required." });
        return;
      }

      pushToast({
        variant: body.emailErrors > 0 ? "info" : "success",
        message:
          body.emailErrors > 0
            ? `Awarded, but ${body.emailErrors} notification email(s) failed to send.`
            : "Awarded — vendors have been notified.",
      });
      await loadBids();
    } catch {
      pushToast({ variant: "error", message: "Something went wrong. Please try again." });
    } finally {
      setAwarding(false);
      setAwardTarget(null);
    }
  }

  const winner = award
    ? bids?.find((bid) => bid.vendor_id === award.vendor_id)
    : bids?.find((bid) => bid.rank === 1);

  let savings = null;
  if (rfq.status === "awarded" && winner) {
    const baseline = Number(rfq.ceiling_price_inr) * Number(rfq.quantity_kg);
    const final = Number(winner.price_inr) * Number(rfq.quantity_kg);
    const amount = baseline - final;
    savings = {
      amount,
      percent: baseline > 0 ? (amount / baseline) * 100 : 0,
    };
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
        onClick={onClose}
      >
        <div
          className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
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
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
              <span>Awarded to {winner.vendor_name}</span>
              {award?.overridden && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                  Override award
                </span>
              )}
            </div>
          )}

          {rfq.status === "awarded" && savings && (
            <p className="mt-2 text-sm font-medium text-green-700">
              Saved {formatInr(savings.amount)} ({savings.percent.toFixed(1)}%) against ceiling
            </p>
          )}

          {rfq.status === "awarded" && award?.overridden && award?.award_reason && (
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium text-slate-700">Reason for override:</span>{" "}
              {award.award_reason}
            </p>
          )}

          {rfq.status === "reauction" && (
            <p className="mt-4 rounded-md bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
              This RFQ needs a re-auction.
            </p>
          )}

          <div className="mt-4 flex gap-1 border-b border-slate-200">
            {["bids", "activity"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize transition ${
                  tab === t
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t === "bids" ? "Bids" : "Activity"}
              </button>
            ))}
          </div>

          {loading && <p className="mt-6 text-center text-slate-400">Loading bids...</p>}
          {loadError && <p className="mt-6 text-center text-red-600">{loadError}</p>}

          {tab === "activity" && (
            <div className="mt-4">
              <ActivityLog rfqId={rfq.id} />
            </div>
          )}

          {tab === "bids" && !loading && !loadError && bids && (
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
                    {rfq.status === "closed" && <th className="px-3 py-2"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bids.length === 0 && (
                    <tr>
                      <td
                        colSpan={rfq.status === "closed" ? 10 : 9}
                        className="px-3 py-6 text-center text-slate-400"
                      >
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
                      <td className="px-3 py-2 text-slate-600">
                        {formatPoints(bid.price_component, 60)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {formatPoints(bid.delivery_component, 25)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {formatPoints(bid.rating_component, 15)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {bid.total.toFixed(2)}
                      </td>
                      {rfq.status === "closed" && (
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => openAwardConfirm(bid)}
                            className="whitespace-nowrap rounded-md border border-indigo-600 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                          >
                            {bid.vendor_id === topRankedVendorId
                              ? "Award to L1 (recommended)"
                              : "Award to this vendor"}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
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

      <ConfirmDialog
        open={!!awardTarget}
        title={
          awardTarget
            ? awardTarget.vendor_id === topRankedVendorId
              ? `Award to ${awardTarget.vendor_name} (L1)?`
              : `Award to ${awardTarget.vendor_name} instead of L1?`
            : ""
        }
        message="This cannot be undone. Vendors will be notified by email."
        confirmLabel="Award"
        loading={awarding}
        onConfirm={handleConfirmAward}
        onCancel={() => !awarding && setAwardTarget(null)}
      >
        {awardTarget && awardTarget.vendor_id !== topRankedVendorId && (
          <div>
            <label htmlFor="override-reason" className="block text-sm font-medium text-slate-700">
              Reason for override (optional)
            </label>
            <textarea
              id="override-reason"
              value={awardReason}
              onChange={(e) => setAwardReason(e.target.value)}
              rows={3}
              placeholder="e.g. L1 vendor flagged quality issues on a prior order"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
