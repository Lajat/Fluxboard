import { NotificationModel } from "../models/Notification";
import { SocketEvents } from "@fluxboard/shared-types";
import type { Notification } from "@fluxboard/shared-types";

/** Converts a Mongoose NotificationDocument into the shared `Notification` shape. */
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
 * Creates a notification and pushes it to the recipient's personal room
 * in one call, so every invite-style flow (workspace invite today,
 * board-level invites once that ships) goes through the same path
 * rather than each hand-rolling its own persist-then-emit pair. Persisted
 * first so a recipient who's offline right now still sees it the next
 * time they load the app — the socket push is purely for the "already
 * has the app open" case, on top of that.
 */
export async function notifyUser(
  io: any,
  userId: string,
  fields: { type: "workspace_invite"; title: string; body: string; link: string }
): Promise<void> {
  const doc = await NotificationModel.create({ userId, ...fields });
  const notification = toNotificationResponse(doc);
  io.to(`user:${userId}`).emit(SocketEvents.NOTIFICATION_CREATED, notification);
}
