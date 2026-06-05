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

function normalizeKey(value?: string) {
  return String(value || "").trim().toLowerCase();
}

function mergeCourseData(existingCourse: any, incomingCourse: any) {
  const mergedLevels = Array.isArray(existingCourse.levels) ? [...existingCourse.levels.map((level: any) => ({
    ...level.toObject?.() || level,
    topics: (level.topics || []).map((topic: any) => topic.toObject?.() || topic),
  }))] : [];

  for (const incomingLevel of incomingCourse.levels || []) {
    const levelIndex = mergedLevels.findIndex((level: any) => normalizeKey(level.name) === normalizeKey(incomingLevel.name));
    if (levelIndex === -1) {
      mergedLevels.push({
        ...incomingLevel,
        topics: [...(incomingLevel.topics || [])],
      });
      continue;
    }
    const mergedTopics = Array.isArray(mergedLevels[levelIndex].topics) ? [...mergedLevels[levelIndex].topics] : [];
    for (const incomingTopic of incomingLevel.topics || []) {
      const topicIndex = mergedTopics.findIndex((topic: any) => normalizeKey(topic.name) === normalizeKey(incomingTopic.name));
      if (topicIndex === -1) {
        mergedTopics.push(incomingTopic);
        continue;
      }
      mergedTopics[topicIndex] = {
        ...mergedTopics[topicIndex],
        ...incomingTopic,
        name: incomingTopic.name || mergedTopics[topicIndex].name,
        description: incomingTopic.description || mergedTopics[topicIndex].description,
        sessionCount: Math.max(Number(incomingTopic.sessionCount || 0), Number(mergedTopics[topicIndex].sessionCount || 0), 1),
        order: topicIndex,
      };
    }
    mergedLevels[levelIndex] = {
      ...mergedLevels[levelIndex],
      ...incomingLevel,
      topics: mergedTopics.map((topic: any, index: number) => ({ ...topic, order: index })),
    };
  }

  const finalizedLevels = mergedLevels.map((level: any, index: number) => {
    const topics = (level.topics || []).map((topic: any, topicIndex: number) => ({ ...topic, order: topicIndex }));
    return {
      ...level,
      order: index,
      topics,
      sessionCount: topics.reduce((sum: number, topic: any) => sum + Number(topic.sessionCount || 0), 0),
    };
  });

  return {
    ...incomingCourse,
    name: incomingCourse.name || existingCourse.name,
    description: incomingCourse.description || existingCourse.description,
    category: incomingCourse.category || existingCourse.category,
    level: incomingCourse.level || existingCourse.level,
    isActive: incomingCourse.isActive ?? existingCourse.isActive,
    createdBy: existingCourse.createdBy || incomingCourse.createdBy,
    levels: finalizedLevels,
    totalSessions: finalizedLevels.reduce((sum: number, level: any) => sum + Number(level.sessionCount || 0), 0),
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
    const existingCourse = await Course.findOne({ name: new RegExp(`^${body.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (existingCourse) {
      const mergedBody = mergeCourseData(existingCourse, body);
      existingCourse.set(mergedBody);
      await existingCourse.save();
      await recordActivity({
        actor: actorId,
        type: "course.updated",
        label: `Merged course ${existingCourse.name}`,
        entityType: "Course",
        entityId: existingCourse._id.toString(),
        metadata: { levels: mergedBody.levels.length, totalSessions: mergedBody.totalSessions },
      });
      return NextResponse.json(existingCourse);
    }
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
