import { Schema, model, Document, Types } from "mongoose";

/** Mongoose document shape for a Workspace — a team space that owns boards. */
export interface WorkspaceDocument extends Document {
  name: string;
  ownerId: Types.ObjectId;
  memberIds: Types.ObjectId[];
  createdAt: Date;
}

const workspaceSchema = new Schema<WorkspaceDocument>({
  name: { type: String, required: true, trim: true },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  // The owner is always included in memberIds too — this keeps "who can
  // access this workspace" as a single list to check, rather than having
  // to separately check "is this the owner OR is this in memberIds"
  // everywhere access control is enforced.
  memberIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
});

export const WorkspaceModel = model<WorkspaceDocument>("Workspace", workspaceSchema);
