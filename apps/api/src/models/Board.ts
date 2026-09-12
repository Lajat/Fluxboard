import { Schema, model, Document, Types } from "mongoose";

/** Mongoose document shape for a Board. See User.ts for why this differs from the shared-types shape. */
export interface BoardDocument extends Document {
  workspaceId: Types.ObjectId;
  title: string;
  listOrder: Types.ObjectId[];
  createdAt: Date;
}

const boardSchema = new Schema<BoardDocument>({
  workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
  title: { type: String, required: true, trim: true },
  // Ordered array of List _ids — this array's order IS the left-to-right
  // column order shown on screen. Reordering columns means reordering this
  // array, not adding a separate "position" field on each List.
  listOrder: [{ type: Schema.Types.ObjectId, ref: "List" }],
  createdAt: { type: Date, default: Date.now },
});

export const BoardModel = model<BoardDocument>("Board", boardSchema);
