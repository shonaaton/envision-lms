import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { calculateLearningReward } from "@/lib/rewards";
import { StudentReward } from "@/models/ClassroomLive";
import { LearningAttempt, LearningExercise, LearningExerciseProgress } from "@/models/Learning";

export async function POST(request: Request) {
  const session = await auth();
  const studentId = (session?.user as any)?.id as string | undefined;
  if (!studentId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const exerciseId = String(body?.exerciseId || "");
  if (!exerciseId) return NextResponse.json({ error: "Exercise is required" }, { status: 400 });

  await dbConnect();
  const exercise: any = await LearningExercise.findOne({ _id: exerciseId, status: "published" }).lean();
  if (!exercise) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });

  const completed = Boolean(body?.completed);
  const stars = Math.max(0, Math.min(3, Number(body?.stars || (completed ? 3 : 0))));
  const moveCount = Math.max(0, Number(body?.moveCount || 0));
  const incorrectMoves = Math.max(0, Number(body?.incorrectMoves || 0));
  const hintsUsed = Math.max(0, Number(body?.hintsUsed || 0));

  const reward = calculateLearningReward({
    completed,
    stars,
    difficulty: exercise.difficulty,
    incorrectMoves,
    hintsUsed,
  });

  const attempt = await LearningAttempt.create({
    studentId,
    exerciseId: exercise._id,
    exerciseVersion: exercise.version || 1,
    completed,
    completedAt: completed ? new Date() : undefined,
    stars,
    acceptedMoves: Array.isArray(body?.acceptedMoves) ? body.acceptedMoves.slice(0, 50) : [],
    eventLog: Array.isArray(body?.eventLog) ? body.eventLog.slice(0, 100) : [],
    incorrectMoves,
    hintsUsed,
    moveCount,
    durationSeconds: Math.max(0, Number(body?.durationSeconds || 0)),
  });

  await StudentReward.findOneAndUpdate(
    { student: studentId, sourceType: "learning_exercise", sourceId: attempt._id },
    {
      student: studentId,
      sourceType: "learning_exercise",
      sourceId: attempt._id,
      xp: reward.xp,
      coins: reward.coins,
      badge: reward.badge || "",
      reason: `Learning exercise: ${exercise.title}`,
    },
    { upsert: true, new: true }
  );

  const now = new Date();
  const progress: any = await LearningExerciseProgress.findOneAndUpdate(
    { studentId, exerciseId: exercise._id },
    {
      $set: {
        lastAttemptedAt: now,
        ...(completed ? { completed: true, lastCompletedAt: now } : {}),
      },
      $max: { bestStars: stars, ...(completed ? { bestMoveCount: moveCount } : {}) },
      $inc: { attemptCount: 1, totalIncorrectMoves: incorrectMoves, totalHintsUsed: hintsUsed },
      $setOnInsert: { firstCompletedAt: completed ? now : undefined },
    },
    { upsert: true, new: true }
  ).lean();

  return NextResponse.json({
    ok: true,
    completed: Boolean(progress.completed),
    bestStars: progress.bestStars || 0,
    rewardSummary: reward,
  });
}
