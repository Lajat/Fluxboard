import mongoose from "mongoose";

/**
 * Connects to MongoDB using the URI from the environment.
 *
 * Kept in its own module (rather than inline in index.ts) so there is one
 * obvious place to look when the database connection needs to change —
 * e.g. adding connection pooling options, switching to a replica set URI,
 * or adding retry logic later.
 *
 * @throws if MONGODB_URI is not set, or if the connection attempt fails —
 * callers should let this throw and fail startup loudly rather than run
 * the API against a database that never connected.
 */
export async function connectToDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env and fill it in."
    );
  }

  await mongoose.connect(uri);
  console.log("[db] connected to MongoDB");
}
