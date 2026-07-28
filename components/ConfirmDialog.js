"use client";

import { useEffect, useRef } from "react";

/**
 * Reusable confirm modal — focus-trapped, closes on Escape/backdrop click
 * (unless `loading`, so an in-flight confirm can't be interrupted).
 *
 * @param {{
 *   open: boolean,
 *   title: string,
 *   message?: React.ReactNode,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   danger?: boolean,
 *   loading?: boolean,
 *   onConfirm: () => void,
 *   onCancel: () => void,
 *   children?: React.ReactNode,
 * }} props
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
  children,
}) {
  const dialogRef = useRef(null);
  const confirmButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement;
    confirmButtonRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        if (!loading) onCancel?.();
        return;
      }
      if (e.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const list = Array.from(focusable);
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 px-4"
      onClick={() => !loading && onCancel?.()}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
        {children && <div className="mt-3">{children}</div>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 ${
              danger ? "bg-red-600 hover:bg-red-500" : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {loading ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
