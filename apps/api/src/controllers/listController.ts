import { Request, Response } from "express";
import { ListModel } from "../models/List";
import { BoardModel } from "../models/Board";
import { WorkspaceModel } from "../models/Workspace";
import { CardModel } from "../models/Card";
import type { List } from "@fluxboard/shared-types";
import { SocketEvents } from "@fluxboard/shared-types";

/** Converts a Mongoose ListDocument into the shared `List` shape. */
function toListResponse(doc: any): List {
  return {
    id: doc._id.toString(),
    boardId: doc.boardId.toString(),
    title: doc.title,
    cardOrder: doc.cardOrder.map((id: any) => id.toString()),
  };
}

/**
 * Confirms the logged-in user can access the board a list belongs to, by
 * walking board → workspace → membership. Lists don't store workspaceId
 * directly (avoiding a duplicated foreign key that could drift out of sync
 * with the board's own workspaceId), so this always goes through the board.
 */
async function assertBoardAccess(boardId: string, userId: string) {
  const board = await BoardModel.findById(boardId);
  if (!board) return false;

  const workspace = await WorkspaceModel.findById(board.workspaceId);
  if (!workspace) return false;

  return workspace.memberIds.some((id) => id.toString() === userId);
}

/**
 * POST /boards/:boardId/lists
 * Creates a new list and appends it to the board's listOrder.
 */
export async function createList(req: Request, res: Response) {
  const { boardId } = req.params;
  const { title } = req.body;

  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }

  const hasAccess = await assertBoardAccess(boardId, req.userId!);
  if (!hasAccess) {
    return res.status(404).json({ error: "board not found" });
  }

  const list = await ListModel.create({ boardId, title, cardOrder: [] });

  await BoardModel.findByIdAndUpdate(boardId, {
    $push: { listOrder: list._id },
  });

  const listResponse = toListResponse(list);
  req.app.get("io").to(`board:${boardId}`).emit(SocketEvents.LIST_CREATED, listResponse);

  res.status(201).json(listResponse);
}

/**
 * GET /boards/:boardId/lists
 * Returns every list on a board, in the board's listOrder (not insertion
 * order) — this is what lets the frontend render columns left-to-right
 * correctly after a reorder.
 */
export async function listListsForBoard(req: Request, res: Response) {
  const { boardId } = req.params;

  const hasAccess = await assertBoardAccess(boardId, req.userId!);
  if (!hasAccess) {
    return res.status(404).json({ error: "board not found" });
  }

  const board = await BoardModel.findById(boardId).populate("listOrder");
  const lists = (board!.listOrder as any[]).map(toListResponse);

  res.json({ items: lists });
}

/**
 * PATCH /boards/:boardId/lists/reorder
 * Replaces the board's listOrder wholesale with a new array of list ids.
 * Used after a drag-and-drop reorder on the frontend — simpler and less
 * error-prone than a "move list from index X to index Y" endpoint, since
 * the frontend already knows the full desired order after a drop.
 */
export async function reorderLists(req: Request, res: Response) {
  const { boardId } = req.params;
  const { listOrder } = req.body;

  if (!Array.isArray(listOrder)) {
    return res.status(400).json({ error: "listOrder must be an array of list ids" });
  }

  const hasAccess = await assertBoardAccess(boardId, req.userId!);
  if (!hasAccess) {
    return res.status(404).json({ error: "board not found" });
  }

  const board = await BoardModel.findByIdAndUpdate(
    boardId,
    { listOrder },
    { new: true }
  );

  if (!board) {
    return res.status(404).json({ error: "board not found" });
  }

  // Returning the board's new listOrder directly (not wrapped in
  // toListResponse, which is for individual List documents, not this) —
  // this is the one thing the frontend actually needs after a reorder.
  const newListOrder = board.listOrder.map((id: any) => id.toString());

  req.app.get("io").to(`board:${boardId}`).emit(SocketEvents.LIST_REORDERED, {
    boardId,
    listOrder: newListOrder,
  });

  res.json({ boardId, listOrder: newListOrder });
}

/**
 * DELETE /boards/:boardId/lists/:listId
 * Deletes a list, its cards, and removes it from the board's listOrder.
 */
export async function deleteList(req: Request, res: Response) {
  const { boardId, listId } = req.params;

  const hasAccess = await assertBoardAccess(boardId, req.userId!);
  if (!hasAccess) {
    return res.status(404).json({ error: "board not found" });
  }

  const list = await ListModel.findOneAndDelete({ _id: listId, boardId });
  if (!list) {
    return res.status(404).json({ error: "list not found" });
  }

  await CardModel.deleteMany({ listId });
  await BoardModel.findByIdAndUpdate(boardId, {
    $pull: { listOrder: listId },
  });

  const listResponse = toListResponse(list);
  req.app.get("io").to(`board:${boardId}`).emit(SocketEvents.LIST_DELETED, {
    listId: listResponse.id,
    boardId,
  });

  res.json({ deleted: listResponse });
}
