import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework, Submission } from "@/models/Homework";
import { StudentReward } from "@/models/ClassroomLive";
import { recordActivity } from "@/lib/activity";
import { canStudentAccessHomework } from "@/lib/homeworkAccess";
import { calculateHomeworkReward } from "@/lib/rewards";
import { sendHomeworkSubmittedConfirmationEmail } from "@/lib/studentCommunicationEmails";

export const dynamic = "force-dynamic";

function answerKey(activityId: string, itemId: string) {
  return `${activityId}:${itemId}`;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "student") return NextResponse.json({ error: "Only students can submit homework" }, { status: 403 });
  await dbConnect();

  const hw: any = await Homework.findById(params.id).lean();
  if (!hw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const student = (session.user as any).id;
  if (!(await canStudentAccessHomework(hw, student))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing: any = await Submission.findOne({ homework: hw._id, student }).lean();
  const maxAttempts = Math.max(1, Number(hw.numberOfAttempts || 1));
  const attemptsUsed = Number(existing?.attemptsUsed || 0);
  if (attemptsUsed >= maxAttempts) {
    return NextResponse.json({ error: "No attempts remaining" }, { status: 403 });
  }

  const payload = await req.json();
  const quizAnswers = payload.quizAnswers || {};
  const writtenAnswers = payload.writtenAnswers || {};
  const activityResults = payload.activityResults || {};
  const clientMetrics = payload.metrics || {};

  let totalScore = 0;
  let correctCount = 0;
  let totalAutoChecked = 0;
  let totalMcq = 0;
  let correctMcq = 0;
  let totalBoards = 0;
  let solvedBoards = 0;
  let mistakes = Number(clientMetrics.mistakes || 0);
  let hintsUsed = Number(clientMetrics.hintsUsed || 0);
  const graded: any[] = [];

  for (const activity of hw.activities || []) {
    if (activity.type === "quiz") {
      const negative = Number(activity.source?.negativePoints || 0);
      for (const item of activity.items || []) {
        totalMcq += 1;
        totalAutoChecked += 1;
        const selected = quizAnswers[answerKey(activity._id.toString(), item.id)] || "";
        const correct = (item.options || []).some((option: any) => option.id === selected && option.correct);
        const points = correct ? Number(item.points ?? activity.points ?? 1) : -negative;
        if (correct) {
          correctCount += 1;
          correctMcq += 1;
        }
        totalScore += points;
        graded.push({ activityId: activity._id, itemId: item.id, kind: "mcq", correct, pointsAwarded: points, selected });
      }
    }

    if (activity.type === "written_answer") {
      for (const item of activity.items || []) {
        const textAnswer = String(writtenAnswers[answerKey(activity._id.toString(), item.id)] || "").trim();
        graded.push({
          activityId: activity._id,
          itemId: item.id,
          kind: "written_answer",
          question: item.question || item.title || "",
          textAnswer,
          expectedAnswer: item.expectedAnswer || item.answerText || "",
          correct: false,
          pointsAwarded: 0,
          needsReview: true,
        });
      }
    }

    if (activity.type === "study_pgn" && activity.source?.kind === "pgn_quiz") {
      for (const item of activity.items || []) {
        totalBoards += 1;
        totalAutoChecked += 1;
        const result = activityResults[answerKey(activity._id.toString(), item.id)] || {};
        const correct = Boolean(result.solved);
        const itemMistakes = Number(result.mistakes || 0);
        const itemHints = Number(result.hintsUsed || 0);
        mistakes += itemMistakes;
        hintsUsed += itemHints;
        const base = Number(item.points ?? activity.points ?? 1);
        const points = correct ? Math.max(0, base - itemMistakes - itemHints * 0.5) : 0;
        if (correct) {
          correctCount += 1;
          solvedBoards += 1;
        }
        totalScore += points;
        graded.push({ activityId: activity._id, itemId: item.id, kind: "pgn_quiz", correct, pointsAwarded: points, mistakes: itemMistakes, hintsUsed: itemHints });
      }
    }

    if (activity.type === "play_computer") {
      totalAutoChecked += 1;
      const result = activityResults[answerKey(activity._id.toString(), "play_computer")] || {};
      const correct = Boolean(result.solved || result.outcome === "victory");
      const points = correct ? Number(activity.points ?? 1) : 0;
      if (correct) correctCount += 1;
      totalScore += points;
      graded.push({
        activityId: activity._id,
        kind: "play_computer",
        correct,
        pointsAwarded: points,
        needsReview: false,
        moves: Array.isArray(result.moveHistory) ? result.moveHistory.map((move: any) => move.san).filter(Boolean) : [],
      });
    }
  }

  for (const a of payload.answers || []) {
    const p = (hw.puzzles || []).find((x: any) => x._id.toString() === a.puzzleId);
    if (!p) continue;
    totalAutoChecked += 1;
    const correct = JSON.stringify(p.solution) === JSON.stringify(a.moves);
    const pts = correct ? p.points ?? hw.scoring?.correct ?? 1 : -(hw.scoring?.wrongPenalty ?? 0);
    if (correct) correctCount += 1;
    totalScore += pts;
    graded.push({ ...a, kind: "legacy_puzzle", correct, pointsAwarded: pts });
  }

  const now = new Date();
  const isLate = hw.dueAt && now > new Date(hw.dueAt);
  if (isLate && hw.scoring?.latePenalty) totalScore -= hw.scoring.latePenalty;
  const accuracy = totalAutoChecked ? Math.round((correctCount / totalAutoChecked) * 100) : 0;

  const sub = await Submission.findOneAndUpdate(
    { homework: hw._id, student },
    {
      answers: graded,
      quizAnswers,
      writtenAnswers,
      activityResults,
      metrics: { mistakes, hintsUsed, solvedBoards, totalBoards, correctMcq, totalMcq },
      attemptsUsed: attemptsUsed + 1,
      totalScore,
      accuracy,
      timeTakenSeconds: Number(payload.timeTakenSeconds || 0),
      status: isLate ? "late" : "completed",
      submittedAt: now,
    },
    { upsert: true, new: true }
  );

  await recordActivity({
    actor: student,
    targetUser: student,
    type: "homework.submitted",
    label: `Submitted homework ${hw.title}`,
    entityType: "Homework",
    entityId: hw._id.toString(),
    metadata: { totalScore, accuracy, attemptsUsed: attemptsUsed + 1, mistakes, hintsUsed },
  });

  const { xp, coins, badge } = calculateHomeworkReward({
    totalAutoChecked,
    accuracy,
    attemptsUsed: attemptsUsed + 1,
    hintsUsed,
    mistakes,
    isLate,
  });
  const reward: any = await StudentReward.findOneAndUpdate(
    { student, sourceType: "homework_submission", sourceId: hw._id },
    {
      student,
      sourceType: "homework_submission",
      sourceId: hw._id,
      xp,
      coins,
      badge: badge || "",
      reason: `Homework submitted: ${hw.title}`,
    },
    { upsert: true, new: true }
  ).lean();

  await sendHomeworkSubmittedConfirmationEmail({
    homework: hw,
    studentId: student,
    submission: sub,
    reward,
    request: req,
  }).catch((error) => console.error("Homework submitted email failed", error));

  return NextResponse.json({
    ...sub.toObject(),
    rewardSummary: {
      xp: reward?.xp || xp,
      coins: reward?.coins || coins,
      badge: reward?.badge || "",
    },
  });
}
