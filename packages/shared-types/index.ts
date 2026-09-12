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
  createdAt: string;
  updatedAt: string;
}

/** A comment left on a card, used for the activity/discussion trail. */
export interface Comment {
  id: string;
  cardId: string;
  authorId: string; // User.id
  body: string;
  createdAt: string;
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
  LIST_REORDERED: "list:reordered",
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
