"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { avatarColorFor, initialsFor } from "@/lib/avatar";
import { LogOutIcon, ChevronDownIcon } from "./ui/icons";
import { APP_NAME, APP_VERSION } from "@/lib/constants";

/**
 * The avatar-triggered account menu shown on the workspaces page (and
 * anywhere else that needs it) — replaces a plain "Signed in as X" line
 * plus a separate "Log out" link with the pattern most current apps use:
 * a single avatar in the corner, click to reveal account info and
 * actions. Log out lives here even though it's also in the sidebar —
 * that's deliberate, not a duplication bug: this page doesn't always
 * have the sidebar in view (e.g. on narrow screens before it's opened),
 * and having the account menu be self-contained is the more standard
 * pattern regardless.
 */
export function ProfileMenu() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape — standard dropdown behavior;
  // without this it'd only close by clicking the trigger again, which
  // most users don't expect.
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  if (!user) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Account menu"
        aria-expanded={isOpen}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-slate-100"
      >
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColorFor(
            user.id
          )}`}
        >
          {initialsFor(user.displayName)}
        </div>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="animate-[modal-in_0.15s_ease-out] absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${avatarColorFor(
                user.id
              )}`}
            >
              {initialsFor(user.displayName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{user.displayName}</p>
              <p className="truncate text-xs text-slate-400">{user.email}</p>
            </div>
          </div>

          <button
            onClick={() => {
              setIsOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <LogOutIcon className="h-4 w-4" />
            Log out
          </button>

          <div className="border-t border-slate-100 px-4 py-2.5 text-center text-[11px] text-slate-300">
            {APP_NAME} v{APP_VERSION} &middot; &copy; {new Date().getFullYear()}
          </div>
        </div>
      )}
    </div>
  );
}
