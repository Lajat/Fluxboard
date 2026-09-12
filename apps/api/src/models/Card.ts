import { Schema, model, Document, Types } from "mongoose";

/** Mongoose document shape for a Card (a single task). */
export interface CardDocument extends Document {
  listId: Types.ObjectId;
  title: string;
  description?: string;
  assigneeId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const cardSchema = new Schema<CardDocument>(
  {
    listId: { type: Schema.Types.ObjectId, ref: "List", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    // Adds and auto-maintains createdAt/updatedAt — no manual bookkeeping
    // needed on every save().
    timestamps: true,
  }
);

export const CardModel = model<CardDocument>("Card", cardSchema);
