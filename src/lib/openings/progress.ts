import "server-only";
import { dbConnect } from "@/lib/db";
import { OpeningProgress } from "@/models/Opening";

export type ChapterProgress = { lastStep: number; completed: boolean };

/** Progress by opening slug, then chapter slug. */
export type ProgressMap = Record<string, Record<string, ChapterProgress>>;

export async function getOpeningProgress(userId: string | undefined, opening?: string): Promise<ProgressMap> {
  if (!userId) return {};
  await dbConnect();
  const rows: any[] = await OpeningProgress.find({ user: userId, ...(opening ? { opening } : {}) })
    .select("opening chapter lastStep completedAt")
    .lean();
  const map: ProgressMap = {};
  for (const row of rows) {
    map[row.opening] ??= {};
    map[row.opening][row.chapter] = { lastStep: Number(row.lastStep || 0), completed: Boolean(row.completedAt) };
  }
  return map;
}

/** Records the furthest step reached. Stepping back never lowers it. */
export async function recordOpeningProgress(input: { userId: string; opening: string; chapter: string; step: number; completed: boolean }) {
  await dbConnect();
  const key = { user: input.userId, opening: input.opening, chapter: input.chapter };
  await OpeningProgress.updateOne(key, { $max: { lastStep: input.step } }, { upsert: true });
  if (input.completed) {
    await OpeningProgress.updateOne({ ...key, completedAt: { $exists: false } }, { $set: { completedAt: new Date() } });
  }
}
