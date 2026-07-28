"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./ToastProvider";

const URGENT_THRESHOLD_MS = 60_000;

function formatIST(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function formatCountdown(ms) {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function useCountdown(windowEnd, active, onExpire) {
  const [remainingMs, setRemainingMs] = useState(() =>
    windowEnd ? new Date(windowEnd).getTime() - Date.now() : 0
  );
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!active || !windowEnd) return;
    const target = new Date(windowEnd).getTime();
    let firedExpire = false;

    const tick = () => {
      const diff = target - Date.now();
      setRemainingMs(diff);
      if (diff <= 0) {
        clearInterval(id);
        if (!firedExpire) {
          firedExpire = true;
          onExpireRef.current?.();
        }
      }
    };

    const id = setInterval(tick, 1000);
    tick();

    return () => clearInterval(id);
  }, [windowEnd, active]);

  return remainingMs;
}

export default function BuyerMonitorConsole({ rfqId }) {
  const { push: pushToast } = useToast();
  const [rfq, setRfq] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/rfqs/${rfqId}/monitor`);
      const body = await res.json();

      if (!res.ok) {
        setLoadError(body.error ?? "Failed to load the monitor.");
        return;
      }
      setRfq(body.rfq);
      setBids(body.bids);
      setLoadError(null);
    } catch {
      setLoadError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [rfqId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`rfq-${rfqId}`)
      .on("broadcast", { event: "bids_changed" }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rfqId, fetchData]);

  const isOpen = rfq?.status === "open";
  const remainingMs = useCountdown(rfq?.window_end, isOpen, fetchData);
  const closed = !isOpen || remainingMs <= 0;
  const urgent = isOpen && !closed && remainingMs <= URGENT_THRESHOLD_MS;

  async function handleCloseNow() {
    setClosing(true);
    try {
      const res = await fetch(`/api/rfqs/${rfqId}/close`, { method: "POST" });
      const body = await res.json();

      if (!res.ok) {
        pushToast({ variant: "error", message: body.error ?? "Failed to close bidding." });
        return;
      }

      setRfq(body.rfq);
      pushToast({
        variant: body.emailErrors > 0 ? "info" : "success",
        message:
          body.emailErrors > 0
            ? `Bidding closed, but ${body.emailErrors} vendor email(s) failed to send.`
            : "Bidding closed early — vendors have been notified.",
      });
    } catch {
      pushToast({ variant: "error", message: "Something went wrong. Please try again." });
    } finally {
      setClosing(false);
      setCloseConfirmOpen(false);
    }
  }

  if (loading) {
    return <p className="text-center text-slate-400">Loading...</p>;
  }

  if (loadError) {
    return <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-600">{loadError}</p>;
  }

  if (!rfq) return null;

  return (
    <div className="w-full max-w-4xl">
      <Link href="/buyer" className="text-sm font-medium text-indigo-600 hover:underline">
        &larr; Back to dashboard
      </Link>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{rfq.material}</h1>
            <dl className="mt-2 space-y-1 text-sm text-slate-600">
              <div className="flex gap-2">
                <dt className="font-medium text-slate-500">Quantity:</dt>
                <dd>{rfq.quantity_kg} kg</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-slate-500">Ceiling price:</dt>
                <dd>&#8377;{rfq.ceiling_price_inr}/kg</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-slate-500">Bids so far:</dt>
                <dd className="font-semibold text-slate-900">{bids.length}</dd>
              </div>
            </dl>
          </div>

          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {isOpen ? "Time remaining" : "Status"}
            </p>
            <p
              className={`text-3xl font-bold tabular-nums ${
                closed ? "text-slate-400" : urgent ? "text-red-600" : "text-slate-900"
              }`}
            >
              {closed
                ? rfq.status === "open"
                  ? "Closing..."
                  : "Closed"
                : formatCountdown(remainingMs)}
            </p>
            {isOpen && (
              <button
                onClick={() => setCloseConfirmOpen(true)}
                className="mt-3 rounded-md border border-red-600 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
              >
                Close bidding now
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
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
              <th className="px-3 py-2 text-left font-medium text-slate-500">Bid time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bids.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-400">
                  No bids yet.
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
                <td className="px-3 py-2 text-slate-600">{bid.price_component.toFixed(2)}</td>
                <td className="px-3 py-2 text-slate-600">{bid.delivery_component.toFixed(2)}</td>
                <td className="px-3 py-2 text-slate-600">{bid.rating_component.toFixed(2)}</td>
                <td className="px-3 py-2 font-semibold text-slate-900">{bid.total.toFixed(2)}</td>
                <td className="px-3 py-2 text-slate-500">{formatIST(bid.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={closeConfirmOpen}
        title="Close bidding now?"
        message="Vendors will be notified that bidding closed early. This cannot be undone."
        confirmLabel="Close bidding"
        danger
        loading={closing}
        onConfirm={handleCloseNow}
        onCancel={() => !closing && setCloseConfirmOpen(false)}
      />
    </div>
  );
}
