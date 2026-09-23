import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { calculateLearningReward } from "@/lib/rewards";
import { verifyLearningSolution, type LearningExerciseSpec } from "@/lib/learning/engine";
import { StudentReward } from "@/models/ClassroomLive";
import { LearningAttempt, LearningExercise, LearningExerciseProgress } from "@/models/Learning";

export const dynamic = "force-dynamic";

function specFrom(exercise: any): LearningExerciseSpec {
  return {
    rulesMode: exercise.rulesMode,
    interactionMode: exercise.interactionMode,
    goalType: String(exercise.goalType || ""),
    startingPosition: String(exercise.startingPosition || "start"),
    orientation: exercise.orientation === "black" ? "black" : "white",
    sideToMove: exercise.sideToMove === "black" ? "black" : "white",
    goalConfig: (exercise.goalConfig || {}) as Record<string, unknown>,
    acceptedSolutions: Array.isArray(exercise.acceptedSolutions)
      ? exercise.acceptedSolutions.map((solution: any) => ({
          moves: Array.isArray(solution?.moves) ? solution.moves.map(String) : [],
        }))
      : [],
    opponentScript: Array.isArray(exercise.opponentScript)
      ? exercise.opponentScript.map((step: any) => ({
          actor: step?.actor === "opponent" ? "opponent" : "student",
          move: step?.move ? String(step.move) : undefined,
          acceptedMoves: Array.isArray(step?.acceptedMoves) ? step.acceptedMoves.map(String) : [],
        }))
      : [],
    targets: Array.isArray(exercise.targets) ? exercise.targets.map(String) : [],
    obstacles: Array.isArray(exercise.obstacles) ? exercise.obstacles.map(String) : [],
    maxMoves: Number(exercise.maxMoves || 0),
    idealMoves: Number(exercise.idealMoves || 1),
  };
}

function starsFor(incorrectMoves: number, hintsUsed: number, resetCount: number) {
  if (incorrectMoves === 0 && hintsUsed === 0 && resetCount === 0) return 3;
  if (incorrectMoves <= 1 && hintsUsed <= 1) return 2;
  return 1;
}

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

  const moves = Array.isArray(body?.moves) ? body.moves.slice(0, 50).map(String) : [];
  const selections = Array.isArray(body?.selections) ? body.selections.slice(0, 16).map(String) : [];
  const choice = String(body?.choice || "");

  // The browser reports what the student did; the server decides whether it solved
  // the exercise by replaying it through the same engine.
  const verdict = verifyLearningSolution(specFrom(exercise), { moves, selections, choice });
  const completed = verdict.solved;

  const incorrectMoves = Math.max(0, Math.min(99, Number(body?.incorrectMoves || 0)));
  const hintsUsed = Math.max(0, Math.min(99, Number(body?.hintsUsed || 0)));
  const resetCount = Math.max(0, Math.min(99, Number(body?.resetCount || 0)));
  const durationSeconds = Math.max(0, Math.min(60 * 60, Number(body?.durationSeconds || 0)));
  // A slide is read, not solved. It counts towards progress but earns no stars.
  const isSlide = exercise.interactionMode === "INFORMATION";
  const stars = completed && !isSlide ? starsFor(incorrectMoves, hintsUsed, resetCount) : 0;
  const moveCount = completed ? verdict.moveCount : moves.length;

  // Re-reading a slide is free, so it must not pay out again - otherwise XP can be
  // farmed with a button that takes one click and cannot be failed.
  const alreadyRead: any = isSlide
    ? await LearningExerciseProgress.findOne({ studentId, exerciseId: exercise._id }).select("completed").lean()
    : null;
  const payReward = !isSlide || !alreadyRead?.completed;

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
    acceptedMoves: completed ? moves : [],
    eventLog: Array.isArray(body?.eventLog) ? body.eventLog.slice(0, 100) : [],
    incorrectMoves,
    hintsUsed,
    resetCount,
    moveCount,
    durationSeconds,
  });

  if (payReward) {
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
  }

  const now = new Date();
  const progress: any = await LearningExerciseProgress.findOneAndUpdate(
    { studentId, exerciseId: exercise._id },
    {
      $set: {
        lastAttemptedAt: now,
        ...(completed ? { completed: true, lastCompletedAt: now } : {}),
      },
      $max: { bestStars: stars },
      // "Best" for a move count means the fewest, not the most.
      ...(completed ? { $min: { bestMoveCount: moveCount } } : {}),
      $inc: { attemptCount: 1, totalIncorrectMoves: incorrectMoves, totalHintsUsed: hintsUsed },
      $setOnInsert: { firstCompletedAt: completed ? now : undefined },
    },
    { upsert: true, new: true }
  ).lean();

  if (!completed) {
    return NextResponse.json(
      { ok: false, completed: false, error: "That solution does not complete the exercise." },
      { status: 422 }
    );
  }

  return NextResponse.json({
    ok: true,
    completed: Boolean(progress.completed),
    bestStars: progress.bestStars || 0,
    rewardSummary: payReward ? reward : { xp: 0, coins: 0 },
  });
}
