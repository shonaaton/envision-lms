import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { LiveQuestion, LiveQuestionResponse, StudentReward } from "@/models/ClassroomLive";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const body = await req.json();
  const question: any = await LiveQuestion.findById(body.question);
  if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  const submittedMove = String(body.submittedMove || "").trim();
  const correct = question.solution?.length ? question.solution[0] === submittedMove || question.solution.join(" ") === submittedMove : false;
  const score = correct ? question.scoring?.correct ?? 5 : -(question.scoring?.wrongPenalty ?? 0);
  const response = await LiveQuestionResponse.findOneAndUpdate(
    { question: question._id, student: (session.user as any).id },
    {
      question: question._id,
      classroom: params.id,
      student: (session.user as any).id,
      submittedMove,
      submittedSequence: submittedMove.split(/\s+/).filter(Boolean),
      timeTakenSeconds: Number(body.timeTakenSeconds || 0),
      hintsUsed: Number(body.hintsUsed || 0),
      attemptsUsed: Number(body.attemptsUsed || 1),
      correct,
      score,
      feedback: correct ? "Correct" : "Submitted",
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
