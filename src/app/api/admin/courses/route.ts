import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { Course } from "@/models/Course";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { applyCourseRenames, hasRenames, planCourseRenames } from "@/lib/courseRenames";
import { isCourseTierOrMixed } from "@/lib/courseTiers";

export const dynamic = "force-dynamic";

// See the note in [id]/route.ts - the subdocument id is what makes a rename
// distinguishable from a delete plus an add on the next save.
function keepSubdocumentId(value: any) {
  const id = String(value?._id || "").trim();
  return Types.ObjectId.isValid(id) ? { _id: id } : {};
}

function normalizeCourse(input: any, actorId?: string) {
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
  const totalSessions = normalizedLevels.reduce((sum: number, level: any) => sum + Number(level.topics?.length || 0), 0);
  return {
    name: String(input.name || "").trim(),
    description: String(input.description || "").trim(),
    category: String(input.category || "General").trim() || "General",
    level: isCourseTierOrMixed(input.level) ? input.level : "beginner",
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
        sessionCount: 1,
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
      sessionCount: topics.length,
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
    totalSessions: finalizedLevels.reduce((sum: number, level: any) => sum + Number(level.topics?.length || 0), 0),
  };
}

export async function GET(req: Request) {
  const session = await requireAdminApiAccess(req, "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const filter: any = {};
  if (q) filter.$text = { $search: q };
  const courses = await Course.find(filter).sort({ isActive: -1, createdAt: -1 }).limit(200).lean();
  return NextResponse.json(courses);
}

export async function POST(req: Request) {
  const session = await requireAdminApiAccess(req, "create");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  try {
    const body = normalizeCourse(await req.json(), actorId);
    if (!body.name) return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    await dbConnect();
    const existingCourse = await Course.findOne({ name: new RegExp(`^${body.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (existingCourse) {
      // Snapshot before set() - the rename diff compares against the names the
      // course had, and set() mutates the document in place.
      const previous = existingCourse.toObject();
      const mergedBody = mergeCourseData(existingCourse, body);
      const plan = planCourseRenames(previous, mergedBody);
      existingCourse.set(mergedBody);
      await existingCourse.save();
      const renameSummary = await applyCourseRenames(existingCourse._id, String(previous.name || ""), plan);
      await recordActivity({
        actor: actorId,
        type: "course.updated",
        label: hasRenames(plan)
          ? `Merged course ${existingCourse.name} and renamed it across ${renameSummary.classrooms} class record${renameSummary.classrooms === 1 ? "" : "s"} and ${renameSummary.templates} homework template${renameSummary.templates === 1 ? "" : "s"}`
          : `Merged course ${existingCourse.name}`,
        entityType: "Course",
        entityId: existingCourse._id.toString(),
        metadata: {
          levels: mergedBody.levels.length,
          totalSessions: mergedBody.totalSessions,
          renamedCourse: plan.course || undefined,
          renamedLevels: plan.levels.length ? plan.levels : undefined,
          renamedTopics: plan.topics.length ? plan.topics : undefined,
          cascadedClassrooms: renameSummary.classrooms,
          cascadedTemplates: renameSummary.templates,
          cascadedStudents: renameSummary.students,
        },
      });
      return NextResponse.json({ ...existingCourse.toObject(), renameSummary });
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
