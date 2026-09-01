import "server-only";

import { MongoServerError } from "mongodb";
import { dbConnect } from "@/lib/db";
import { ChessAccount, ChessGame, ChessProfile, ChessRatingSnapshot, ChessSyncJob } from "@/models/Chess";
import type { ChessPlatform, NormalizedGame } from "./types";
import { getChessProvider } from "./providers";

const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const BACKGROUND_SYNC_AFTER_MS = 6 * 60 * 60 * 1000;

export async function linkChessAccount(studentId: string, platform: ChessPlatform, username: string) {
  await dbConnect();
  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) throw new Error("Username is required.");
  const provider = getChessProvider(platform);
  const profile = await provider.getProfile(normalizedUsername);
  await ChessProfile.updateOne({ student: studentId }, { $setOnInsert: { student: studentId } }, { upsert: true });
  const account = await ChessAccount.findOneAndUpdate(
    { student: studentId, platform },
    {
      $set: {
        username: profile.username || username.trim(),
        normalizedUsername,
        platformUserId: profile.platformUserId,
        verified: true,
        isActive: true,
        syncStatus: "PENDING",
        lastError: undefined,
      },
      $setOnInsert: { connectedAt: new Date() },
    },
    { upsert: true, new: true }
  );
  await refreshRatings(account._id.toString());
  return account;
}

export async function disconnectChessAccount(studentId: string, accountId: string) {
  await dbConnect();
  return ChessAccount.updateOne({ _id: accountId, student: studentId }, { $set: { isActive: false, syncStatus: "COMPLETED" } });
}

export async function startChessSync(studentId: string, accountId: string) {
  await dbConnect();
  const account: any = await ChessAccount.findOne({ _id: accountId, student: studentId, isActive: true });
  if (!account) throw new Error("Chess account not found.");
  const active = await ChessSyncJob.exists({ account: account._id, status: { $in: ["PENDING", "SYNCING"] } });
  if (active) return active;
  if (account.updatedAt && Date.now() - new Date(account.updatedAt).getTime() < SYNC_COOLDOWN_MS && account.syncStatus === "SYNCING") {
    throw new Error("A sync is already running for this account.");
  }
  const job = await ChessSyncJob.create({ student: studentId, account: account._id, platform: account.platform, status: "PENDING" });
  void runChessSyncJob(job._id.toString()).catch((error) => console.error("Chess sync job failed", error));
  return job;
}

export async function enqueueDueChessSyncs(limit = 25) {
  await dbConnect();
  const dueBefore = new Date(Date.now() - BACKGROUND_SYNC_AFTER_MS);
  const accounts: any[] = await ChessAccount.find({
    isActive: true,
    syncStatus: { $ne: "SYNCING" },
    $or: [{ lastSyncedAt: { $exists: false } }, { lastSyncedAt: null }, { lastSyncedAt: { $lte: dueBefore } }],
  })
    .sort({ lastSyncedAt: 1, createdAt: 1 })
    .limit(limit)
    .lean();

  const jobs = [];
  for (const account of accounts) {
    const active = await ChessSyncJob.exists({ account: account._id, status: { $in: ["PENDING", "SYNCING"] } });
    if (active) continue;
    jobs.push(await startChessSync(account.student.toString(), account._id.toString()));
  }
  return jobs;
}

export async function runChessSyncJob(jobId: string) {
  await dbConnect();
  const job: any = await ChessSyncJob.findById(jobId);
  if (!job) throw new Error("Sync job not found.");
  const account: any = await ChessAccount.findById(job.account);
  if (!account || !account.isActive) throw new Error("Chess account is inactive.");
  const provider = getChessProvider(account.platform);
  const syncStartedAt = new Date();
  await Promise.all([
    ChessSyncJob.updateOne({ _id: jobId }, { $set: { status: "SYNCING", startedAt: syncStartedAt, error: undefined } }),
    ChessAccount.updateOne({ _id: account._id }, { $set: { syncStatus: "SYNCING", lastError: undefined } }),
  ]);

  try {
    const ratings = await provider.getRatings(account.username);
    await Promise.all(
      ratings.map((rating) =>
        ChessRatingSnapshot.updateOne(
          { chessAccount: account._id, ratingType: rating.ratingType, recordedAt: rating.recordedAt },
          { $set: { ...rating, student: account.student, platform: account.platform, chessAccount: account._id } },
          { upsert: true }
        )
      )
    );

    const games = await provider.getGames(account.username, { since: account.lastSyncedAt || undefined });
    let imported = 0;
    let duplicates = 0;
    for (const game of games) {
      const saved = await saveNormalizedGame(account, game);
      if (saved) imported += 1;
      else duplicates += 1;
      if ((imported + duplicates) % 50 === 0) {
        await ChessSyncJob.updateOne({ _id: jobId }, { $set: { gamesFound: games.length, gamesImported: imported, duplicatesSkipped: duplicates } });
      }
    }
    await Promise.all([
      ChessSyncJob.updateOne(
        { _id: jobId },
        { $set: { status: "COMPLETED", completedAt: new Date(), gamesFound: games.length, gamesImported: imported, duplicatesSkipped: duplicates } }
      ),
      ChessAccount.updateOne({ _id: account._id }, { $set: { syncStatus: "COMPLETED", lastSyncedAt: syncStartedAt }, $unset: { lastError: 1 } }),
    ]);
    return { gamesFound: games.length, gamesImported: imported, duplicatesSkipped: duplicates };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chess sync failed.";
    await Promise.all([
      ChessSyncJob.updateOne({ _id: jobId }, { $set: { status: "FAILED", completedAt: new Date(), error: message }, $inc: { retryCount: 1 } }),
      ChessAccount.updateOne({ _id: account._id }, { $set: { syncStatus: "FAILED", lastError: message } }),
    ]);
    throw error;
  }
}

export async function refreshRatings(accountId: string) {
  await dbConnect();
  const account: any = await ChessAccount.findById(accountId);
  if (!account) return [];
  const ratings = await getChessProvider(account.platform).getRatings(account.username);
  await Promise.all(
    ratings.map((rating) =>
      ChessRatingSnapshot.updateOne(
        { chessAccount: account._id, ratingType: rating.ratingType, recordedAt: rating.recordedAt },
        { $set: { ...rating, student: account.student, platform: account.platform, chessAccount: account._id } },
        { upsert: true }
      )
    )
  );
  return ratings;
}

async function saveNormalizedGame(account: any, game: NormalizedGame) {
  try {
    await ChessGame.create({
      ...game,
      student: account.student,
      chessAccount: account._id,
      platform: account.platform,
    });
    return true;
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return false;
    if ((error as any)?.code === 11000) return false;
    throw error;
  }
}
