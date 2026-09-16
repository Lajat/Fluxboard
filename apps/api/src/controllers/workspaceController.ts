import { Request, Response } from "express";
import crypto from "crypto";
import { Types } from "mongoose";
import { WorkspaceModel } from "../models/Workspace";
import { UserModel } from "../models/User";
import { BoardModel } from "../models/Board";
import { ListModel } from "../models/List";
import { CardModel } from "../models/Card";
import type { Workspace, WorkspaceMember } from "@fluxboard/shared-types";
import { SocketEvents } from "@fluxboard/shared-types";

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

  const workspaceResponse = toWorkspaceResponse(workspace);
  req.app.get("io").to(`workspace:${workspaceId}`).emit(SocketEvents.WORKSPACE_UPDATED, workspaceResponse);

  res.json(workspaceResponse);
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

  const workspaceResponse = toWorkspaceResponse(workspace);
  req.app.get("io").to(`workspace:${workspaceId}`).emit(SocketEvents.WORKSPACE_DELETED, workspaceResponse);

  res.json({ deleted: workspaceResponse });
}

/**
 * Shapes a User document (owner or member) into the WorkspaceMember shape
 * the frontend renders as an avatar. Kept as one function so the "owner
 * badge" logic lives in exactly one place.
 */
function toMemberResponse(user: any, workspace: any): WorkspaceMember {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user._id.toString() === workspace.ownerId.toString() ? "owner" : "member",
  };
}

/**
 * GET /workspaces/:workspaceId/members
 * Returns every member's basic profile (for the avatar stack), owner
 * first. Separate from GET /workspaces/:workspaceId because the bare
 * Workspace shape only carries member *ids* — most callers don't need a
 * full profile fetch for every member just to check who has access.
 */
export async function listMembers(req: Request, res: Response) {
  const { workspaceId } = req.params;

  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: "workspace not found" });
  }

  const isMember = workspace.memberIds.some((id) => id.toString() === req.userId);
  if (!isMember) {
    return res.status(404).json({ error: "workspace not found" });
  }

  const users = await UserModel.find({ _id: { $in: workspace.memberIds } });
  const members = users
    .map((u) => toMemberResponse(u, workspace))
    // Owner first, then everyone else alphabetically by name — a stable,
    // predictable order rather than whatever order Mongo happened to
    // return documents in.
    .sort((a, b) =>
      a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === "owner" ? -1 : 1
    );

  res.json({ items: members });
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

  if (alreadyMember) {
    return res.status(409).json({ error: "that person is already a member of this workspace" });
  }

  workspace.memberIds.push(userToAdd._id);
  await workspace.save();

  const member = toMemberResponse(userToAdd, workspace);
  const io = req.app.get("io");
  // Tell everyone already looking at this workspace that a new member
  // joined (updates their avatar stack live)...
  io.to(`workspace:${workspaceId}`).emit(SocketEvents.MEMBER_ADDED, { workspaceId, member });
  // ...and separately tell the NEW member themselves, in case they
  // already have the app open elsewhere — their /workspaces list should
  // pick up this workspace without needing a manual refresh.
  io.to(`user:${userToAdd._id}`).emit(SocketEvents.MEMBER_ADDED, {
    workspaceId,
    member,
    workspace: toWorkspaceResponse(workspace),
  });

  res.status(201).json({ workspace: toWorkspaceResponse(workspace), member });
}

/**
 * DELETE /workspaces/:workspaceId/members/:userId
 * Removes a member from the workspace. Owner-only, and the owner can't
 * remove themselves this way — that would leave the workspace ownerless;
 * "delete the whole workspace" is the deliberate, explicit action for
 * that instead of an implicit side effect of a member-removal call.
 */
