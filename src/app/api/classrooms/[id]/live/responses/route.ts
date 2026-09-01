import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { LiveQuestion, LiveQuestionResponse, StudentReward } from "@/models/ClassroomLive";
import { getRequestedSessionId } from "@/lib/classroomLiveSession";
import { getLiveClassroomForUser } from "@/lib/liveClassroomAccess";
import { calculateLiveQuestionReward } from "@/lib/rewards";

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
  let solvedItems = 0;
  let totalItems = 0;
  let hintsUsed = Number(body.hintsUsed || 0);
  let attemptsUsed = Number(body.attemptsUsed || 1);
  let feedback = correct ? "Correct" : "Submitted";

  if (Array.isArray(question.items) && question.items.length) {
    const existingItemResults = existing?.itemResults || {};
    itemResults = { ...existingItemResults };
    for (const [itemId, incomingValue] of Object.entries(body.itemResults || {})) {
      const previous: any = existingItemResults[itemId] || {};
      const incoming: any = incomingValue || {};
      const previousAttempts = Array.isArray(previous.attempts) ? previous.attempts : [];
      const incomingAttempts = Array.isArray(incoming.attempts) ? incoming.attempts : [];
      const incomingContainsHistory = previousAttempts.every((attempt: any, index: number) => incomingAttempts[index] === attempt);
      itemResults[itemId] = {
        ...previous,
        ...incoming,
        mistakes: Math.max(Number(previous.mistakes || 0), Number(incoming.mistakes || 0)),
        hintsUsed: Math.max(Number(previous.hintsUsed || 0), Number(incoming.hintsUsed || 0)),
        timeTakenSeconds: Math.max(Number(previous.timeTakenSeconds || 0), Number(incoming.timeTakenSeconds || 0)),
        attempts: incomingContainsHistory ? incomingAttempts : [...previousAttempts, ...incomingAttempts],
      };
    }
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
      const recordedAttempts = Array.isArray(result.attempts) ? result.attempts.length : 0;
      const itemHints = Number(result.hintsUsed || 0);
      const base = Number(item.points ?? correctMarks);
      if (solved || result.skipped) completedItems += 1;
      if (solved) solvedItems += 1;
      score += solved ? Math.max(0, base - itemHints * hintPenalty) : attempted ? -wrongPenalty : 0;
      attemptsUsed += attempted ? Math.max(1, mistakes + 1, recordedAttempts) : 0;
      hintsUsed += itemHints;
    }
    correct = solvedItems === totalItems && totalItems > 0;
    submittedMove = "";
    feedback = correct ? "Quiz completed" : `${completedItems}/${totalItems} answered`;
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
      finalSubmitted: Boolean(existing?.finalSubmitted || body.finalSubmitted),
      submittedAt: new Date(),
    },
    { upsert: true, new: true }
  );
  const reward = calculateLiveQuestionReward({ completedItems, totalItems, correct, score, hintsUsed, attemptsUsed });
  await StudentReward.findOneAndUpdate(
    { student: userId, sourceType: "live_question", sourceId: question._id },
    {
      student: userId,
      sourceType: "live_question",
      sourceId: question._id,
      xp: reward.xp,
      coins: reward.coins,
      badge: reward.badge || "",
      reason: `Live classroom response: ${question.title}`,
    },
    { upsert: true, new: true }
  );
  return NextResponse.json(response);
}
