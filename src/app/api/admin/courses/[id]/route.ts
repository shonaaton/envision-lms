import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { Course } from "@/models/Course";

export const dynamic = "force-dynamic";

function normalizeCourse(input: any) {
  const levels = Array.isArray(input.levels) ? input.levels : [];
  const normalizedLevels = levels.map((level: any, levelIndex: number) => {
    const topics = Array.isArray(level.topics) ? level.topics : [];
    const normalizedTopics = topics
      .filter((topic: any) => String(topic.name || "").trim())
      .map((topic: any, topicIndex: number) => ({
        name: String(topic.name || "").trim(),
        description: String(topic.description || "").trim(),
        sessionCount: 1,
        order: Number(topic.order ?? topicIndex),
      }));
    return {
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
    level: ["beginner", "intermediate", "advanced", "mixed"].includes(input.level) ? input.level : "beginner",
    totalSessions: normalizedLevels.reduce((sum: number, level: any) => sum + Number(level.topics?.length || 0), 0),
    levels: normalizedLevels,
    isActive: input.isActive !== false,
  };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  try {
    const body = normalizeCourse(await req.json());
    if (!body.name) return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    await dbConnect();
    const course = await Course.findByIdAndUpdate(params.id, body, { new: true });
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
    await recordActivity({
      actor: actorId,
      type: "course.updated",
      label: `Updated course ${course.name}`,
      entityType: "Course",
      entityId: params.id,
      metadata: { levels: body.levels.length, totalSessions: body.totalSessions },
    });
    return NextResponse.json(course);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not update course" }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
