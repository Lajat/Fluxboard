import { WorkspaceModel, WorkspaceDocument } from "../models/Workspace";
import { BoardModel } from "../models/Board";
import { ListModel } from "../models/List";

export interface MemberPermissions {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const FULL_PERMISSIONS: MemberPermissions = { canAdd: true, canEdit: true, canDelete: true };

/**
 * Returns a member's granular permissions within a workspace, or null if
 * they aren't a member at all (the caller should treat null as "deny
 * everything", not as "default to some permission level").
 *
 * The owner always gets full permissions regardless of what's in
 * memberPermissions — restricting the owner would be a way to lock
 * yourself out of your own workspace, so it's not a state the data model
 * allows.
 *
 * A member with no entry in memberPermissions also gets full permissions
 * by default. This matters for backward compatibility: workspaces/members
 * that existed before per-member permissions were added have no entry at
 * all, and defaulting them to full access preserves exactly the behavior
 * they had before — nobody's access silently narrows just because this
 * feature shipped. An owner can still explicitly restrict them afterward,
 * which creates a real entry going forward.
 */
export function getMemberPermissions(
  workspace: Pick<WorkspaceDocument, "ownerId" | "memberIds" | "memberPermissions">,
  userId: string
): MemberPermissions | null {
  if (workspace.ownerId.toString() === userId) return FULL_PERMISSIONS;

  const isMember = workspace.memberIds.some((id) => id.toString() === userId);
  if (!isMember) return null;

  const override = workspace.memberPermissions?.find((p) => p.userId.toString() === userId);
  if (!override) return FULL_PERMISSIONS;

  return { canAdd: override.canAdd, canEdit: override.canEdit, canDelete: override.canDelete };
}

/** Plain membership check, ignoring granular permissions — used for read (GET) endpoints, where any member can view regardless of what they're allowed to change. */
export function isWorkspaceMember(
  workspace: Pick<WorkspaceDocument, "ownerId" | "memberIds">,
  userId: string
): boolean {
  return workspace.ownerId.toString() === userId || workspace.memberIds.some((id) => id.toString() === userId);
}

/**
 * Loads the Workspace a board belongs to, in one place, so every
 * controller that needs "this board's workspace, to check permissions"
 * doesn't re-implement the board→workspace lookup separately (and risk
 * the two copies drifting apart, the way assertBoardAccess and
 * assertWorkspaceMember had started to before this module existed).
 */
export async function loadWorkspaceForBoard(boardId: string): Promise<WorkspaceDocument | null> {
  const board = await BoardModel.findById(boardId);
  if (!board) return null;
  return WorkspaceModel.findById(board.workspaceId);
}

/** Same idea, one level down: the Workspace a list's board belongs to. */
export async function loadWorkspaceForList(listId: string): Promise<WorkspaceDocument | null> {
  const list = await ListModel.findById(listId);
  if (!list) return null;
  return loadWorkspaceForBoard(list.boardId.toString());
}
