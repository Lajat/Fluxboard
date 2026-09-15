"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { CheckIcon, XIcon } from "./icons";

interface Toast {
  id: number;
  message: string;
  variant: "success" | "error";
}

interface ToastContextValue {
  showToast: (message: string, variant?: Toast["variant"]) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

/**
 * App-wide toast notifications. Replaces the old pattern of a single
 * `error` string rendered as a red paragraph at the top of each page —
 * toasts stack, auto-dismiss, and don't shift the page layout around
 * every time one appears or disappears.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, variant: Toast["variant"] = "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 animate-[toast-in_0.2s_ease-out] ${
              toast.variant === "error"
                ? "bg-red-50 text-red-700 ring-red-200"
                : "bg-white text-slate-700 ring-slate-200"
            }`}
          >
            <span className={`mt-0.5 ${toast.variant === "error" ? "text-red-500" : "text-emerald-500"}`}>
              {toast.variant === "error" ? <XIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
            </span>
            <span className="flex-1">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}