export async function removeMember(req: Request, res: Response) {
  const { workspaceId, userId } = req.params;

  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: "workspace not found" });
  }

  if (workspace.ownerId.toString() !== req.userId) {
    return res.status(403).json({ error: "only the workspace owner can remove members" });
  }

  if (userId === workspace.ownerId.toString()) {
    return res.status(400).json({ error: "the workspace owner can't be removed" });
  }

  const wasMember = workspace.memberIds.some((id) => id.toString() === userId);
  if (!wasMember) {
    return res.status(404).json({ error: "that person is not a member of this workspace" });
  }

  workspace.memberIds = workspace.memberIds.filter((id) => id.toString() !== userId);
  await workspace.save();

  const io = req.app.get("io");
  io.to(`workspace:${workspaceId}`).emit(SocketEvents.MEMBER_REMOVED, { workspaceId, userId });
  // The removed user gets their own dedicated event so their client can
  // immediately back out of this workspace (and any of its boards it has
  // open) rather than finding out only when their next request 404s.
  io.to(`user:${userId}`).emit(SocketEvents.ACCESS_REVOKED, {
    workspaceId,
    workspaceName: workspace.name,
  });

  res.json({ removed: userId });
}

/**
 * GET /workspaces/:workspaceId/invite-link
 * Returns this workspace's shareable join link token, generating one on
 * first request if it doesn't have one yet (lazy generation, rather than
 * a migration, so workspaces created before this feature existed still
 * work without any manual backfill). Owner-only, same permission level as
 * managing members directly — anyone holding the resulting link can add
 * themselves to the workspace, so who's allowed to *see* that link should
 * match who's allowed to invite in the first place.
 */
export async function getInviteLink(req: Request, res: Response) {
  const { workspaceId } = req.params;

  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: "workspace not found" });
  }

  if (workspace.ownerId.toString() !== req.userId) {
    return res.status(403).json({ error: "only the workspace owner can view the invite link" });
  }

  if (!workspace.inviteToken) {
    workspace.inviteToken = crypto.randomBytes(16).toString("hex");
    await workspace.save();
  }

  res.json({ token: workspace.inviteToken });
}

/**
 * POST /workspaces/:workspaceId/invite-link/regenerate
 * Rotates the invite token, immediately invalidating any previously
 * shared link — the "revoke" half of the invite-link flow. Owner-only.
 */
export async function regenerateInviteLink(req: Request, res: Response) {
  const { workspaceId } = req.params;

  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: "workspace not found" });
  }

  if (workspace.ownerId.toString() !== req.userId) {
    return res.status(403).json({ error: "only the workspace owner can regenerate the invite link" });
  }

  workspace.inviteToken = crypto.randomBytes(16).toString("hex");
  await workspace.save();

  res.json({ token: workspace.inviteToken });
}

/**
 * POST /invites/:token/join
 * Adds the currently-logged-in user to whichever workspace this token
 * belongs to. This is the whole point of the invite-link flow: it works
 * for anyone with an account, not just people the owner already knows the
 * email of — they just need the link. requireAuth still guards this route
 * (see inviteRoutes.ts), so an anonymous visitor hits the frontend's
 * login/signup flow first; only an authenticated request reaches here.
 */
export async function joinViaInviteLink(req: Request, res: Response) {
  const { token } = req.params;

  const workspace = await WorkspaceModel.findOne({ inviteToken: token });
  if (!workspace) {
    return res.status(404).json({ error: "this invite link is invalid or has been revoked" });
  }

  const alreadyMember = workspace.memberIds.some((id) => id.toString() === req.userId);
  if (!alreadyMember) {
    workspace.memberIds.push(new Types.ObjectId(req.userId));
    await workspace.save();
  }

  const user = await UserModel.findById(req.userId);
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }

  const member = toMemberResponse(user, workspace);
  const workspaceResponse = toWorkspaceResponse(workspace);

  if (!alreadyMember) {
    // Same live-update behavior as the email-based addMember flow: notify
    // anyone already looking at this workspace, and separately notify the
    // new member's own personal room in case they have the app open
    // elsewhere (e.g. they opened the invite link in a new tab).
    const io = req.app.get("io");
    io.to(`workspace:${workspace.id}`).emit(SocketEvents.MEMBER_ADDED, {
      workspaceId: workspace.id,
      member,
    });
    io.to(`user:${req.userId}`).emit(SocketEvents.MEMBER_ADDED, {
      workspaceId: workspace.id,
      member,
      workspace: workspaceResponse,
    });
  }

  res.json({ workspace: workspaceResponse, member, alreadyMember });
}
