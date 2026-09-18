import { Schema, model, Document, Types } from "mongoose";

/** Mongoose document shape for a Comment left on a card. */
export interface CommentDocument extends Document {
  cardId: Types.ObjectId;
  authorId: Types.ObjectId;
  body: string;
  createdAt: Date;
}

const commentSchema = new Schema<CommentDocument>({
  cardId: { type: Schema.Types.ObjectId, ref: "Card", required: true },
  authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  body: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});

export const CommentModel = model<CommentDocument>("Comment", commentSchema);
