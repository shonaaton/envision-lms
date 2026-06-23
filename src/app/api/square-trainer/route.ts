import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { consumeDemoUsage } from "@/lib/demoAccess";
import { StudentReward } from "@/models/ClassroomLive";

export const dynamic = "force-dynamic";

function cleanNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "student" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const correct = cleanNumber(body.correct);
  const mistakes = cleanNumber(body.mistakes);
  const durationSeconds = Math.min(300, Math.max(15, cleanNumber(body.durationSeconds, 60)));
  const bestStreak = cleanNumber(body.bestStreak);
  const orientation = body.orientation === "black" ? "black" : "white";
  const attempts = correct + mistakes;
  const accuracy = attempts ? Math.round((correct / attempts) * 100) : 0;
  const xp = Math.max(1, correct * 2 + Math.floor(bestStreak / 2) - Math.floor(mistakes / 2));
  const coins = Math.max(0, Math.floor(correct / 5));

  await dbConnect();
  const demoState = await consumeDemoUsage((session.user as any).id, "squareTrainer");
  if (!demoState.allowed) {
    return NextResponse.json({ error: "Your demo Square Trainer limit is finished. Please book a demo class or contact the academy." }, { status: 403 });
  }

  const reward = await StudentReward.create({
    student: (session.user as any).id,
    sourceType: "square_trainer",
    xp,
    coins,
    badge: correct >= 30 && accuracy >= 85 ? "Coordinate Sharp Shooter" : undefined,
    reason: `Square Trainer: ${correct}/${attempts} in ${durationSeconds}s (${accuracy}% accuracy)`,
  });

  await recordActivity({
    actor: (session.user as any).id,
    targetUser: (session.user as any).id,
    type: "square_trainer.completed",
    label: `Completed Square Trainer round: ${correct} correct, ${accuracy}% accuracy`,
    entityType: "StudentReward",
    entityId: reward._id.toString(),
    metadata: { correct, mistakes, durationSeconds, bestStreak, accuracy, orientation, xp, coins },
  });

  return NextResponse.json({
    ok: true,
    xp,
    coins,
    correct,
    mistakes,
    durationSeconds,
    bestStreak,
    accuracy,
    badge: reward.badge,
    demo: demoState,
  });
}
