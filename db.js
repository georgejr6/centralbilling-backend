import mongoose from "mongoose";

/**
 * Serverless-safe Mongo connection.
 *
 * On Vercel each invocation may reuse a warm container or spin up a cold one.
 * We cache the connection promise on globalThis so a warm container reuses the
 * existing connection instead of opening a new one every request (which
 * exhausts Atlas connections and causes FUNCTION_INVOCATION_FAILED).
 */
let cached = globalThis.__cbMongoose;
if (!cached) cached = globalThis.__cbMongoose = { conn: null, promise: null };

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  if (!cached.promise) {
    // Fail fast instead of buffering queries forever when the DB is unreachable.
    mongoose.set("bufferCommands", false);
    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 5,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Reset so the next request retries instead of reusing a rejected promise.
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}
