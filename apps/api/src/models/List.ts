import { Schema, model, Document, Types } from "mongoose";

/** Mongoose document shape for a List (a column on a Board). */
export interface ListDocument extends Document {
  boardId: Types.ObjectId;
  title: string;
  cardOrder: Types.ObjectId[];
}

const listSchema = new Schema<ListDocument>({
  boardId: { type: Schema.Types.ObjectId, ref: "Board", required: true },
  title: { type: String, required: true, trim: true },
  // Same pattern as Board.listOrder: this array's order IS the top-to-bottom
  // card order in this column.
  cardOrder: [{ type: Schema.Types.ObjectId, ref: "Card" }],
});

export const ListModel = model<ListDocument>("List", listSchema);
