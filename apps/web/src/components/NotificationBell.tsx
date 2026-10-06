"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { getSocket } from "@/lib/socket";
import { BellIcon } from "./ui/icons";
import { SocketEvents, type Notification } from "@fluxboard/shared-types";

/**
 * The notification bell — persisted notifications (see apps/api's
 * NotificationModel), not just ephemeral toasts, so an invite sent while
 * you're offline is still there next time you log in. Real-time on top
 * of that: NOTIFICATION_CREATED updates this live if the app is already
 * open when something happens.
 */
export function NotificationBell() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPosition, setPanelPosition] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<{ items: Notification[]; unreadCount: number }>("/notifications", { accessToken })
      .then((res) => {
        setNotifications(res.items);
        setUnreadCount(res.unreadCount);
      })
      .catch(() => {
        // A failed initial fetch here just means an empty bell rather
        // than a broken page — not worth surfacing a toast for.
      });
  }, [accessToken]);

  useEffect(() => {
    const socket = getSocket();
    function handleNotificationCreated(notification: Notification) {
      setNotifications((prev) => [notification, ...prev].slice(0, 30));
      setUnreadCount((prev) => prev + 1);
    }
    socket.on(SocketEvents.NOTIFICATION_CREATED, handleNotificationCreated);
    return () => {
      socket.off(SocketEvents.NOTIFICATION_CREATED, handleNotificationCreated);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function updatePanelPosition() {
      const anchor = buttonRef.current?.getBoundingClientRect();
      if (!anchor) return;

      const width = Math.min(320, window.innerWidth - 16);
      const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
      const availableBelow = window.innerHeight - anchor.bottom - 8;
      const availableAbove = anchor.top - 8;
      const maxPanelHeight = Math.min(400, window.innerHeight - 16);
      const openBelow =
        availableBelow >= Math.min(240, maxPanelHeight) || availableBelow >= availableAbove;
      const availableHeight = Math.max(0, Math.min(maxPanelHeight, openBelow ? availableBelow : availableAbove));

      setPanelPosition({
        left,
        width,
        maxHeight: availableHeight,
        ...(openBelow
          ? { top: anchor.bottom + 8 }
          : { bottom: window.innerHeight - anchor.top + 8 }),
      });
    }

    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  async function handleNotificationClick(notification: Notification) {
    setIsOpen(false);
    router.push(notification.link);

    if (!notification.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      try {
        await apiFetch(`/notifications/${notification.id}/read`, { method: "PATCH", accessToken });
      } catch {
        // Non-critical — worst case it shows unread again next load.
      }
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await apiFetch("/notifications/read-all", { method: "PATCH", accessToken });
    } catch {
      // Non-critical for the same reason as above.
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Notifications"
        title="Notifications"
        aria-expanded={isOpen}
        className="relative rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && panelPosition && typeof document !== "undefined" &&
        createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left: panelPosition.left,
            top: panelPosition.top,
            bottom: panelPosition.bottom,
            width: panelPosition.width,
            maxHeight: panelPosition.maxHeight,
          }}
          className="animate-[modal-in_0.15s_ease-out] z-[100] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div
            className="max-h-80 overflow-y-auto"
            style={{ maxHeight: Math.max(0, panelPosition.maxHeight - 48) }}
          >
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                No notifications yet.
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`flex w-full items-start gap-2.5 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${
                    n.isRead ? "" : "bg-brand-50/40"
                  }`}
                >
                  {!n.isRead && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                  <div className={`min-w-0 ${n.isRead ? "pl-4" : ""}`}>
                    <p className="text-sm font-medium text-slate-800">{n.title}</p>
                    <p className="truncate text-xs text-slate-500">{n.body}</p>
                    <p className="mt-0.5 text-[11px] text-slate-300">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
