import { Request, Response } from "express";
import { NotificationModel } from "../models/Notification";
import type { Notification } from "@fluxboard/shared-types";

function toNotificationResponse(doc: any): Notification {
  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    link: doc.link,
    isRead: doc.isRead,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * GET /notifications
 * The most recent 30 notifications for the logged-in user, newest first,
 * plus a separate unread count — the bell icon needs the count even for
 * notifications beyond whatever page/limit is shown in the dropdown, so
 * it's computed independently rather than derived from the returned list.
 */
export async function listNotifications(req: Request, res: Response) {
  const [items, unreadCount] = await Promise.all([
    NotificationModel.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(30),
    NotificationModel.countDocuments({ userId: req.userId, isRead: false }),
  ]);

  res.json({ items: items.map(toNotificationResponse), unreadCount });
}

/**
 * PATCH /notifications/:notificationId/read
 * Marks a single notification as read — scoped to req.userId in the
 * query itself (not just fetched-then-checked), so there's no way to
 * mark another user's notification as read even by guessing an id.
 */
export async function markNotificationRead(req: Request, res: Response) {
  const { notificationId } = req.params;

  const notification = await NotificationModel.findOneAndUpdate(
    { _id: notificationId, userId: req.userId },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({ error: "notification not found" });
  }

  res.json(toNotificationResponse(notification));
}

/**
 * PATCH /notifications/read-all
 * Marks every one of the current user's notifications as read — the
 * "clear all" action in the dropdown.
 */
export async function markAllNotificationsRead(req: Request, res: Response) {
  await NotificationModel.updateMany({ userId: req.userId, isRead: false }, { isRead: true });
  res.json({ ok: true });
}
