import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { Course } from "@/models/Course";

export const dynamic = "force-dynamic";

function normalizeCourse(input: any, actorId?: string) {
  const levels = Array.isArray(input.levels) ? input.levels : [];
  const normalizedLevels = levels.map((level: any, levelIndex: number) => {
    const topics = Array.isArray(level.topics) ? level.topics : [];
    const normalizedTopics = topics
      .filter((topic: any) => String(topic.name || "").trim())
      .map((topic: any, topicIndex: number) => ({
        name: String(topic.name || "").trim(),
        description: String(topic.description || "").trim(),
        sessionCount: Math.max(1, Number(topic.sessionCount || 1)),
        order: Number(topic.order ?? topicIndex),
      }));
    const topicSessions = normalizedTopics.reduce((sum: number, topic: any) => sum + Number(topic.sessionCount || 0), 0);
    return {
      name: String(level.name || `Level ${levelIndex + 1}`).trim(),
      description: String(level.description || "").trim(),
      sessionCount: Math.max(1, Number(level.sessionCount || topicSessions || 1)),
      order: Number(level.order ?? levelIndex),
      topics: normalizedTopics,
    };
  });
  const totalSessions = normalizedLevels.reduce((sum: number, level: any) => sum + Number(level.sessionCount || 0), 0);
  return {
    name: String(input.name || "").trim(),
    description: String(input.description || "").trim(),
    category: String(input.category || "General").trim() || "General",
    level: ["beginner", "intermediate", "advanced", "mixed"].includes(input.level) ? input.level : "beginner",
    totalSessions,
    levels: normalizedLevels,
    isActive: input.isActive !== false,
    ...(actorId ? { createdBy: actorId } : {}),
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const filter: any = {};
  if (q) filter.$text = { $search: q };
  const courses = await Course.find(filter).sort({ isActive: -1, createdAt: -1 }).limit(200).lean();
  return NextResponse.json(courses);
}

export async function POST(req: Request) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  try {
    const body = normalizeCourse(await req.json(), actorId);
    if (!body.name) return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    await dbConnect();
    const course = await Course.create(body);
    await recordActivity({
      actor: actorId,
      type: "course.created",
      label: `Created course ${course.name}`,
      entityType: "Course",
      entityId: course._id.toString(),
      metadata: { levels: body.levels.length, totalSessions: body.totalSessions },
    });
    return NextResponse.json(course);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not create course" }, { status: 400 });
  }
}
