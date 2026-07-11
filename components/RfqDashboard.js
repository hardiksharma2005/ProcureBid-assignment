"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import BidRevealPanel from "./BidRevealPanel";

const DEFAULT_FORM = {
  material: "",
  quantity_kg: "",
  ceiling_price_inr: "",
  description: "",
  window_minutes: "45",
};

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700",
  open: "bg-green-100 text-green-700",
  closed: "bg-slate-200 text-slate-600",
  awarded: "bg-indigo-100 text-indigo-700",
  reauction: "bg-amber-100 text-amber-700",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
        STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {status}
    </span>
  );
}

function formatIST(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function RfqDashboard() {
  const [rfqs, setRfqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [publishingId, setPublishingId] = useState(null);
  const [publishNotice, setPublishNotice] = useState(null);
  const [viewingRfq, setViewingRfq] = useState(null);
  const [relaunchingId, setRelaunchingId] = useState(null);
  const [relaunchNotice, setRelaunchNotice] = useState(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [ceilingSuggestion, setCeilingSuggestion] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const fetchRfqs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rfqs");
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

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAutoFill() {
    if (!aiText.trim()) return;

    setAiError(null);
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/parse-rfq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText }),
      });
      const body = await res.json();

      if (!res.ok) {
        setAiError(body.error ?? "Could not parse requirement — please fill the form manually.");
        return;
      }

      const { fields } = body;
      setForm((prev) => ({
        ...prev,
        material: fields.material ?? prev.material,
        quantity_kg: fields.quantity_kg !== null ? String(fields.quantity_kg) : prev.quantity_kg,
        description: fields.description ?? prev.description,
        window_minutes:
          fields.window_minutes !== null ? String(fields.window_minutes) : prev.window_minutes,
      }));

      setCeilingSuggestion(
        fields.ceiling_price_suggestion_inr_per_kg !== null
          ? { value: fields.ceiling_price_suggestion_inr_per_kg, note: fields.price_note ?? "" }
          : null
      );
    } catch {
      setAiError("Something went wrong. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  function handleUseSuggestion() {
    if (!ceilingSuggestion) return;
    updateField("ceiling_price_inr", String(ceilingSuggestion.value));
    setCeilingSuggestion(null);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setFormError(null);

    if (!form.material.trim()) {
      setFormError("Material is required.");
      return;
    }
    if (!(Number(form.quantity_kg) > 0)) {
      setFormError("Quantity (kg) must be a positive number.");
      return;
    }
    if (!(Number(form.ceiling_price_inr) > 0)) {
      setFormError("Ceiling price (INR/kg) must be a positive number.");
      return;
    }
    const windowMinutes = form.window_minutes === "" ? 45 : Number(form.window_minutes);
    if (!Number.isInteger(windowMinutes) || windowMinutes <= 0) {
      setFormError("Window minutes must be a positive whole number.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/rfqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material: form.material,
          quantity_kg: Number(form.quantity_kg),
          ceiling_price_inr: Number(form.ceiling_price_inr),
          description: form.description,
          window_minutes: windowMinutes,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        setFormError(body.error ?? "Failed to create RFQ.");
        return;
      }

      setRfqs((prev) => [body, ...prev]);
      setForm(DEFAULT_FORM);
      setAiText("");
      setAiError(null);
      setCeilingSuggestion(null);
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateRfqInList(updatedRfq) {
    setRfqs((prev) => prev.map((r) => (r.id === updatedRfq.id ? updatedRfq : r)));
  }

  async function handlePublish(rfq) {
    const confirmed = window.confirm(
      `Publish "${rfq.material}" and notify all vendors by email? This cannot be undone.`
    );
    if (!confirmed) return;

    setPublishingId(rfq.id);
    setPublishNotice(null);
    try {
      const res = await fetch(`/api/rfqs/${rfq.id}/publish`, { method: "POST" });
      const body = await res.json();

      if (!res.ok) {
        setPublishNotice({ type: "error", message: body.error ?? "Failed to publish RFQ." });
        return;
      }

      updateRfqInList(body.rfq);
      setPublishNotice({
        type: body.emailErrors > 0 ? "warning" : "success",
        message:
          body.emailErrors > 0
            ? `Published, but ${body.emailErrors} vendor email(s) failed to send.`
            : "Published — vendors have been notified.",
      });
    } catch {
      setPublishNotice({ type: "error", message: "Something went wrong. Please try again." });
    } finally {
      setPublishingId(null);
    }
  }

  async function handleRelaunch(rfq) {
    const confirmed = window.confirm(`Relaunch "${rfq.material}" as a new draft RFQ?`);
    if (!confirmed) return;

    setRelaunchingId(rfq.id);
    setRelaunchNotice(null);
    try {
      const res = await fetch(`/api/rfqs/${rfq.id}/relaunch`, { method: "POST" });
      const body = await res.json();

      if (!res.ok) {
        setRelaunchNotice({ type: "error", message: body.error ?? "Failed to relaunch RFQ." });
        return;
      }

      setRfqs((prev) => [body, ...prev]);
      setViewingRfq(null);
      setRelaunchNotice({
        type: "success",
        message: `Relaunched as a new draft RFQ: "${body.material}".`,
      });
    } catch {
      setRelaunchNotice({ type: "error", message: "Something went wrong. Please try again." });
    } finally {
      setRelaunchingId(null);
    }
  }

  return (
    <div className="w-full max-w-3xl">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create RFQ</h2>

        <div className="mt-4 rounded-md border border-indigo-200 bg-indigo-50/50 p-4">
          <label htmlFor="ai-text" className="block text-sm font-medium text-slate-700">
            AI assist (optional)
          </label>
          <textarea
            id="ai-text"
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Describe what you need, e.g. 'need 800kg of 8mm TMT bars, IS 1786, delivery within 3 weeks'"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={handleAutoFill}
            disabled={aiLoading || !aiText.trim()}
            className="mt-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {aiLoading ? "Thinking..." : "Auto-fill with AI"}
          </button>
          {aiError && <p className="mt-2 text-sm text-red-600">{aiError}</p>}
        </div>

        <form onSubmit={handleCreate} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rfq-material" className="block text-sm font-medium text-slate-700">
                Material
              </label>
              <input
                id="rfq-material"
                type="text"
                value={form.material}
                onChange={(e) => updateField("material", e.target.value)}
                placeholder="e.g. TMT Steel Bars"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="rfq-quantity" className="block text-sm font-medium text-slate-700">
                Quantity (kg)
              </label>
              <input
                id="rfq-quantity"
                type="number"
                min="0"
                step="any"
                value={form.quantity_kg}
                onChange={(e) => updateField("quantity_kg", e.target.value)}
                placeholder="1000"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="rfq-ceiling" className="block text-sm font-medium text-slate-700">
                Ceiling price (&#8377;/kg)
              </label>
              <input
                id="rfq-ceiling"
                type="number"
                min="0"
                step="any"
                value={form.ceiling_price_inr}
                onChange={(e) => updateField("ceiling_price_inr", e.target.value)}
                placeholder="65"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {ceilingSuggestion && (
                <div className="mt-2 flex items-start justify-between gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                  <p>
                    AI suggests ~&#8377;{ceilingSuggestion.value}/kg
                    {ceilingSuggestion.note ? ` — ${ceilingSuggestion.note}` : ""}. Indicative
                    only, verify current market rates.
                  </p>
                  <div className="flex shrink-0 items-start gap-2">
                    <button
                      type="button"
                      onClick={handleUseSuggestion}
                      className="font-semibold underline"
                    >
                      Use this
                    </button>
                    <button
                      type="button"
                      onClick={() => setCeilingSuggestion(null)}
                      className="text-indigo-400 hover:text-indigo-600"
                      aria-label="Dismiss suggestion"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="rfq-window" className="block text-sm font-medium text-slate-700">
                Bidding window (minutes)
              </label>
              <input
                id="rfq-window"
                type="number"
                min="1"
                step="1"
                value={form.window_minutes}
                onChange={(e) => updateField("window_minutes", e.target.value)}
                placeholder="45"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="rfq-description" className="block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="rfq-description"
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
              placeholder="Grade, specification, delivery location, etc."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create RFQ"}
          </button>
        </form>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">RFQs</h2>

        {loadError && <p className="mt-2 text-sm text-red-600">{loadError}</p>}

        {publishNotice && (
          <p
            className={`mt-2 text-sm ${
              publishNotice.type === "success"
                ? "text-green-600"
                : publishNotice.type === "warning"
                  ? "text-amber-600"
                  : "text-red-600"
            }`}
          >
            {publishNotice.message}
          </p>
        )}

        {relaunchNotice && (
          <p
            className={`mt-2 text-sm ${
              relaunchNotice.type === "success" ? "text-green-600" : "text-red-600"
            }`}
          >
            {relaunchNotice.message}
          </p>
        )}

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Material</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Quantity</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Ceiling price</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Status</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Bids</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Window ends</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Created</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && rfqs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                    No RFQs yet.
                  </td>
                </tr>
              )}

              {rfqs.map((rfq) => (
                <tr key={rfq.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{rfq.material}</td>
                  <td className="px-4 py-3 text-slate-600">{rfq.quantity_kg} kg</td>
                  <td className="px-4 py-3 text-slate-600">
                    &#8377;{rfq.ceiling_price_inr}/kg
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={rfq.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {rfq.status === "draft" ? "—" : rfq.bid_count}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {rfq.status === "open" ? formatIST(rfq.window_end) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(rfq.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {rfq.status === "draft" && (
                        <button
                          onClick={() => handlePublish(rfq)}
                          disabled={publishingId === rfq.id}
                          className="rounded-md border border-indigo-600 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
                        >
                          {publishingId === rfq.id ? "Publishing..." : "Publish & notify vendors"}
                        </button>
                      )}
                      {(rfq.status === "closed" ||
                        rfq.status === "awarded" ||
                        rfq.status === "reauction") && (
                        <button
                          onClick={() => setViewingRfq(rfq)}
                          className="rounded-md border border-indigo-600 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                        >
                          View bids &amp; award
                        </button>
                      )}
                      {rfq.status === "reauction" && (
                        <button
                          onClick={() => handleRelaunch(rfq)}
                          disabled={relaunchingId === rfq.id}
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {relaunchingId === rfq.id ? "Relaunching..." : "Relaunch RFQ"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewingRfq && (
        <BidRevealPanel
          rfq={viewingRfq}
          onClose={() => setViewingRfq(null)}
          onRfqUpdated={(updated) => {
            updateRfqInList(updated);
            setViewingRfq(updated);
          }}
          onRelaunch={handleRelaunch}
          relaunching={relaunchingId === viewingRfq.id}
        />
      )}
    </div>
  );
}
