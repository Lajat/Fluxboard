import { Schema, model, Document, Types } from "mongoose";

/**
 * One member's explicit permission overrides — only present once an owner
 * has restricted that member away from the full-access default.
 *
 * Two independent axes, each with its own add/edit/delete:
 * - Board-level (canAddBoards/canEditBoards/canDeleteBoards): create,
 *   rename, or remove boards within the workspace.
 * - Card-level (canAddCards/canEditCards/canDeleteCards): create, edit,
 *   or remove lists/cards/comments on boards they can already see.
 *
 * All six are optional at the schema level on purpose, for backward
 * compatibility: entries created before this two-axis model existed only
 * have the old canAdd/canEdit/canDelete fields, not these. Rather than
 * migrating every existing document, getMemberPermissions (lib/permissions.ts)
 * detects which shape an entry is and maps the old uniform restriction
 * onto both axes — so nobody's access silently changes just because this
 * shipped.
 */
export interface MemberPermissionsEntry {
  userId: Types.ObjectId;
  // Legacy shape (pre-dates the two-axis model) — kept only so old
  // entries still parse; new entries are written with the six fields
  // below instead, never these.
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canAddBoards?: boolean;
  canEditBoards?: boolean;
  canDeleteBoards?: boolean;
  canAddCards?: boolean;
  canEditCards?: boolean;
  canDeleteCards?: boolean;
}

/** Mongoose document shape for a Workspace — a team space that owns boards. */
export interface WorkspaceDocument extends Document {
  name: string;
  ownerId: Types.ObjectId;
  memberIds: Types.ObjectId[];
  // Per-member permission overrides. Deliberately sparse — a member only
  // gets an entry here once the owner has restricted them away from the
  // full-access default (see lib/permissions.ts), so most workspaces'
  // members will have no entries at all here.
  memberPermissions: MemberPermissionsEntry[];
  // A random, unguessable token that lets anyone holding the link join
  // this workspace without needing to already have an account known to
  // the owner — the "share this link with your team" invite flow.
  // Optional/sparse because workspaces created before this feature
  // existed won't have one until the owner first requests their invite
  // link (see workspaceController.getInviteLink), which generates and
  // saves one lazily rather than requiring a migration.
  inviteToken?: string;
  createdAt: Date;
}

const memberPermissionsSchema = new Schema<MemberPermissionsEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // No `default` on any of these — a default would make Mongoose treat
    // every field as "present but false/true" on read, which breaks the
    // old-vs-new shape detection in getMemberPermissions (it needs to see
    // an actual `undefined` to know an old-shape entry has no
    // canAddBoards at all, not a defaulted false).
    canAdd: { type: Boolean },
    canEdit: { type: Boolean },
    canDelete: { type: Boolean },
    canAddBoards: { type: Boolean },
    canEditBoards: { type: Boolean },
    canDeleteBoards: { type: Boolean },
    canAddCards: { type: Boolean },
    canEditCards: { type: Boolean },
    canDeleteCards: { type: Boolean },
  },
  { _id: false } // these are always accessed by scanning for userId, never by their own id
);

const workspaceSchema = new Schema<WorkspaceDocument>({
  name: { type: String, required: true, trim: true },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  // The owner is always included in memberIds too — this keeps "who can
  // access this workspace" as a single list to check, rather than having
  // to separately check "is this the owner OR is this in memberIds"
  // everywhere access control is enforced.
  memberIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  memberPermissions: { type: [memberPermissionsSchema], default: [] },
  inviteToken: { type: String, index: true, sparse: true },
  createdAt: { type: Date, default: Date.now },
});

export const WorkspaceModel = model<WorkspaceDocument>("Workspace", workspaceSchema);
