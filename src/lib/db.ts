import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error("MONGODB_URI is not set");

type Cached = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
declare global { var _mongo: Cached | undefined; }
const cached: Cached = global._mongo ?? { conn: null, promise: null };
if (!global._mongo) global._mongo = cached;

export async function dbConnect() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI!, {
      dbName: process.env.MONGODB_DB ?? "chess_lms",
      bufferCommands: false,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
