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
}

function nodePath() {
  return eval("require")("path") as typeof import("path");
}

function nodeFs() {
  return eval("require")("fs") as typeof import("fs");
}

function runtimeLogFile() {
  const path = nodePath();
  return {
    dir: path.join(process.cwd(), "logs"),
    file: path.join(process.cwd(), "logs", "runtime-errors.log"),
  };
}

function ensureLogDirectory() {
  const { mkdirSync } = nodeFs();
  mkdirSync(runtimeLogFile().dir, { recursive: true });
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
    const { appendFileSync } = nodeFs();
    ensureLogDirectory();
    appendFileSync(runtimeLogFile().file, line, "utf8");
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
  const { existsSync, readFileSync } = nodeFs();
  const logFile = runtimeLogFile().file;
  if (!existsSync(logFile)) return [];

  const content = readFileSync(logFile, "utf8");
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
