import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework, Submission } from "@/models/Homework";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const hw: any = await Homework.findById(params.id).lean();
  if (!hw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { answers } = (await req.json()) as { answers: { puzzleId: string; moves: string[] }[] };
  let totalScore = 0;
  const graded = answers.map((a) => {
    const p = hw.puzzles.find((x: any) => x._id.toString() === a.puzzleId);
    if (!p) return { ...a, correct: false, pointsAwarded: 0 };
    const correct = JSON.stringify(p.solution) === JSON.stringify(a.moves);
    const pts = correct ? p.points ?? 1 : 0;
    totalScore += pts;
    return { ...a, correct, pointsAwarded: pts };
  });

  const sub = await Submission.findOneAndUpdate(
    { homework: hw._id, student: (session.user as any).id },
    { answers: graded, totalScore, submittedAt: new Date() },
    { upsert: true, new: true }
  );
  await recordActivity({
    actor: (session.user as any).id,
    targetUser: (session.user as any).id,
    type: "homework.submitted",
    label: `Submitted homework ${hw.title}`,
    entityType: "Homework",
    entityId: hw._id.toString(),
    metadata: { totalScore, answers: graded.length },
  });
  return NextResponse.json(sub);
}
