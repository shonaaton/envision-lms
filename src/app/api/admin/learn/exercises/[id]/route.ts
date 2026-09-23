import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { requireLearnAuthoring } from "@/lib/learning/authoringAccess";
import { getExerciseById, validateExerciseDraft } from "@/lib/learning/adminService";
import { sanitizeExerciseInput } from "@/lib/learning/exerciseInput";
import { LearningExercise } from "@/models/Learning";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await requireLearnAuthoring("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const exercise = await getExerciseById(params.id);
  if (!exercise) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  return NextResponse.json(exercise);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await requireLearnAuthoring("edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const existing: any = await LearningExercise.findById(params.id).lean();
  if (!existing) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const draft = sanitizeExerciseInput({ ...existing, ...body });
  const report = validateExerciseDraft(draft);

  // A draft may be saved half-finished. A published exercise may not: a student
  // would hit a position with no way through.
  if (draft.status === "published" && !report.ok) {
    return NextResponse.json({ error: "This exercise cannot be published yet", report }, { status: 422 });
  }

  await LearningExercise.updateOne(
    { _id: params.id },
    {
      $set: {
        ...draft,
        version: Number(existing.version || 1) + 1,
      },
    }
  );

  return NextResponse.json({ ok: true, report, exercise: await getExerciseById(params.id) });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await requireLearnAuthoring("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  // Archive rather than delete: students have attempts and progress pointing here.
  const result = await LearningExercise.updateOne({ _id: params.id }, { $set: { status: "archived" } });
  if (!result.matchedCount) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  return NextResponse.json({ ok: true, archived: true });
}
