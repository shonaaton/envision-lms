import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { LiveQuestion, LiveQuestionResponse, StudentReward } from "@/models/ClassroomLive";
import { getRequestedSessionId } from "@/lib/classroomLiveSession";
import { getLiveClassroomForUser } from "@/lib/liveClassroomAccess";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const userId = (session.user as { id?: string }).id || "";
  const role = (session.user as { role?: "student" | "instructor" | "admin" | "sub-admin" }).role;
  if (!role || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "student") return NextResponse.json({ error: "Only students can submit classroom responses" }, { status: 403 });
  const scheduledSessionId = getRequestedSessionId(req);
  if (!scheduledSessionId) return NextResponse.json({ error: "Scheduled session required" }, { status: 400 });
  const { classroom, allowed } = await getLiveClassroomForUser(params.id, role, userId, scheduledSessionId);
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const question: any = await LiveQuestion.findById(body.question);
  if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  if (String(question.classroom) !== params.id || String(question.scheduledSessionId || "") !== scheduledSessionId) {
    return NextResponse.json({ error: "Question does not belong to this classroom session" }, { status: 400 });
  }
  const existing: any = await LiveQuestionResponse.findOne({ question: question._id, student: userId });
  let submittedMove = String(body.submittedMove || "").trim();
  let correct = question.solution?.length ? question.solution[0] === submittedMove || question.solution.join(" ") === submittedMove : false;
  const correctMarks = Number(question.scoring?.correct ?? 5);
  const wrongPenalty = Number(question.scoring?.wrongPenalty ?? 0);
  const hintPenalty = Number(question.scoring?.hintPenalty ?? 0);
  let score = correct ? correctMarks : -wrongPenalty;
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
      const attempted = Boolean(result.skipped || result.pending || result.submittedMove || (Array.isArray(result.attempts) && result.attempts.length));
      const mistakes = Number(result.mistakes || 0);
      const itemHints = Number(result.hintsUsed || 0);
      const base = Number(item.points ?? correctMarks);
      if (solved) completedItems += 1;
      score += solved ? Math.max(0, base - itemHints * hintPenalty) : attempted ? -wrongPenalty : 0;
      attemptsUsed += Math.max(1, mistakes + 1);
      hintsUsed += itemHints;
    }
    correct = completedItems === totalItems && totalItems > 0;
    submittedMove = "";
    feedback = correct ? "Quiz completed" : `${completedItems}/${totalItems} solved`;
  }

  const response = await LiveQuestionResponse.findOneAndUpdate(
    { question: question._id, student: userId },
    {
      question: question._id,
      classroom: params.id,
      scheduledSessionId,
      student: userId,
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
    { student: userId, sourceType: "live_question", sourceId: question._id },
    {
      student: userId,
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
