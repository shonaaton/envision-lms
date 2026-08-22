import { sha256 } from "@/lib/engine/hash";
import { EngineWorker } from "@/models/EngineWorker";
import { dbConnect } from "@/lib/db";

function clean(value: unknown) {
  return String(value || "").trim();
}

function parseWorkerSecretsFromEnv() {
  return clean(process.env.ENGINE_FISHNET_WORKERS)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [workerId, rawKey, cores = "2", workerName = workerId] = entry.split(":");
      return {
        workerId: clean(workerId),
        workerName: clean(workerName || workerId),
        keyHash: sha256(clean(rawKey)),
        cores: Math.max(1, Number(cores || 2) || 2),
      };
    })
    .filter((worker) => worker.workerId && worker.keyHash !== sha256(""));
}

export async function authenticateEngineWorker(req: Request) {
  const authHeader = clean(req.headers.get("authorization"));
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const workerKey = bearer || clean(req.headers.get("x-fishnet-key"));
  if (!workerKey) return null;

  const envWorkers = parseWorkerSecretsFromEnv();
  const keyHash = sha256(workerKey);
  const envMatch = envWorkers.find((worker) => worker.keyHash === keyHash);
  if (envMatch) return envMatch;

  await dbConnect();
  const dbMatch = await EngineWorker.findOne({ keyHash, enabled: true }).lean() as any;
  if (!dbMatch) return null;
  return {
    workerId: dbMatch.workerId,
    workerName: dbMatch.workerName,
    keyHash: dbMatch.keyHash,
    cores: Number(dbMatch.cores || 1),
  };
}
