import fs from "fs";
import mongoose from "mongoose";
import { dbConnect } from "../src/lib/db";
import {
  calculateHomeworkReward,
  calculateLearningReward,
  calculatePlayComputerReward,
  calculateSquareTrainerReward,
  calculateTacticsReward,
  calculateTournamentGameReward,
  type RewardResult,
} from "../src/lib/rewards";
import { Activity } from "../src/models/Activity";
import { StudentReward } from "../src/models/ClassroomLive";
import { Homework, Submission } from "../src/models/Homework";
import { LearningAttempt, LearningExercise } from "../src/models/Learning";
import { TacticAttempt } from "../src/models/TacticPuzzle";
import { TournamentGame } from "../src/models/TournamentGame";

type RewardPatch = RewardResult & { reason?: string };

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1] || 0)) : 0;

function loadEnvFile(path: string) {
  if (!fs.existsSync(path)) return;
  const text = fs.readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (process.env[key]) continue;
    process.env[key] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function changed(current: any, next: RewardPatch) {
  return Number(current.xp || 0) !== next.xp ||
    Number(current.coins || 0) !== next.coins ||
    String(current.badge || "") !== String(next.badge || "");
}

async function matchingActivityForReward(reward: any) {
  return Activity.findOne({ entityType: "StudentReward", entityId: reward._id }).lean();
}

async function rewardPatchForExisting(reward: any): Promise<RewardPatch | null> {
  const sourceType = String(reward.sourceType || "");

  if (sourceType === "homework_submission" && reward.sourceId) {
    const submission: any = await Submission.findOne({ homework: reward.sourceId, student: reward.student }).lean();
    const homework: any = await Homework.findById(reward.sourceId).lean();
    if (!submission) return null;
    return {
      ...calculateHomeworkReward({
        totalAutoChecked: Number(submission.metrics?.totalBoards || 0) + Number(submission.metrics?.totalMcq || 0) || Number(submission.answers?.length || 0),
        accuracy: Number(submission.accuracy || 0),
        attemptsUsed: Number(submission.attemptsUsed || 1),
        hintsUsed: Number(submission.metrics?.hintsUsed || 0),
        mistakes: Number(submission.metrics?.mistakes || 0),
        isLate: submission.status === "late",
      }),
      reason: `Homework submitted: ${homework?.title || "Assignment"}`,
    };
  }

  if ((sourceType === "tactics_trainer" || sourceType === "king_hunt") && reward.sourceId) {
    const attempt: any = await TacticAttempt.findById(reward.sourceId).lean();
    if (!attempt) return null;
    return {
      ...calculateTacticsReward({
        solved: Boolean(attempt.solved),
        rating: Number(attempt.rating || 1000),
        mistakes: Number(attempt.mistakes || 0),
        hintsUsed: Number(attempt.hintsUsed || 0),
        timeSeconds: Number(attempt.timeSeconds || 0),
        trainerType: attempt.trainerType === "king_hunt" ? "king_hunt" : "tactics",
      }),
      reason: `${attempt.trainerType === "king_hunt" ? "King Hunt" : "Tactics Trainer"}: ${attempt.solved ? "solved" : "attempted"} ${attempt.puzzleExternalId || attempt._id}`,
    };
  }

  if (sourceType === "live_question" && reward.sourceId) {
    // A StudentReward is the ledger entry created when this response was
    // awarded. Keep it authoritative: the current calculator may legitimately
    // change for new responses, but routine maintenance must not rewrite a
    // student's historical XP using a newer formula.
    if (!Number.isFinite(reward.xp) || !Number.isFinite(reward.coins)) {
      console.warn(`Skipping live_question reward ${reward._id}: stored XP/coins are not recoverable.`);
      return null;
    }
    return { xp: reward.xp, coins: reward.coins, badge: reward.badge || undefined };
  }

  if (sourceType === "tournament_game" && reward.sourceId) {
    const game: any = await TournamentGame.findById(reward.sourceId).lean();
    if (!game || game.status !== "completed" || !game.result || game.result === "*") return null;
    const side = String(game.whiteUser || "") === String(reward.student || "") ? "white" : "black";
    return calculateTournamentGameReward(game.result, side);
  }

  if (sourceType === "play_vs_computer") {
    const activity: any = await matchingActivityForReward(reward);
    if (!activity) return null;
    return calculatePlayComputerReward({
      outcome: String(activity.metadata?.outcome || "completed"),
      difficultyLevel: Number(activity.metadata?.difficultyLevel || 1),
    });
  }

  if (sourceType === "square_trainer") {
    const activity: any = await matchingActivityForReward(reward);
    if (!activity) return null;
    return calculateSquareTrainerReward({
      correct: Number(activity.metadata?.correct || 0),
      mistakes: Number(activity.metadata?.mistakes || 0),
      bestStreak: Number(activity.metadata?.bestStreak || 0),
      durationSeconds: Number(activity.metadata?.durationSeconds || 0),
    });
  }

  if (sourceType === "learning_exercise" && reward.sourceId) {
    const attempt: any = await LearningAttempt.findById(reward.sourceId).lean();
    if (!attempt) return null;
    const exercise: any = await LearningExercise.findById(attempt.exerciseId).lean();
    return {
      ...calculateLearningReward({
        completed: Boolean(attempt.completed),
        stars: Number(attempt.stars || 0),
        difficulty: Number(exercise?.difficulty || 1),
        incorrectMoves: Number(attempt.incorrectMoves || 0),
        hintsUsed: Number(attempt.hintsUsed || 0),
      }),
      reason: `Learning exercise: ${exercise?.title || "Lesson activity"}`,
    };
  }

  return null;
}

async function updateReward(reward: any, next: RewardPatch, stats: { scanned: number; changed: number; updated: number }) {
  stats.scanned += 1;
  if (!changed(reward, next)) return;
  stats.changed += 1;
  if (!apply) {
    console.log(`[dry-run] ${reward._id}: ${reward.sourceType} ${reward.xp}/${reward.coins} -> ${next.xp}/${next.coins}${next.badge ? ` (${next.badge})` : ""}`);
    return;
  }
  await StudentReward.updateOne(
    { _id: reward._id },
    { $set: { xp: next.xp, coins: next.coins, badge: next.badge || "", ...(next.reason ? { reason: next.reason } : {}) } }
  );
  await Activity.updateMany(
    { entityType: "StudentReward", entityId: reward._id },
    { $set: { "metadata.xp": next.xp, "metadata.coins": next.coins, "metadata.badge": next.badge || "" } }
  );
  stats.updated += 1;
}

async function backfillLearningRewards(stats: { scanned: number; changed: number; updated: number }) {
  const attempts: any[] = await LearningAttempt.find({}).sort({ createdAt: 1 }).limit(limit || 0).lean();
  for (const attempt of attempts) {
    const exercise: any = await LearningExercise.findById(attempt.exerciseId).lean();
    const next = calculateLearningReward({
      completed: Boolean(attempt.completed),
      stars: Number(attempt.stars || 0),
      difficulty: Number(exercise?.difficulty || 1),
      incorrectMoves: Number(attempt.incorrectMoves || 0),
      hintsUsed: Number(attempt.hintsUsed || 0),
    });
    const existing: any = await StudentReward.findOne({ student: attempt.studentId, sourceType: "learning_exercise", sourceId: attempt._id }).lean();
    if (existing) {
      await updateReward(existing, { ...next, reason: `Learning exercise: ${exercise?.title || "Lesson activity"}` }, stats);
      continue;
    }
    stats.changed += 1;
    if (!apply) {
      console.log(`[dry-run] add learning_exercise reward for attempt ${attempt._id}: ${next.xp}/${next.coins}`);
      continue;
    }
    await StudentReward.create({
      student: attempt.studentId,
      sourceType: "learning_exercise",
      sourceId: attempt._id,
      xp: next.xp,
      coins: next.coins,
      badge: next.badge,
      reason: `Learning exercise: ${exercise?.title || "Lesson activity"}`,
    });
    stats.updated += 1;
  }
}

async function main() {
  const mongoUri = String(process.env.MONGODB_URI || "").trim();
  if (!mongoUri) {
    console.error("MONGODB_URI is not set. Add it to .env.local before running the reward rebalance.");
    process.exitCode = 1;
    return;
  }
  try {
    const parsed = new URL(mongoUri);
    if (mongoUri.startsWith("mongodb+srv://") && !parsed.hostname.includes(".")) {
      throw new Error("SRV URI host is incomplete");
    }
  } catch {
    console.error("MONGODB_URI is not a valid MongoDB connection string. Fix .env.local before running the reward rebalance.");
    process.exitCode = 1;
    return;
  }

  await dbConnect();
  const stats = { scanned: 0, changed: 0, updated: 0 };
  const query = StudentReward.find({ sourceType: { $in: [
    "homework_submission",
    "tactics_trainer",
    "king_hunt",
    "square_trainer",
    "play_vs_computer",
    "tournament_game",
    "live_question",
    "learning_exercise",
  ] } }).sort({ createdAt: 1 });
  if (limit) query.limit(limit);

  const rewards: any[] = await query.lean();
  for (const reward of rewards) {
    const next = await rewardPatchForExisting(reward);
    if (next) await updateReward(reward, next, stats);
  }
  await backfillLearningRewards(stats);
  console.log(`${apply ? "Applied" : "Dry run"} reward rebalance. Scanned: ${stats.scanned}. Changes: ${stats.changed}. Updated: ${stats.updated}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
