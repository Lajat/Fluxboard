import { Request, Response } from "express";
import { BoardModel } from "../models/Board";
import { WorkspaceModel } from "../models/Workspace";
import { ListModel } from "../models/List";
import { CardModel } from "../models/Card";
import type { Board } from "@fluxboard/shared-types";

/** Converts a Mongoose BoardDocument into the shared `Board` shape. */
function toBoardResponse(doc: any): Board {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    title: doc.title,
    listOrder: doc.listOrder.map((id: any) => id.toString()),
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Confirms the logged-in user is a member of the given workspace before
 * letting them touch any board inside it. Every handler below calls this
 * first — duplicated as a small helper rather than middleware, since it
 * needs the workspaceId from different places depending on the route
 * (from req.params directly on create, but from the board's own record on
 * delete/update).
 */
async function assertWorkspaceMember(workspaceId: string, userId: string) {
  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) return false;
  return workspace.memberIds.some((id) => id.toString() === userId);
}

/**
 * POST /workspaces/:workspaceId/boards
 * Creates a new board inside a workspace the user belongs to.
 */
export async function createBoard(req: Request, res: Response) {
  const { workspaceId } = req.params;
  const { title } = req.body;

  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }

  const isMember = await assertWorkspaceMember(workspaceId, req.userId!);
  if (!isMember) {
    return res.status(404).json({ error: "workspace not found" });
  }

  const board = await BoardModel.create({ workspaceId, title, listOrder: [] });
  res.status(201).json(toBoardResponse(board));
}

/**
 * GET /workspaces/:workspaceId/boards
 * Lists every board in a workspace the user belongs to.
 */
export async function listBoardsForWorkspace(req: Request, res: Response) {
  const { workspaceId } = req.params;

  const isMember = await assertWorkspaceMember(workspaceId, req.userId!);
  if (!isMember) {
    return res.status(404).json({ error: "workspace not found" });
  }

  const boards = await BoardModel.find({ workspaceId });
  res.json({ items: boards.map(toBoardResponse) });
}

/**
 * GET /boards/:boardId
 * Returns a single board, if the user belongs to its workspace.
 */
export async function getBoard(req: Request, res: Response) {
  const { boardId } = req.params;

  const board = await BoardModel.findById(boardId);
  if (!board) {
    return res.status(404).json({ error: "board not found" });
  }

  const isMember = await assertWorkspaceMember(board.workspaceId.toString(), req.userId!);
  if (!isMember) {
    return res.status(404).json({ error: "board not found" });
  }

  res.json(toBoardResponse(board));
}

/**
 * DELETE /boards/:boardId
 * Deletes a board and cascades: every List in the board, and every Card in
 * those lists, is deleted too — a board should never leave orphaned lists
 * or cards behind that no UI can reach anymore.
 */
export async function deleteBoard(req: Request, res: Response) {
  const { boardId } = req.params;

  const board = await BoardModel.findById(boardId);
  if (!board) {
    return res.status(404).json({ error: "board not found" });
  }

  const isMember = await assertWorkspaceMember(board.workspaceId.toString(), req.userId!);
  if (!isMember) {
    return res.status(404).json({ error: "board not found" });
  }

  const lists = await ListModel.find({ boardId });
  const listIds = lists.map((l) => l._id);

  // Cascade delete, innermost first: cards → lists → board. Doing it in
  // this order means if this fails partway through, we're left with
  // orphaned lists/cards rather than a board referencing lists that no
  // longer exist — the safer failure mode of the two.
  await CardModel.deleteMany({ listId: { $in: listIds } });
  await ListModel.deleteMany({ boardId });
  await BoardModel.findByIdAndDelete(boardId);

  res.json({ deleted: toBoardResponse(board) });
}
