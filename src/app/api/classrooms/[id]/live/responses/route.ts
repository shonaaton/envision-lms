import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { LiveQuestion, LiveQuestionResponse, StudentReward } from "@/models/ClassroomLive";
import { getRequestedSessionId } from "@/lib/classroomLiveSession";
import { getLiveClassroomForUser } from "@/lib/liveClassroomAccess";
import { calculateLiveQuestionReward, calculateLiveSequenceReward, LIVE_QUESTION_WRONG_MOVE_XP_PENALTY, LIVE_QUESTION_ZERO_REWARD_WRONG_ATTEMPTS } from "@/lib/rewards";

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
  const correctMarks = Number(question.scoring?.correct ?? 5);
  const hintPenalty = Number(question.scoring?.hintPenalty ?? 0);
  let correct = Boolean(existing?.correct);
  let score = Number(existing?.score || 0);
  let itemResults: Record<string, any> = {};
  let completedItems = Number(existing?.completedItems || 0);
  let solvedItems = 0;
  let totalItems = Number(existing?.totalItems || 0);
  let hintsUsed = Number(body.hintsUsed || 0);
  let attemptsUsed = Number(body.attemptsUsed || 1);
  let feedback = correct ? "Correct" : "Submitted";
  // Progress bookkeeping for the flat `solution[]` path (no `items[]`) — a
  // question stays open across submissions until it's solved or the coach
  // ends it, so both counters carry forward from the previous response.
  let matchedSequenceIndex = Math.max(0, Number(existing?.matchedSequenceIndex || 0));
  let wrongAttempts = Math.max(0, Number(existing?.wrongAttempts || 0));
  // Whether any single position in this response hit the wrong-move cutoff —
  // used to suppress the "solved" badge even if the student got there eventually.
  let wrongAttemptsExceeded = false;

  const isItemsQuiz = Array.isArray(question.items) && question.items.length > 0;
  const isSequenceQuestion = !isItemsQuiz && Array.isArray(question.solution) && question.solution.length > 0;

  if (isItemsQuiz) {
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
      // `mistakes` is the number of wrong moves the student played on this
      // position (tracked move-by-move on the board, not just the first
      // move) — it IS the wrong-attempt count for the flat XP-penalty policy.
      const mistakes = Number(result.mistakes || 0);
      const cappedMistakes = Math.min(mistakes, LIVE_QUESTION_ZERO_REWARD_WRONG_ATTEMPTS);
      const recordedAttempts = Array.isArray(result.attempts) ? result.attempts.length : 0;
      const itemHints = Number(result.hintsUsed || 0);
      const base = Number(item.points ?? correctMarks);
      const itemExceededCutoff = mistakes >= LIVE_QUESTION_ZERO_REWARD_WRONG_ATTEMPTS;
      if (itemExceededCutoff && attempted) wrongAttemptsExceeded = true;
      if (solved || result.skipped) completedItems += 1;
      if (solved) solvedItems += 1;
      score += solved
        ? itemExceededCutoff
          ? 0
          : Math.max(0, base - mistakes * LIVE_QUESTION_WRONG_MOVE_XP_PENALTY - itemHints * hintPenalty)
        : attempted
          ? -cappedMistakes * LIVE_QUESTION_WRONG_MOVE_XP_PENALTY
          : 0;
      attemptsUsed += attempted ? Math.max(1, mistakes + 1, recordedAttempts) : 0;
      hintsUsed += itemHints;
    }
    correct = solvedItems === totalItems && totalItems > 0;
    submittedMove = "";
    feedback = correct ? "Quiz completed" : `${completedItems}/${totalItems} answered`;
  } else if (isSequenceQuestion) {
    // Single position answered as one submitted move/line with no board-quiz
    // item wrapper (e.g. a direct API call rather than the normal board UI).
    // Match moves against the solution in order — matching only the first
    // move of a multi-move line no longer counts as solving the whole thing.
    const solutionMoves = question.solution.map((move: string) => String(move || "").trim()).filter(Boolean);
    if (!correct && submittedMove) {
      // Accept either one move per submission or the whole remaining line
      // typed at once — either way every token must match the solution in
      // order starting from where the student left off. A partial prefix
      // (e.g. just the first move of a 3-move mate) only advances the
      // sequence that far; it never counts as solving the whole thing.
      const submittedTokens = submittedMove.split(/\s+/).filter(Boolean);
      let cursor = matchedSequenceIndex;
      const allMatched = submittedTokens.length > 0 && submittedTokens.every((token) => {
        if (solutionMoves[cursor] !== token) return false;
        cursor += 1;
        return true;
      });
      if (allMatched) {
        matchedSequenceIndex = cursor;
        correct = matchedSequenceIndex >= solutionMoves.length;
        feedback = correct ? "Correct" : `Move ${matchedSequenceIndex} of ${solutionMoves.length} correct - keep going`;
      } else {
        wrongAttempts += 1;
        feedback = "Incorrect - try again";
      }
    } else if (correct) {
      feedback = "Correct";
    }
    wrongAttemptsExceeded = wrongAttempts >= LIVE_QUESTION_ZERO_REWARD_WRONG_ATTEMPTS;
    completedItems = correct ? 1 : 0;
    totalItems = 1;
    attemptsUsed = wrongAttempts + matchedSequenceIndex;
  } else {
    // No auto-gradable answer key on this question (e.g. an open-ended
    // "ask everyone" prompt) — record the submission without scoring it.
    feedback = "Submitted";
  }

  const reward = isSequenceQuestion
    ? calculateLiveSequenceReward({ correct, wrongAttempts, baseXp: correctMarks })
    : calculateLiveQuestionReward({ completedItems, totalItems, correct, score, hintsUsed, attemptsUsed, wrongAttemptsExceeded });
  if (isSequenceQuestion) score = correct ? reward.xp : -Math.min(wrongAttempts, LIVE_QUESTION_ZERO_REWARD_WRONG_ATTEMPTS) * LIVE_QUESTION_WRONG_MOVE_XP_PENALTY;

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
      matchedSequenceIndex,
      wrongAttempts,
      finalSubmitted: Boolean(existing?.finalSubmitted || body.finalSubmitted || correct),
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
      xp: reward.xp,
      coins: reward.coins,
      badge: reward.badge || "",
      reason: `Live classroom response: ${question.title}`,
    },
    { upsert: true, new: true }
  );
  return NextResponse.json(response);
}
