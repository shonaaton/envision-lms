import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { LiveQuestion, LiveQuestionResponse, StudentReward } from "@/models/ClassroomLive";
import { getRequestedSessionId } from "@/lib/classroomLiveSession";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const scheduledSessionId = getRequestedSessionId(req);
  if (!scheduledSessionId) return NextResponse.json({ error: "Scheduled session required" }, { status: 400 });
  const body = await req.json();
  const question: any = await LiveQuestion.findById(body.question);
  if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  const existing: any = await LiveQuestionResponse.findOne({ question: question._id, student: (session.user as any).id });
  let submittedMove = String(body.submittedMove || "").trim();
  let correct = question.solution?.length ? question.solution[0] === submittedMove || question.solution.join(" ") === submittedMove : false;
  let score = correct ? question.scoring?.correct ?? 5 : -(question.scoring?.wrongPenalty ?? 0);
  let itemResults: Record<string, any> = {};
  let completedItems = 0;
  let totalItems = 0;
  let hintsUsed = Number(body.hintsUsed || 0);
  let attemptsUsed = Number(body.attemptsUsed || 1);
  let feedback = correct ? "Correct" : "Submitted";

  if (Array.isArray(question.items) && question.items.length) {
    itemResults = { ...(existing?.itemResults || {}), ...(body.itemResults || {}) };
    totalItems = question.items.length;
    score = 0;
    completedItems = 0;
    attemptsUsed = 0;
    hintsUsed = 0;
    for (const item of question.items) {
      const result = itemResults[item.id] || {};
      const solved = Boolean(result.solved);
      const mistakes = Number(result.mistakes || 0);
      const itemHints = Number(result.hintsUsed || 0);
      const base = Number(item.points ?? question.scoring?.correct ?? 5);
      if (solved) completedItems += 1;
      score += solved ? Math.max(0, base - mistakes - itemHints * 0.5) : 0;
      attemptsUsed += Math.max(1, mistakes + 1);
      hintsUsed += itemHints;
    }
    correct = completedItems === totalItems && totalItems > 0;
    submittedMove = "";
    feedback = correct ? "Quiz completed" : `${completedItems}/${totalItems} solved`;
  }

  const response = await LiveQuestionResponse.findOneAndUpdate(
    { question: question._id, student: (session.user as any).id },
    {
      question: question._id,
      classroom: params.id,
      scheduledSessionId,
      student: (session.user as any).id,
      submittedMove,
      submittedSequence: submittedMove.split(/\s+/).filter(Boolean),
      itemResults,
      timeTakenSeconds: Number(body.timeTakenSeconds || 0),
      hintsUsed,
      attemptsUsed,
      completedItems,
      totalItems,
      correct,
      score,
      feedback,
      submittedAt: new Date(),
    },
    { upsert: true, new: true }
  );
  await StudentReward.findOneAndUpdate(
    { student: (session.user as any).id, sourceType: "live_question", sourceId: question._id },
    {
      student: (session.user as any).id,
      sourceType: "live_question",
      sourceId: question._id,
      xp: Math.max(1, score),
      coins: correct ? 2 : 1,
      reason: `Live classroom response: ${question.title}`,
    },
    { upsert: true, new: true }
  );
  return NextResponse.json(response);
}
