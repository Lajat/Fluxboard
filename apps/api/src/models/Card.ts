import { Schema, model, Document, Types } from "mongoose";

/** Mongoose document shape for a Card (a single task). */
export interface CardDocument extends Document {
  listId: Types.ObjectId;
  title: string;
  description?: string;
  assigneeId?: Types.ObjectId;
  dueDate?: Date;
  labels?: string[];
  priority?: "low" | "medium" | "high";
  // Human-readable, board-scoped id like "BT-7" — see Board.cardCounter
  // and lib/taskId.ts for how this is generated. Optional in the type
  // only because cards created before this feature existed won't have
  // one; every card created going forward always gets one at creation
  // time in cardController.createCard, never generated retroactively (a
  // stable, permanent id is the whole point of it).
  taskId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const cardSchema = new Schema<CardDocument>(
  {
    listId: { type: Schema.Types.ObjectId, ref: "List", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
    dueDate: { type: Date },
    // Simple label model: an array of color keywords (e.g. "green", "red").
    // Kept intentionally simple (no separate Label collection/model) since
    // labels here are per-card tags, not shared/reusable across a board.
    labels: [{ type: String }],
    priority: { type: String, enum: ["low", "medium", "high"] },
    taskId: { type: String },
  },
  {
    // Adds and auto-maintains createdAt/updatedAt — no manual bookkeeping
    // needed on every save().
    timestamps: true,
  }
);

export const CardModel = model<CardDocument>("Card", cardSchema);
