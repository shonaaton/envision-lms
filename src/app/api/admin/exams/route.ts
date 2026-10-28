import { NextResponse } from "next/server";
import { examErrorResponse, forbidden, requireExamAdmin } from "@/lib/exams/examHttp";
import {
  ExamError,
  assignExam,
  assignTargets,
  cancelExam,
  editPaperQuestion,
  examBankCounts,
  generatePaper,
  getPaper,
  listAssignmentsForStaff,
  listPapers,
  publishPaper,
  replacePaperQuestion,
  resendCertificate,
  resolveAssignTargets,
} from "@/lib/exams/examService";
import { EXAM_ASSIGNMENT_STATUSES } from "@/models/Exam";

export const dynamic = "force-dynamic";

/**
 * GET ?view=papers (default) | paper&tier=&level= | bank | assignments | targets
 */
export async function GET(req: Request) {
  const actor = await requireExamAdmin(req, "view");
  if (!actor) return forbidden();
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "papers";
  try {
    if (view === "paper") return NextResponse.json({ paper: await getPaper(url.searchParams.get("tier"), url.searchParams.get("level")) });
    if (view === "bank") return NextResponse.json({ bank: await examBankCounts() });
    if (view === "targets") return NextResponse.json(await assignTargets());
    if (view === "assignments") {
      const status = url.searchParams.get("status") || "";
      return NextResponse.json({
        assignments: await listAssignmentsForStaff({
          tier: url.searchParams.get("tier") || undefined,
          levelNumber: Number(url.searchParams.get("level")) || undefined,
          status: (EXAM_ASSIGNMENT_STATUSES as readonly string[]).includes(status) ? status : undefined,
        }),
      });
    }
    return NextResponse.json({ papers: await listPapers() });
  } catch (error) {
    return examErrorResponse(error);
  }
}

const EDIT_ACTIONS = new Set(["generate_paper", "replace_question", "edit_question", "publish"]);
const ASSIGN_ACTIONS = new Set(["assign", "cancel", "resend_certificate"]);

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const action = String(body?.action || "");
  if (!EDIT_ACTIONS.has(action) && !ASSIGN_ACTIONS.has(action)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const actor = await requireExamAdmin(req, EDIT_ACTIONS.has(action) ? "edit" : "assign");
  if (!actor) return forbidden();
  try {
    switch (action) {
      case "generate_paper":
        return NextResponse.json({ paper: await generatePaper(body.tier, body.level, actor.id) });
      case "replace_question":
        return NextResponse.json({ paper: await replacePaperQuestion(body.tier, body.level, String(body.slotId || ""), actor.id) });
      case "edit_question":
        return NextResponse.json({ paper: await editPaperQuestion(body.tier, body.level, String(body.slotId || ""), body.question, actor.id) });
      case "publish":
        return NextResponse.json({ paper: await publishPaper(body.tier, body.level, actor.id) });
      case "assign": {
        const studentIds = await resolveAssignTargets({
          studentIds: Array.isArray(body.studentIds) ? body.studentIds.map(String) : [],
          batchId: body.batchId ? String(body.batchId) : undefined,
          classroomId: body.classroomId ? String(body.classroomId) : undefined,
        });
        if (!studentIds.length) throw new ExamError("Choose at least one student, a batch or a classroom.");
        return NextResponse.json(await assignExam({ studentIds, tier: body.tier, levelNumber: body.level, source: "manual", actorId: actor.id }));
      }
      case "cancel":
        return NextResponse.json(await cancelExam(String(body.id || ""), actor.id));
      case "resend_certificate":
        return NextResponse.json(await resendCertificate(String(body.id || "")));
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return examErrorResponse(error);
  }
}
