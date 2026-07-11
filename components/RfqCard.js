"use client";

import { useEffect, useRef, useState } from "react";
import { computeScore } from "@/lib/scoring";

const URGENT_THRESHOLD_MS = 60_000;

function useCountdown(windowEnd, onExpire) {
  const [remainingMs, setRemainingMs] = useState(
    () => new Date(windowEnd).getTime() - Date.now()
  );
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
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
  }, [windowEnd]);

  return remainingMs;
}

function formatCountdown(ms) {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const OUTCOME_BADGE = {
  awarded: { label: "Awarded", className: "bg-indigo-100 text-indigo-700" },
  reauction: { label: "Re-auction", className: "bg-amber-100 text-amber-700" },
};

function RfqOutcomeCard({ rfq }) {
  const badge = OUTCOME_BADGE[rfq.status];
  const won = rfq.status === "awarded" && rfq.outcome === "won";

  const message =
    rfq.status === "awarded"
      ? won
        ? "You won this contract 🎉"
        : "Contract awarded to another vendor"
      : "Re-auction pending — watch for a new invitation.";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{rfq.material}</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <dl className="mt-3 space-y-1 text-sm text-slate-600">
        <div className="flex justify-between">
          <dt>Quantity</dt>
          <dd>{rfq.quantity_kg} kg</dd>
        </div>
        <div className="flex justify-between">
          <dt>Ceiling price</dt>
          <dd>&#8377;{rfq.ceiling_price_inr}/kg</dd>
        </div>
      </dl>

      <p className={`mt-4 text-sm ${won ? "font-semibold text-green-600" : "text-slate-500"}`}>
        {message}
      </p>
    </div>
  );
}

export default function RfqCard({ rfq, onChanged }) {
  // Hooks must run unconditionally on every render, so useCountdown and the
  // form state are always called — the non-open early return happens after.
  // Only pass onExpire when actually open, so an already-decided RFQ
  // doesn't fire a spurious refetch on mount (its window_end is always in
  // the past).
  const isOpen = rfq.status === "open";
  const remainingMs = useCountdown(rfq.window_end, isOpen ? onChanged : undefined);

  const [form, setForm] = useState({ price_inr: "", delivery_days: "" });
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(null);

  if (!isOpen) {
    return <RfqOutcomeCard rfq={rfq} />;
  }

  const closed = remainingMs <= 0;
  const urgent = !closed && remainingMs <= URGENT_THRESHOLD_MS;

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    const price_inr = Number(form.price_inr);
    const delivery_days = Number(form.delivery_days);

    if (!(price_inr > 0) || price_inr > rfq.ceiling_price_inr) {
      setFormError(`Price must be a positive number, at most ₹${rfq.ceiling_price_inr}/kg.`);
      return;
    }
    if (!Number.isInteger(delivery_days) || delivery_days < 1 || delivery_days > 60) {
      setFormError("Delivery days must be a whole number between 1 and 60.");
      return;
    }

    const confirmed = window.confirm(
      "Sealed bid — one submission only, it cannot be changed. Submit this bid?"
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/vendor/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfq_id: rfq.id, price_inr, delivery_days }),
      });
      const body = await res.json();

      if (!res.ok) {
        setFormError(body.error ?? "Failed to submit bid.");
        return;
      }

      setJustSubmitted({ price_inr, delivery_days, rank: body.rank, total_bids: body.total_bids });
      onChanged?.();
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Prefer the always-fresh server data (rfq.has_bid) once it catches up —
  // justSubmitted only bridges the gap between "I just submitted" and the
  // next parent refetch, otherwise a stale local rank would stick around
  // instead of updating live as other vendors bid.
  const bidInfo = rfq.has_bid
    ? { price_inr: rfq.price_inr, delivery_days: rfq.delivery_days, rank: rfq.rank, total_bids: rfq.total_bids }
    : justSubmitted;

  // Live preview of the vendor's own prospective score — uses only data
  // they're already entitled to (their own price/delivery plus their own
  // rating), never anything about other vendors' bids.
  const previewPrice = Number(form.price_inr);
  const previewDelivery = Number(form.delivery_days);
  const previewScore =
    previewPrice > 0 &&
    previewPrice <= rfq.ceiling_price_inr &&
    Number.isInteger(previewDelivery) &&
    previewDelivery >= 1 &&
    previewDelivery <= 60
      ? computeScore({
          price_inr: previewPrice,
          ceiling_price_inr: rfq.ceiling_price_inr,
          delivery_days: previewDelivery,
          max_delivery_days: 60,
          rating: rfq.vendor_rating ?? 0,
        })
      : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{rfq.material}</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            closed
              ? "bg-slate-200 text-slate-600"
              : urgent
                ? "bg-red-100 text-red-700"
                : "bg-green-100 text-green-700"
          }`}
        >
          {closed ? "Bidding closed" : formatCountdown(remainingMs)}
        </span>
      </div>

      <dl className="mt-3 space-y-1 text-sm text-slate-600">
        <div className="flex justify-between">
          <dt>Quantity</dt>
          <dd>{rfq.quantity_kg} kg</dd>
        </div>
        <div className="flex justify-between">
          <dt>Ceiling price</dt>
          <dd>&#8377;{rfq.ceiling_price_inr}/kg</dd>
        </div>
      </dl>

      {rfq.description && <p className="mt-2 text-sm text-slate-500">{rfq.description}</p>}

      {bidInfo && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm text-slate-600">
            Your bid: &#8377;{bidInfo.price_inr}/kg, {bidInfo.delivery_days} day(s)
          </p>
          <p
            className={`mt-1 text-lg font-bold ${
              bidInfo.rank === 1 ? "text-green-600" : "text-amber-600"
            }`}
          >
            Your position: L{bidInfo.rank} of {bidInfo.total_bids} bids
          </p>
        </div>
      )}

      {!bidInfo && !closed && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <p className="text-xs font-medium text-amber-600">
            Sealed bid — one submission only, it cannot be changed.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`price-${rfq.id}`}
                className="block text-xs font-medium text-slate-700"
              >
                Price (&#8377;/kg)
              </label>
              <input
                id={`price-${rfq.id}`}
                type="number"
                min="0"
                step="any"
                value={form.price_inr}
                onChange={(e) => setForm((f) => ({ ...f, price_inr: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label
                htmlFor={`delivery-${rfq.id}`}
                className="block text-xs font-medium text-slate-700"
              >
                Delivery (days)
              </label>
              <input
                id={`delivery-${rfq.id}`}
                type="number"
                min="1"
                max="60"
                step="1"
                value={form.delivery_days}
                onChange={(e) => setForm((f) => ({ ...f, delivery_days: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {previewScore !== null && (
            <p className="text-xs text-slate-500">
              Your estimated score: <span className="font-semibold text-indigo-600">{previewScore.toFixed(1)}/100</span>
            </p>
          )}

          {formError && <p className="text-xs text-red-600">{formError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit sealed bid"}
          </button>
        </form>
      )}

      {!bidInfo && closed && (
        <p className="mt-4 text-sm text-slate-400">
          Bidding closed — you did not submit a bid.
        </p>
      )}
    </div>
  );
}
