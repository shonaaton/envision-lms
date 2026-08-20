import mongoose from "mongoose";

type Cached = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const MONGO_SERVER_SELECTION_TIMEOUT_MS = 5_000;
const MONGO_CONNECT_TIMEOUT_MS = 5_000;
const MONGO_SOCKET_TIMEOUT_MS = 15_000;
const MONGO_DNS_FAMILY = 4;
declare global {
  var _mongo: Cached | undefined;
}
const cached: Cached = global._mongo ?? { conn: null, promise: null };
if (!global._mongo) global._mongo = cached;

const MONGOOSE_READY_STATE_CONNECTED = 1;
const MONGOOSE_READY_STATE_CONNECTING = 2;

function isConnectionUsable() {
  return mongoose.connection.readyState === MONGOOSE_READY_STATE_CONNECTED;
}

function resetCachedConnection() {
  cached.conn = null;
  cached.promise = null;
}

/**
 * Connect to MongoDB. The env var is checked lazily so the module can be imported
 * during `next build` (when env_file isn't loaded) without throwing.
 */
export async function dbConnect() {
  if (cached.conn && isConnectionUsable()) return cached.conn;
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error("MONGODB_URI is not set");
  if (cached.promise && mongoose.connection.readyState !== MONGOOSE_READY_STATE_CONNECTING) {
    resetCachedConnection();
  }
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      dbName: process.env.MONGODB_DB ?? "envision_chess",
      bufferCommands: false,
      serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS,
      connectTimeoutMS: MONGO_CONNECT_TIMEOUT_MS,
      socketTimeoutMS: MONGO_SOCKET_TIMEOUT_MS,
      family: MONGO_DNS_FAMILY,
    }).catch((error) => {
      resetCachedConnection();
      throw error;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
