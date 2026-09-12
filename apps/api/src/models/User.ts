import { Schema, model, Document } from "mongoose";

/**
 * Mongoose document shape for a User.
 *
 * This mirrors (but is not identical to) the `User` type in
 * `@fluxboard/shared-types` — the shared type is the *API contract* sent
 * over the wire (no password hash, string id instead of ObjectId), while
 * this schema is the *storage shape* (includes passwordHash, uses Mongo's
 * native _id). Keeping these separate on purpose: the API response type
 * should never accidentally leak a password hash just because we changed
 * the database schema.
 */
export interface UserDocument extends Document {
  email: string;
  passwordHash: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: Date;
}

const userSchema = new Schema<UserDocument>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  displayName: { type: String, required: true, trim: true },
  avatarUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export const UserModel = model<UserDocument>("User", userSchema);
