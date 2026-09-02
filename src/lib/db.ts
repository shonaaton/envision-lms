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

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

function isConnectionUsable() {
  return mongoose.connection.readyState === MONGOOSE_READY_STATE_CONNECTED;
}

function resetCachedConnection() {
  cached.conn = null;
  cached.promise = null;
}

function cleanEnvValue(value: string | undefined) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function validateMongoUri(uri: string) {
  if (!uri) throw new DatabaseConfigurationError("MONGODB_URI is not set");
  if (/[<>]/.test(uri)) {
    throw new DatabaseConfigurationError("MONGODB_URI still contains placeholder values. Add the real MongoDB username, password, and cluster host.");
  }
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    throw new DatabaseConfigurationError("MONGODB_URI must start with mongodb:// or mongodb+srv://");
  }
}

export function getDatabaseConfigStatus() {
  const uri = cleanEnvValue(process.env.MONGODB_URI);
  try {
    validateMongoUri(uri);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "MongoDB is not configured correctly",
    };
  }
}

/**
 * Connect to MongoDB. The env var is checked lazily so the module can be imported
 * during `next build` (when env_file isn't loaded) without throwing.
 */
export async function dbConnect() {
  if (cached.conn && isConnectionUsable()) return cached.conn;
  const MONGODB_URI = cleanEnvValue(process.env.MONGODB_URI);
  validateMongoUri(MONGODB_URI);
  if (cached.promise && mongoose.connection.readyState !== MONGOOSE_READY_STATE_CONNECTING) {
    resetCachedConnection();
  }
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      dbName: cleanEnvValue(process.env.MONGODB_DB) || "envision_chess",
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
