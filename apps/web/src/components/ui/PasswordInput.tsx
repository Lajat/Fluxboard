"use client";

import { useState, InputHTMLAttributes } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  hasError?: boolean;
  /** Applied to the OUTER wrapper (e.g. "mt-1" for spacing) — never the input itself, so the input's own border/padding/focus styling below can't accidentally be wiped out by a caller passing a plain className. */
  wrapperClassName?: string;
}

/**
 * A password <input> with a show/hide eye-icon toggle, styled to match the
 * rest of the auth forms. Pulled out as its own component since login,
 * signup, and reset-password all need identical behavior here — one place
 * to get the toggle logic and styling right rather than three copies.
 *
 * Deliberately does NOT accept a `className` override for the input
 * itself (only `wrapperClassName`, for outer spacing) — the input's
 * border/padding/focus-ring styling is fully determined by `hasError`
 * here, so every password field across the app stays visually identical
 * without each call site having to reproduce (and risk getting slightly
 * wrong) the same set of Tailwind classes.
 */
export function PasswordInput({ hasError, wrapperClassName, ...inputProps }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={`relative ${wrapperClassName ?? ""}`}>
      <input
        {...inputProps}
        type={isVisible ? "text" : "password"}
        className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm outline-none focus:ring-2 ${
          hasError
            ? "border-red-300 focus:border-red-400 focus:ring-red-100"
            : "border-slate-200 focus:border-brand-400 focus:ring-brand-100"
        }`}
      />
      <button
        type="button"
        onClick={() => setIsVisible((prev) => !prev)}
        aria-label={isVisible ? "Hide password" : "Show password"}
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
      >
        {isVisible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </button>
    </div>
  );
}
