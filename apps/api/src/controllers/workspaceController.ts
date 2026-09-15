import { Request, Response } from "express";
import { Types } from "mongoose";
import { WorkspaceModel } from "../models/Workspace";
import { UserModel } from "../models/User";
import { BoardModel } from "../models/Board";
import { ListModel } from "../models/List";
import { CardModel } from "../models/Card";
import type { Workspace } from "@fluxboard/shared-types";

/** Converts a Mongoose WorkspaceDocument into the shared `Workspace` shape sent to the frontend. */
function toWorkspaceResponse(doc: any): Workspace {
  return {
    id: doc._id.toString(),
    name: doc.name,
    ownerId: doc.ownerId.toString(),
    memberIds: doc.memberIds.map((id: Types.ObjectId) => id.toString()),
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * POST /workspaces
 * Creates a new workspace, owned by the logged-in user (req.userId is set
 * by requireAuth). The owner is automatically added as the first member.
 */
export async function createWorkspace(req: Request, res: Response) {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const workspace = await WorkspaceModel.create({
    name,
    ownerId: req.userId,
    memberIds: [req.userId],
  });

  res.status(201).json(toWorkspaceResponse(workspace));
}

/**
 * GET /workspaces
 * Lists every workspace the logged-in user is a member of (including ones
 * they own, since ownerId is always mirrored into memberIds on creation).
 */
export async function listMyWorkspaces(req: Request, res: Response) {
  const workspaces = await WorkspaceModel.find({ memberIds: req.userId });
  res.json({ items: workspaces.map(toWorkspaceResponse) });
}

/**
 * GET /workspaces/:workspaceId
 * Returns a single workspace — but only if the requester is a member.
 * This is the access-control check every Board/List/Card route further
 * down the chain ultimately relies on: no membership, no visibility.
 */
export async function getWorkspace(req: Request, res: Response) {
  const { workspaceId } = req.params;

  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: "workspace not found" });
  }

  const isMember = workspace.memberIds.some((id) => id.toString() === req.userId);
  if (!isMember) {
    // 404, not 403 — confirming a workspace exists to a non-member is its
    // own small information leak (reveals the id is valid/in-use).
    return res.status(404).json({ error: "workspace not found" });
  }

  res.json(toWorkspaceResponse(workspace));
}

/**
 * PATCH /workspaces/:workspaceId
 * Renames a workspace. Any member can rename it — same permission level
 * as creating boards inside it, deliberately not restricted to the owner
 * the way addMember is (renaming carries far lower risk than granting
 * access to new people).
 */
export async function updateWorkspace(req: Request, res: Response) {
  const { workspaceId } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: "workspace not found" });
  }

  const isMember = workspace.memberIds.some((id) => id.toString() === req.userId);
  if (!isMember) {
    return res.status(404).json({ error: "workspace not found" });
  }

  workspace.name = name;
  await workspace.save();

  res.json(toWorkspaceResponse(workspace));
}

/**
 * DELETE /workspaces/:workspaceId
 * Deletes a workspace and cascades all the way down: every Board in it,
 * every List on those boards, and every Card in those lists. Restricted
 * to the owner only — unlike renaming, this is destructive and
 * irreversible for every member, not just the person clicking delete.
 */
export async function deleteWorkspace(req: Request, res: Response) {
  const { workspaceId } = req.params;

  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: "workspace not found" });
  }

  if (workspace.ownerId.toString() !== req.userId) {
    return res.status(403).json({ error: "only the workspace owner can delete this workspace" });
  }

  const boards = await BoardModel.find({ workspaceId });
  const boardIds = boards.map((b) => b._id);

  const lists = await ListModel.find({ boardId: { $in: boardIds } });
  const listIds = lists.map((l) => l._id);

  // Cascade delete, innermost first — same reasoning as deleteBoard in
  // boardController: cards → lists → boards → workspace, so a failure
  // partway through never leaves a shallower record referencing deleted
  // children.
  await CardModel.deleteMany({ listId: { $in: listIds } });
  await ListModel.deleteMany({ boardId: { $in: boardIds } });
  await BoardModel.deleteMany({ workspaceId });
  await WorkspaceModel.findByIdAndDelete(workspaceId);

  res.json({ deleted: toWorkspaceResponse(workspace) });
}

/**
 * POST /workspaces/:workspaceId/members
 * Adds an existing user (by email) to the workspace. Only the owner can
 * add members — a deliberately simple permission model for now; role-based
 * access (admin/member) was explicitly scoped out as a stretch goal.
 */
export async function addMember(req: Request, res: Response) {
  const { workspaceId } = req.params;
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: "workspace not found" });
  }

  if (workspace.ownerId.toString() !== req.userId) {
    return res.status(403).json({ error: "only the workspace owner can add members" });
  }

  const userToAdd = await UserModel.findOne({ email: email.toLowerCase() });
  if (!userToAdd) {
    return res.status(404).json({ error: "no user found with that email" });
  }

  const alreadyMember = workspace.memberIds.some(
    (id) => id.toString() === userToAdd._id.toString()
  );
  if (!alreadyMember) {
    workspace.memberIds.push(userToAdd._id);
    await workspace.save();
  }

  res.json(toWorkspaceResponse(workspace));
}
