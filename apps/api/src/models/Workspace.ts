import { Schema, model, Document, Types } from "mongoose";

/** One member's explicit permission overrides — only present once an owner has restricted that member away from the full-access default. */
export interface MemberPermissionsEntry {
  userId: Types.ObjectId;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
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
    canAdd: { type: Boolean, default: true },
    canEdit: { type: Boolean, default: true },
    canDelete: { type: Boolean, default: true },
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
