"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

let idCounter = 0;

const VARIANT_STYLES = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-slate-200 bg-white text-slate-800",
};

/**
 * Top-right toast stack. Mount once at the root layout; call useToast()
 * anywhere below it to push a toast.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    ({ variant = "info", message, action, duration = 4000 }) => {
      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, variant, message, action }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[300] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
              VARIANT_STYLES[toast.variant] ?? VARIANT_STYLES.info
            }`}
          >
            <p className="flex-1">{toast.message}</p>
            {toast.action && (
              <a href={toast.action.href} className="shrink-0 font-semibold underline">
                {toast.action.label}
              </a>
            )}
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="shrink-0 text-lg leading-none text-current opacity-60 hover:opacity-100"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
