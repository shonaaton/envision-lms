import { NextResponse } from "next/server";
import { examErrorResponse, forbidden, requireExamViewer } from "@/lib/exams/examHttp";
import { listAssignmentsForCoach, listAssignmentsForStaff, listStudentExams } from "@/lib/exams/examService";

export const dynamic = "force-dynamic";

/** A student's own exams; a coach's students' results; everyone's for staff. */
export async function GET() {
  const viewer = await requireExamViewer();
  if (!viewer) return forbidden();
  try {
    if (viewer.role === "student") return NextResponse.json({ role: viewer.role, exams: await listStudentExams(viewer.id) });
    if (viewer.role === "instructor") return NextResponse.json({ role: viewer.role, results: await listAssignmentsForCoach(viewer.id) });
    return NextResponse.json({ role: viewer.role, results: await listAssignmentsForStaff() });
  } catch (error) {
    return examErrorResponse(error);
  }
}
