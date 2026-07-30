"use client";

import { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./ToastProvider";

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function formatDate(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
  });
}

function RatingEditor({ vendor, onSaved }) {
  const { push: pushToast } = useToast();
  const [rating, setRating] = useState(vendor.rating ?? 3.5);
  const [saving, setSaving] = useState(false);

  const dirty = Number(rating) !== Number(vendor.rating);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/vendors/${vendor.id}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: Number(rating) }),
      });
      const body = await res.json();

      if (!res.ok) {
        pushToast({ variant: "error", message: body.error ?? "Failed to update rating." });
        return;
      }

      onSaved(body.vendor);
      pushToast({ variant: "success", message: "Rating updated." });
    } catch {
      pushToast({ variant: "error", message: "Something went wrong. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min="1"
        max="5"
        step="0.1"
        value={rating}
        onChange={(e) => setRating(e.target.value)}
        className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      )}
    </div>
  );
}

export default function VendorApprovalConsole() {
  const { push: pushToast } = useToast();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [approveTarget, setApproveTarget] = useState(null);
  const [approveRating, setApproveRating] = useState(3.5);
  const [approveLoading, setApproveLoading] = useState(false);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);

  const [suspendTarget, setSuspendTarget] = useState(null);
  const [suspendLoading, setSuspendLoading] = useState(false);

  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch("/api/vendors");
      const body = await res.json();

      if (!res.ok) {
        setLoadError(body.error ?? "Failed to load vendors.");
        return;
      }
      setVendors(body);
      setLoadError(null);
    } catch {
      setLoadError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  function replaceVendor(updated) {
    setVendors((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
  }

  function openApprove(vendor) {
    setApproveTarget(vendor);
    setApproveRating(vendor.rating ?? 3.5);
  }

  async function handleApprove() {
    if (!approveTarget) return;
    setApproveLoading(true);
    try {
      const res = await fetch(`/api/vendors/${approveTarget.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: Number(approveRating) }),
      });
      const body = await res.json();

      if (!res.ok) {
        pushToast({ variant: "error", message: body.error ?? "Failed to approve vendor." });
        return;
      }

      replaceVendor(body.vendor);
      pushToast({ variant: "success", message: `${body.vendor.company_name} approved.` });
      setApproveTarget(null);
    } catch {
      pushToast({ variant: "error", message: "Something went wrong. Please try again." });
    } finally {
      setApproveLoading(false);
    }
  }

  function openReject(vendor) {
    setRejectTarget(vendor);
    setRejectReason("");
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setRejectLoading(true);
    try {
      const res = await fetch(`/api/vendors/${rejectTarget.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const body = await res.json();

      if (!res.ok) {
        pushToast({ variant: "error", message: body.error ?? "Failed to reject vendor." });
        return;
      }

      replaceVendor(body.vendor);
      pushToast({ variant: "success", message: `${body.vendor.company_name} rejected.` });
      setRejectTarget(null);
    } catch {
      pushToast({ variant: "error", message: "Something went wrong. Please try again." });
    } finally {
      setRejectLoading(false);
    }
  }

  async function handleSuspend() {
    if (!suspendTarget) return;
    setSuspendLoading(true);
    try {
      const res = await fetch(`/api/vendors/${suspendTarget.id}/suspend`, { method: "POST" });
      const body = await res.json();

      if (!res.ok) {
        pushToast({ variant: "error", message: body.error ?? "Failed to suspend vendor." });
        return;
      }

      replaceVendor(body.vendor);
      pushToast({ variant: "success", message: `${body.vendor.company_name} suspended.` });
      setSuspendTarget(null);
    } catch {
      pushToast({ variant: "error", message: "Something went wrong. Please try again." });
    } finally {
      setSuspendLoading(false);
    }
  }

  if (loading) {
    return <p className="text-center text-slate-400">Loading...</p>;
  }
  if (loadError) {
    return <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-600">{loadError}</p>;
  }

  return (
    <div className="w-full max-w-5xl">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Company</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Contact</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Email</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Phone</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Rating</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Registered</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vendors.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  No vendors yet.
                </td>
              </tr>
            )}
            {vendors.map((vendor) => (
              <tr key={vendor.id}>
                <td className="px-3 py-2 font-medium text-slate-900">{vendor.company_name || "—"}</td>
                <td className="px-3 py-2 text-slate-700">{vendor.name}</td>
                <td className="px-3 py-2 text-slate-600">{vendor.email}</td>
                <td className="px-3 py-2 text-slate-600">{vendor.contact_phone || "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                      STATUS_STYLES[vendor.status] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {vendor.status}
                  </span>
                  {vendor.status === "rejected" && vendor.rejection_reason && (
                    <p className="mt-1 max-w-[16rem] text-xs text-slate-500">
                      &ldquo;{vendor.rejection_reason}&rdquo;
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {vendor.status === "approved" ? (
                    <RatingEditor vendor={vendor} onSaved={replaceVendor} />
                  ) : (
                    (vendor.rating ?? "—")
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500">{formatDate(vendor.registered_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {vendor.status === "pending" && (
                      <>
                        <button
                          onClick={() => openApprove(vendor)}
                          className="rounded-md border border-green-600 px-3 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => openReject(vendor)}
                          className="rounded-md border border-red-600 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {vendor.status === "approved" && (
                      <button
                        onClick={() => setSuspendTarget(vendor)}
                        className="rounded-md border border-amber-600 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                      >
                        Suspend
                      </button>
                    )}
                    {vendor.status === "rejected" && (
                      <button
                        onClick={() => openApprove(vendor)}
                        className="rounded-md border border-green-600 px-3 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-50"
                      >
                        Re-approve
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!approveTarget}
        title={`Approve ${approveTarget?.company_name ?? "vendor"}?`}
        message="Set their initial rating (1.0–5.0). This feeds the 15% score weight when they bid."
        confirmLabel="Approve"
        loading={approveLoading}
        onConfirm={handleApprove}
        onCancel={() => !approveLoading && setApproveTarget(null)}
      >
        <label htmlFor="approve-rating" className="block text-sm font-medium text-slate-700">
          Rating
        </label>
        <input
          id="approve-rating"
          type="number"
          min="1"
          max="5"
          step="0.1"
          value={approveRating}
          onChange={(e) => setApproveRating(e.target.value)}
          className="mt-1 w-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!rejectTarget}
        title={`Reject ${rejectTarget?.company_name ?? "vendor"}?`}
        message="An optional reason will be included in the notification email."
        confirmLabel="Reject"
        danger
        loading={rejectLoading}
        onConfirm={handleReject}
        onCancel={() => !rejectLoading && setRejectTarget(null)}
      >
        <label htmlFor="reject-reason" className="block text-sm font-medium text-slate-700">
          Reason (optional)
        </label>
        <textarea
          id="reject-reason"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!suspendTarget}
        title={`Suspend ${suspendTarget?.company_name ?? "vendor"}?`}
        message="They'll stop receiving RFQ invitations and lose vendor portal access until re-approved."
        confirmLabel="Suspend"
        danger
        loading={suspendLoading}
        onConfirm={handleSuspend}
        onCancel={() => !suspendLoading && setSuspendTarget(null)}
      />
    </div>
  );
}
