/**
 * Shared domain types for fluxboard.
 *
 * Both `apps/web` (Next.js frontend) and `apps/api` (Express backend) import
 * from this package instead of each defining their own copy of these shapes.
 * This is the main reason fluxboard is a monorepo rather than two separate
 * repos: a `Card` on the backend and a `Card` on the frontend are always
 * guaranteed to match, because they're literally the same type definition.
 *
 * If you add a new field to a type here, TypeScript will flag every place
 * in both apps that now needs to handle it — that's the safety net this
 * package buys you.
 */

/** A registered user of fluxboard. */
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string; // ISO 8601 timestamp
}

/** A team workspace that owns one or more boards. */
export interface Workspace {
  id: string;
  name: string;
  ownerId: string; // User.id of the workspace creator
  memberIds: string[]; // User.id[] of everyone with access
  createdAt: string;
}

/** What a member is allowed to do within a workspace — see the owner-always-full-access and default-full-access-until-restricted rules in the API's lib/permissions.ts. */
export interface MemberPermissions {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * A workspace member with enough profile info to render an avatar/name —
 * returned by GET /workspaces/:id/members, which enriches Workspace.memberIds
 * with the member profiles needed by the members UI.
 */
export interface WorkspaceMember {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: "owner" | "member";
  permissions: MemberPermissions;
}

/** A single Kanban board that lives inside a workspace. */
export interface Board {
  id: string;
  workspaceId: string;
  title: string;
  /** Ordered list of List.id — defines left-to-right column order on screen. */
  listOrder: string[];
  createdAt: string;
}

/** A column on a board (e.g. "To Do", "In Progress", "Done"). */
export interface List {
  id: string;
  boardId: string;
  title: string;
  /** Ordered list of Card.id — defines top-to-bottom card order in this column. */
  cardOrder: string[];
}

/** A single task card that lives inside exactly one List at a time. */
export interface Card {
  id: string;
  listId: string;
  title: string;
  description?: string;
  assigneeId?: string; // User.id, if assigned
  dueDate?: string; // ISO 8601 timestamp, if set
  labels?: string[]; // color keywords, e.g. ["green", "red"]
  priority?: Priority;
  taskId?: string; // human-readable board-scoped id, e.g. "BT-7"
  createdAt: string;
  updatedAt: string;
}

export type Priority = "low" | "medium" | "high";

/** Display metadata for each priority level, in severity order (lowest first) — one place both the card badge and the picker UI pull from, so they can never disagree on label text or color. */
export const PRIORITY_META: Record<Priority, { label: string }> = {
  low: { label: "Low" },
  medium: { label: "Medium" },
  high: { label: "High" },
};

/** Color keywords available for card labels, in display order. */
export const LABEL_COLORS = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

/** A comment left on a card, used for the activity/discussion trail. */
export interface Comment {
  id: string;
  cardId: string;
  authorId: string; // User.id
  body: string;
  createdAt: string;
  /** Denormalized at read-time by the API so the frontend doesn't need a
   *  separate lookup per comment — not stored on the Comment document itself. */
  authorName?: string;
  authorAvatarUrl?: string;
}

/**
 * Real-time event names shared between the Socket.io server (apps/api) and
 * client (apps/web). Keeping these as a const object — not just strings
 * scattered in each codebase — means a typo in an event name fails at
 * compile time instead of silently never firing at runtime.
 */
export const SocketEvents = {
  CARD_MOVED: "card:moved",
  CARD_CREATED: "card:created",
  CARD_UPDATED: "card:updated",
  CARD_DELETED: "card:deleted",
  LIST_CREATED: "list:created",
  LIST_UPDATED: "list:updated",
  LIST_DELETED: "list:deleted",
  LIST_REORDERED: "list:reordered",
  BOARD_CREATED: "board:created",
  BOARD_UPDATED: "board:updated",
  BOARD_DELETED: "board:deleted",
  WORKSPACE_UPDATED: "workspace:updated",
  WORKSPACE_DELETED: "workspace:deleted",
  MEMBER_ADDED: "workspace:member-added",
  MEMBER_REMOVED: "workspace:member-removed",
  MEMBER_PERMISSIONS_UPDATED: "workspace:member-permissions-updated",
  // Sent to the removed user's personal room so active clients can leave
  // the workspace immediately instead of waiting for a failed API request.
  ACCESS_REVOKED: "workspace:access-revoked",
  COMMENT_ADDED: "comment:added",
} as const;

/** Payload shape for the `card:moved` real-time event. */
export interface CardMovedPayload {
  cardId: string;
  fromListId: string;
  toListId: string;
  newIndex: number; // position within the destination list's cardOrder
  movedBy: string; // User.id of who made the change
}

/** Payload for `workspace:member-added`, including the member's profile. */
export interface WorkspaceMembershipPayload {
  workspaceId: string;
  member: WorkspaceMember;
}

/** Payload for `workspace:member-removed`. */
export interface WorkspaceMemberRemovedPayload {
  workspaceId: string;
  userId: string;
}

/** Payload for `workspace:member-permissions-updated`. */
export interface MemberPermissionsUpdatedPayload {
  workspaceId: string;
  member: WorkspaceMember;
}

/** Payload for `workspace:access-revoked`, sent to the affected user. */
export interface AccessRevokedPayload {
  workspaceId: string;
  workspaceName: string;
}
