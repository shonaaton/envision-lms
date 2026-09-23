import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { requireLearnAuthoring } from "@/lib/learning/authoringAccess";
import { getAuthoringCatalog, validateExerciseDraft } from "@/lib/learning/adminService";
import { sanitizeExerciseInput } from "@/lib/learning/exerciseInput";
import { LearningExercise, LearningLesson } from "@/models/Learning";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireLearnAuthoring("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getAuthoringCatalog());
}

export async function POST(request: Request) {
  const session = await requireLearnAuthoring("create");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const lessonId = String(body?.lessonId || "");
  if (!lessonId) return NextResponse.json({ error: "Choose a lesson first" }, { status: 400 });

  await dbConnect();
  const lesson: any = await LearningLesson.findById(lessonId).lean();
  if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  const draft = sanitizeExerciseInput(body);
  const report = validateExerciseDraft(draft);
  if (draft.status === "published" && !report.ok) {
    return NextResponse.json({ error: "This exercise cannot be published yet", report }, { status: 422 });
  }

  const highest: any = await LearningExercise.findOne({ lessonId }).sort({ order: -1 }).select("order").lean();
  const order = Number(highest?.order || 0) + 1;
  const stableKey = String(body?.stableKey || `${lesson.stableKey}.custom.${Date.now().toString(36)}`);

  const created = await LearningExercise.create({
    ...draft,
    lessonId,
    stableKey,
    order,
    version: 1,
    createdBy: `user:${(session.user as any)?.id || "unknown"}`,
  });

  return NextResponse.json({ ok: true, id: String(created._id), report }, { status: 201 });
}
