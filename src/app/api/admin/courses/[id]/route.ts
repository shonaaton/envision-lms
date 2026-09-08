import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { Course } from "@/models/Course";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { applyCourseRenames, hasRenames, planCourseRenames } from "@/lib/courseRenames";
import { isCourseTierOrMixed } from "@/lib/courseTiers";

export const dynamic = "force-dynamic";

// A level or topic keeps the id it was saved with. Rebuilding the array without
// ids gave every level a fresh one on each save, which made a rename look like a
// delete plus an add - and a rename is exactly what has to be pushed out to the
// classrooms and templates that copied the old name.
function keepSubdocumentId(value: any) {
  const id = String(value?._id || "").trim();
  return Types.ObjectId.isValid(id) ? { _id: id } : {};
}

function normalizeCourse(input: any) {
  const levels = Array.isArray(input.levels) ? input.levels : [];
  const normalizedLevels = levels.map((level: any, levelIndex: number) => {
    const topics = Array.isArray(level.topics) ? level.topics : [];
    const normalizedTopics = topics
      .filter((topic: any) => String(topic.name || "").trim())
      .map((topic: any, topicIndex: number) => ({
        ...keepSubdocumentId(topic),
        name: String(topic.name || "").trim(),
        description: String(topic.description || "").trim(),
        sessionCount: 1,
        order: Number(topic.order ?? topicIndex),
      }));
    return {
      ...keepSubdocumentId(level),
      name: String(level.name || `Level ${levelIndex + 1}`).trim(),
      description: String(level.description || "").trim(),
      sessionCount: normalizedTopics.length,
      order: Number(level.order ?? levelIndex),
      topics: normalizedTopics,
    };
  });
  return {
    name: String(input.name || "").trim(),
    description: String(input.description || "").trim(),
    category: String(input.category || "General").trim() || "General",
    level: isCourseTierOrMixed(input.level) ? input.level : "beginner",
    totalSessions: normalizedLevels.reduce((sum: number, level: any) => sum + Number(level.topics?.length || 0), 0),
    levels: normalizedLevels,
    isActive: input.isActive !== false,
  };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireAdminApiAccess(req, "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  try {
    const body = normalizeCourse(await req.json());
    if (!body.name) return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    await dbConnect();
    // Read before write: the rename diff needs the names the course had, and
    // findByIdAndUpdate replaces the whole levels array.
    const previous: any = await Course.findById(params.id).lean();
    if (!previous) return NextResponse.json({ error: "Course not found" }, { status: 404 });
    const plan = planCourseRenames(previous, body);
    const course = await Course.findByIdAndUpdate(params.id, body, { new: true });
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    const renameSummary = await applyCourseRenames(course._id, String(previous.name || ""), plan);

    await recordActivity({
      actor: actorId,
      type: "course.updated",
      label: hasRenames(plan)
        ? `Updated course ${course.name} and renamed it across ${renameSummary.classrooms} class record${renameSummary.classrooms === 1 ? "" : "s"} and ${renameSummary.templates} homework template${renameSummary.templates === 1 ? "" : "s"}`
        : `Updated course ${course.name}`,
      entityType: "Course",
      entityId: params.id,
      metadata: {
        levels: body.levels.length,
        totalSessions: body.totalSessions,
        renamedCourse: plan.course || undefined,
        renamedTier: plan.tier || undefined,
        renamedLevels: plan.levels.length ? plan.levels : undefined,
        renamedTopics: plan.topics.length ? plan.topics : undefined,
        cascadedClassrooms: renameSummary.classrooms,
        cascadedTemplates: renameSummary.templates,
        cascadedStudents: renameSummary.students,
      },
    });
    return NextResponse.json({ ...course.toObject(), renameSummary });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not update course" }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await requireAdminApiAccess(req, "delete");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  await dbConnect();
  const course = await Course.findByIdAndDelete(params.id);
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  await recordActivity({
    actor: actorId,
    type: "course.deleted",
    label: `Deleted course ${course.name}`,
    entityType: "Course",
    entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
