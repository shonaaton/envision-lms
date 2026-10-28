import { NextResponse } from "next/server";
import { examErrorResponse, forbidden, requireExamViewer } from "@/lib/exams/examHttp";
import { VIOLATION_TYPES, type ViolationType } from "@/lib/exams/examRules";
import {
  ExamError,
  answerMcq,
  getStudentExam,
  heartbeat,
  playMove,
  recordViolation,
  startExam,
  submitByStudent,
  takeHint,
} from "@/lib/exams/examService";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

async function requireStudent() {
  const viewer = await requireExamViewer();
  return viewer?.role === "student" ? viewer : null;
}

export async function GET(_req: Request, { params }: Params) {
  const viewer = await requireStudent();
  if (!viewer) return forbidden();
  try {
    return NextResponse.json({ exam: await getStudentExam(params.id, viewer.id) });
  } catch (error) {
    return examErrorResponse(error);
  }
}

/**
 * Everything the student does during a sitting. Read as text because the
 * goodbye from a closing page arrives through navigator.sendBeacon.
 */
export async function POST(req: Request, { params }: Params) {
  const viewer = await requireStudent();
  if (!viewer) return forbidden();
  try {
    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};
    const action = String(body.action || "");
    const questionId = String(body.questionId || "");
    switch (action) {
      case "start":
        return NextResponse.json({ exam: await startExam(params.id, viewer.id) });
      case "mcq":
        return NextResponse.json(await answerMcq(params.id, viewer.id, questionId, String(body.optionId || "")));
      case "move":
        return NextResponse.json(await playMove(params.id, viewer.id, questionId, { from: String(body.from || ""), to: String(body.to || ""), promotion: body.promotion }));
      case "hint":
        return NextResponse.json(await takeHint(params.id, viewer.id, questionId));
      case "heartbeat":
        return NextResponse.json(await heartbeat(params.id, viewer.id));
      case "violation": {
        const type = String(body.type || "") as ViolationType;
        if (!(VIOLATION_TYPES as readonly string[]).includes(type)) throw new ExamError("Unknown event.");
        return NextResponse.json(await recordViolation(params.id, viewer.id, type));
      }
      case "submit":
        return NextResponse.json({ exam: await submitByStudent(params.id, viewer.id) });
      default:
        throw new ExamError("Unknown action.");
    }
  } catch (error) {
    return examErrorResponse(error);
  }
}
