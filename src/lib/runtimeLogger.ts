import "server-only";

type RuntimeLogLevel = "error" | "warn" | "info";

type RuntimeLogEntry = {
  timestamp: string;
  level: RuntimeLogLevel;
  source: string;
  message: string;
  pathname?: string;
  digest?: string;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

declare global {
  var __lmsRuntimeLogInstalled: boolean | undefined;
  var __lmsRuntimeProcessHooksInstalled: boolean | undefined;
  var __lmsRuntimeLogWriteInFlight: boolean | undefined;
  var __lmsRuntimeLogDir: string | undefined;
}

const LOG_FILE_NAME = "runtime-errors.log";
/** Past this size the log rolls over to `runtime-errors.log.1`; one old file is kept. */
const MAX_LOG_BYTES = 5 * 1024 * 1024;
/** The admin viewer reads at most this much from the end of the log. */
const TAIL_BYTES = 512 * 1024;

function nodePath() {
  return eval("require")("path") as typeof import("path");
}

function nodeFs() {
  return eval("require")("fs") as typeof import("fs");
}

/**
 * Where the log is written: RUNTIME_LOG_DIR when set, otherwise `logs/` in the
 * app folder. In the Docker image the app folder belongs to root while the
 * server runs as `nextjs`, so `logs/` cannot be created there and nothing was
 * ever written; the system temp folder is the fallback. Chosen once a process.
 */
function logDirectory() {
  if (globalThis.__lmsRuntimeLogDir) return globalThis.__lmsRuntimeLogDir;
  const path = nodePath();
  const { mkdirSync, accessSync, constants } = nodeFs();
  const os = eval("require")("os") as typeof import("os");
  const candidates = [process.env.RUNTIME_LOG_DIR, path.join(process.cwd(), "logs"), path.join(os.tmpdir(), "envision-lms-logs")].filter(
    (dir): dir is string => Boolean(dir)
  );
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      accessSync(dir, constants.W_OK);
      globalThis.__lmsRuntimeLogDir = dir;
      return dir;
    } catch {
      // Not writable here; try the next place.
    }
  }
  globalThis.__lmsRuntimeLogDir = candidates[candidates.length - 1];
  return globalThis.__lmsRuntimeLogDir;
}

function runtimeLogFile() {
  const path = nodePath();
  const dir = logDirectory();
  return { dir, file: path.join(dir, LOG_FILE_NAME), previous: path.join(dir, `${LOG_FILE_NAME}.1`) };
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: typeof error,
    message: typeof error === "string" ? error : safeJson(error),
    stack: undefined,
  };
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function appendRuntimeLogLine(line: string) {
  if (globalThis.__lmsRuntimeLogWriteInFlight) return;
  globalThis.__lmsRuntimeLogWriteInFlight = true;
  try {
    const { appendFileSync, renameSync, statSync } = nodeFs();
    const { file, previous } = runtimeLogFile();
    // Roll over instead of growing for as long as the container runs.
    try {
      if (statSync(file).size >= MAX_LOG_BYTES) renameSync(file, previous);
    } catch {
      // No log file yet.
    }
    appendFileSync(file, line, "utf8");
  } catch {
    // Never throw while logging a crash.
  } finally {
    globalThis.__lmsRuntimeLogWriteInFlight = false;
  }
}

export function writeRuntimeLog(input: {
  level?: RuntimeLogLevel;
  source: string;
  message: string;
  pathname?: string;
  digest?: string;
  metadata?: Record<string, unknown>;
  error?: unknown;
}) {
  const entry: RuntimeLogEntry = {
    timestamp: new Date().toISOString(),
    level: input.level || "error",
    source: input.source,
    message: input.message,
    pathname: input.pathname,
    digest: input.digest,
    metadata: input.metadata,
    error: input.error ? normalizeError(input.error) : undefined,
  };

  appendRuntimeLogLine(`${JSON.stringify(entry)}\n`);
}

export function captureRuntimeStderrChunk(chunk: string) {
  const message = chunk.trim();
  if (!message) return;

  writeRuntimeLog({
    level: /warning/i.test(message) ? "warn" : "error",
    source: "stderr",
    message,
  });
}

export function installRuntimeProcessLogging() {
  if (globalThis.__lmsRuntimeProcessHooksInstalled) return;
  globalThis.__lmsRuntimeProcessHooksInstalled = true;

  process.on("uncaughtException", (error) => {
    writeRuntimeLog({
      source: "process.uncaughtException",
      message: "Uncaught exception reached the Node process.",
      error,
    });
  });

  process.on("unhandledRejection", (reason) => {
    writeRuntimeLog({
      source: "process.unhandledRejection",
      message: "Unhandled promise rejection reached the Node process.",
      error: reason,
    });
  });

  process.on("warning", (warning) => {
    writeRuntimeLog({
      level: "warn",
      source: "process.warning",
      message: warning.message || "Node process warning.",
      error: warning,
    });
  });
}

export function installRuntimeStderrCapture() {
  if (globalThis.__lmsRuntimeLogInstalled) return;
  globalThis.__lmsRuntimeLogInstalled = true;

  const originalWrite = process.stderr.write.bind(process.stderr);

  process.stderr.write = ((chunk: string | Uint8Array, encoding?: BufferEncoding, callback?: (error?: Error | null) => void) => {
    try {
      captureRuntimeStderrChunk(Buffer.isBuffer(chunk) ? chunk.toString(encoding || "utf8") : String(chunk));
    } catch {
      // Never block stderr.
    }

    return originalWrite(chunk as any, encoding as any, callback as any);
  }) as typeof process.stderr.write;
}

export function readRecentRuntimeLogs(limit = 100) {
  const { existsSync, openSync, readSync, closeSync, statSync } = nodeFs();
  const logFile = runtimeLogFile().file;
  if (!existsSync(logFile)) return [];

  // Only the end of the file: the viewer shows the newest lines, and reading
  // the whole log into memory is what the size cap is there to prevent.
  const size = statSync(logFile).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const buffer = Buffer.alloc(size - start);
  const fd = openSync(logFile, "r");
  try {
    readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    closeSync(fd);
  }
  let content = buffer.toString("utf8");
  // Starting mid-file lands inside a line; drop that fragment.
  if (start > 0) content = content.slice(content.indexOf("\n") + 1);
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .slice(-Math.max(1, Math.min(limit, 500)))
    .map((line) => {
      try {
        return JSON.parse(line) as RuntimeLogEntry;
      } catch {
        return {
          timestamp: new Date().toISOString(),
          level: "error" as const,
          source: "runtime-log-parser",
          message: line,
        };
      }
    });
}

export function runtimeLogFilePath() {
  return runtimeLogFile().file;
}
