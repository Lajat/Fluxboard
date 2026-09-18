import { Request, Response } from "express";
import { BoardModel } from "../models/Board";
import { WorkspaceModel } from "../models/Workspace";
import { ListModel } from "../models/List";
import { CardModel } from "../models/Card";
import type { Board } from "@fluxboard/shared-types";
import { SocketEvents } from "@fluxboard/shared-types";
import { getMemberPermissions, isWorkspaceMember } from "../lib/permissions";
import { generateKeyPrefix } from "../lib/taskId";

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
 * POST /workspaces/:workspaceId/boards
 * Creates a new board inside a workspace the user has "add" permission
 * in. Also generates the board's task-ID key prefix from its title right
 * away (see lib/taskId) — cards created on it will need this immediately,
 * so there's no reason to defer it the way Workspace.inviteToken is
 * deferred (which only needs generating if the owner actually opens the
 * invite panel).
 */
export async function createBoard(req: Request, res: Response) {
  const { workspaceId } = req.params;
  const { title } = req.body;

  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }

  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: "workspace not found" });
  }

  const permissions = getMemberPermissions(workspace, req.userId!);
  if (!permissions) {
    return res.status(404).json({ error: "workspace not found" });
  }
  if (!permissions.canAdd) {
    return res.status(403).json({ error: "you don't have permission to create boards in this workspace" });
  }

  const board = await BoardModel.create({
    workspaceId,
    title,
    listOrder: [],
    keyPrefix: generateKeyPrefix(title),
    cardCounter: 0,
  });
  const boardResponse = toBoardResponse(board);
  req.app.get("io").to(`workspace:${workspaceId}`).emit(SocketEvents.BOARD_CREATED, boardResponse);
  res.status(201).json(boardResponse);
}

/**
 * GET /workspaces/:workspaceId/boards
 * Lists every board in a workspace the user belongs to. Plain membership
 * is enough here — viewing doesn't require any specific permission, only
 * mutating does.
 */
export async function listBoardsForWorkspace(req: Request, res: Response) {
  const { workspaceId } = req.params;

  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace || !isWorkspaceMember(workspace, req.userId!)) {
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

  const workspace = await WorkspaceModel.findById(board.workspaceId);
  if (!workspace || !isWorkspaceMember(workspace, req.userId!)) {
    return res.status(404).json({ error: "board not found" });
  }

  res.json(toBoardResponse(board));
}

/**
 * PATCH /boards/:boardId
 * Renames a board — requires "edit" permission in its workspace. Only
 * title is editable here — moving a board between workspaces isn't
 * supported, so workspaceId is intentionally never accepted from the
 * request body.
 */
export async function updateBoard(req: Request, res: Response) {
  const { boardId } = req.params;
  const { title } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }

  const board = await BoardModel.findById(boardId);
  if (!board) {
    return res.status(404).json({ error: "board not found" });
  }

  const workspace = await WorkspaceModel.findById(board.workspaceId);
  const permissions = workspace ? getMemberPermissions(workspace, req.userId!) : null;
  if (!permissions) {
    return res.status(404).json({ error: "board not found" });
  }
  if (!permissions.canEdit) {
    return res.status(403).json({ error: "you don't have permission to edit this board" });
  }

  board.title = title;
  await board.save();

  const boardResponse = toBoardResponse(board);
  req.app
    .get("io")
    .to(`workspace:${board.workspaceId}`)
    .emit(SocketEvents.BOARD_UPDATED, boardResponse);

  res.json(boardResponse);
}

/**
 * DELETE /boards/:boardId
 * Deletes a board — requires "delete" permission in its workspace.
 * Cascades: every List in the board, and every Card in those lists, is
 * deleted too — a board should never leave orphaned lists or cards behind
 * that no UI can reach anymore.
 */
export async function deleteBoard(req: Request, res: Response) {
  const { boardId } = req.params;

  const board = await BoardModel.findById(boardId);
  if (!board) {
    return res.status(404).json({ error: "board not found" });
  }

  const workspace = await WorkspaceModel.findById(board.workspaceId);
  const permissions = workspace ? getMemberPermissions(workspace, req.userId!) : null;
  if (!permissions) {
    return res.status(404).json({ error: "board not found" });
  }
  if (!permissions.canDelete) {
    return res.status(403).json({ error: "you don't have permission to delete this board" });
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

  const boardResponse = toBoardResponse(board);
  req.app
    .get("io")
    .to(`workspace:${board.workspaceId}`)
    .emit(SocketEvents.BOARD_DELETED, boardResponse);

  res.json({ deleted: boardResponse });
}
