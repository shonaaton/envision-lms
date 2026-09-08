import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { canAccessFeature } from "@/lib/featureAccess";
import { recordActivity } from "@/lib/activity";
import { normalizeTopicKey } from "@/lib/assignmentAutomation";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Course } from "@/models/Course";
import { isCourseTierOrMixed } from "@/lib/courseTiers";

export const dynamic = "force-dynamic";

// A course level is renamed by hand in /admin/courses, but every template keeps
// its own frozen copy of the course and level name - and assignmentAutomation
// matches a template to a classroom on those strings. Moving them one at a time
// through the JSON editor is how a level rename quietly stops auto-assignment,
// so the move is a single reviewed operation over a selection instead.
const MAX_IDS = 500;

async function canManageSession(session: any, permission = "edit") {
  const role = (session?.user as any)?.role;
  if (role === "instructor") return true;
  if (role === "admin" || role === "sub-admin") return canAccessFeature("homeworkTemplates", session.user as any, permission);
  return false;
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !(await canManageSession(session, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const ids = Array.from(new Set((Array.isArray(body.ids) ? body.ids : []).map((id: any) => String(id || "").trim()).filter(Boolean)));
    const courseId = String(body.course || "").trim();
    const levelName = String(body.levelName || "").trim();

    if (!ids.length) return NextResponse.json({ error: "Select at least one template to move." }, { status: 400 });
    if (ids.length > MAX_IDS) return NextResponse.json({ error: `Move at most ${MAX_IDS} templates at a time.` }, { status: 400 });
    if (!courseId) return NextResponse.json({ error: "Choose the course to move these templates into." }, { status: 400 });
    if (!levelName) return NextResponse.json({ error: "Choose the level to move these templates into." }, { status: 400 });

    await dbConnect();
    const course: any = await Course.findById(courseId).lean();
    if (!course) return NextResponse.json({ error: "That course no longer exists." }, { status: 400 });

    const targetLevel = (course.levels || []).find(
      (level: any) => String(level?.name || "").trim().toLowerCase() === levelName.toLowerCase()
    );
    // A level typed by hand is allowed - a course is often renamed before its
    // levels are rebuilt - but the caller is told, because a name that matches
    // no level on the course is also what a typo looks like.
    const levelExists = Boolean(targetLevel);
    const resolvedLevelName = String(targetLevel?.name || levelName).trim();
    const topicKeysOnLevel = new Set(
      (targetLevel?.topics || []).map((topic: any) => normalizeTopicKey(topic?.name)).filter(Boolean)
    );

    const filter: Record<string, any> = { _id: { $in: ids } };
    if (role === "instructor") filter.createdBy = (session.user as any).id;
    const templates = await AssignmentTemplate.find(filter).select("_id title topicName topicKey courseName levelName").lean();
    if (!templates.length) return NextResponse.json({ error: "None of the selected templates could be found." }, { status: 404 });

    const courseLevel = isCourseTierOrMixed(course.level) ? course.level : "";
    const linked: string[] = [];
    const needsReview: string[] = [];

    for (const template of templates) {
      const topicKey = String((template as any).topicKey || normalizeTopicKey((template as any).topicName) || "");
      const isLinked = levelExists && Boolean(topicKey) && topicKeysOnLevel.has(topicKey);
      (isLinked ? linked : needsReview).push(String(template._id));
    }

    await Promise.all([
      linked.length
        ? AssignmentTemplate.updateMany(
            { _id: { $in: linked } },
            {
              $set: {
                course: course._id,
                courseName: course.name,
                level: courseLevel,
                levelName: resolvedLevelName,
                linkStatus: "linked",
                updatedBy: (session.user as any).id,
              },
            }
          )
        : null,
      needsReview.length
        ? AssignmentTemplate.updateMany(
            { _id: { $in: needsReview } },
            {
              $set: {
                course: course._id,
                courseName: course.name,
                level: courseLevel,
                levelName: resolvedLevelName,
                linkStatus: "needs_review",
                updatedBy: (session.user as any).id,
              },
            }
          )
        : null,
    ]);

    await recordActivity({
      actor: (session.user as any).id,
      type: "homework.template.moved",
      label: `Moved ${templates.length} homework template${templates.length === 1 ? "" : "s"} to ${course.name} - ${resolvedLevelName}`,
      entityType: "AssignmentTemplate",
      metadata: {
        courseId: String(course._id),
        courseName: course.name,
        levelName: resolvedLevelName,
        levelExists,
        moved: templates.length,
        linked: linked.length,
        needsReview: needsReview.length,
        from: Array.from(new Set(templates.map((template: any) => `${template.courseName || "No course"} - ${template.levelName || "No level"}`))),
        source: "bulk_move",
      },
    });

    return NextResponse.json({
      ok: true,
      moved: templates.length,
      linked: linked.length,
      needsReview: needsReview.length,
      levelExists,
      courseName: course.name,
      levelName: resolvedLevelName,
      skipped: ids.length - templates.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not move these templates" }, { status: 400 });
  }
}
