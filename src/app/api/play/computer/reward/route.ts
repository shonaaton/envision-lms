import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { consumeDemoUsage } from "@/lib/demoAccess";
import { StudentReward } from "@/models/ClassroomLive";

export const dynamic = "force-dynamic";

function clampNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "student" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const outcome = String(body.outcome || "draw").toLowerCase();
  const botName = String(body.botName || "Computer").trim() || "Computer";
  const moveCount = Math.max(0, Math.floor(clampNumber(body.moveCount)));
  const durationSeconds = Math.max(0, Math.floor(clampNumber(body.durationSeconds)));
  const difficultyLevel = Math.max(1, Math.floor(clampNumber(body.level, 1)));

  const xp =
    outcome === "victory"
      ? 14 + Math.min(10, difficultyLevel)
      : outcome === "draw"
        ? 8 + Math.min(4, Math.floor(difficultyLevel / 2))
        : outcome === "resigned"
          ? 2
          : 3;
  const coins =
    outcome === "victory"
      ? 6 + Math.min(4, Math.floor(difficultyLevel / 3))
      : outcome === "draw"
        ? 3
        : 1;

  await dbConnect();
  const demoState = await consumeDemoUsage((session.user as any).id, "playComputer");
  if (!demoState.allowed) {
    return NextResponse.json({ error: "Your demo Play vs Computer limit is finished. Please book a demo class or contact the academy." }, { status: 403 });
  }

  const reward = await StudentReward.create({
    student: (session.user as any).id,
    sourceType: "play_vs_computer",
    xp,
    coins,
    badge: outcome === "victory" && difficultyLevel >= 8 ? "Bot Breaker" : undefined,
    reason: `Play vs Computer: ${outcome} against ${botName} in ${moveCount} moves`,
  });

  await recordActivity({
    actor: (session.user as any).id,
    targetUser: (session.user as any).id,
    type: "play_vs_computer.completed",
    label: `Finished a Play vs Computer game: ${outcome} vs ${botName}`,
    entityType: "StudentReward",
    entityId: reward._id.toString(),
    metadata: { outcome, botName, moveCount, durationSeconds, difficultyLevel, xp, coins },
  });

  return NextResponse.json({ ok: true, xp, coins, badge: reward.badge || "", demo: demoState });
}
