import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { normalizeTopicKey, topicFromHomeworkFileName } from "@/lib/assignmentAutomation";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Course } from "@/models/Course";
import { PGN } from "@/models/PGN";

export const dynamic = "force-dynamic";

function canManage(role?: string) {
  return role === "admin" || role === "instructor";
}

function sourceName(pgn: any) {
  return String(pgn.sourceFileName || pgn.title || "").trim();
}

function looksLikeHomeworkPgn(pgn: any) {
  return /\b(hw|homework)\b/i.test(sourceName(pgn));
}

function groupByTopic(pgns: any[]) {
  const groups = new Map<string, { topicName: string; pgns: any[] }>();
  pgns.forEach((pgn) => {
    const topicName = topicFromHomeworkFileName(sourceName(pgn)) || pgn.title || "Homework";
    const topicKey = normalizeTopicKey(topicName);
    if (!topicKey) return;
    const current = groups.get(topicKey) || { topicName, pgns: [] as any[] };
    current.pgns.push(pgn);
    groups.set(topicKey, current);
  });
  return groups;
}

async function findCourseTopic(topicKey: string) {
  const courses = await Course.find({ isActive: { $ne: false } }).lean();
  const matches: any[] = [];
  courses.forEach((course: any) => {
    (course.levels || []).forEach((level: any) => {
      (level.topics || []).forEach((topic: any) => {
        if (normalizeTopicKey(topic.name) === topicKey) {
          matches.push({ course, level, topic });
        }
      });
    });
  });
  return matches;
}

function pgnActivity(topicName: string, pgns: any[]) {
  return {
    type: "study_pgn",
    title: `${topicName} PGN Study`,
    instructions: "Study the selected PGNs and solve the board tasks.",
    difficulty: "beginner",
    points: 1,
    timeLimitMinutes: 0,
    topic: topicName,
    source: { kind: "pgn_quiz", folder: pgns[0]?.folder || "", maxAttempts: 1 },
    items: pgns.map((pgn: any) => ({
      id: String(pgn._id),
      title: pgn.title,
      pgnTitle: pgn.title,
      pgnSourceId: String(pgn._id),
      pgn: pgn.pgn,
      source: { kind: "pgn", folder: pgn.folder || "Unfiled" },
      points: 1,
    })),
  };
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !canManage(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.pgnIds) ? body.pgnIds.map(String).filter(Boolean) : [];
  const filter: Record<string, any> = ids.length ? { _id: { $in: ids } } : {};
  if (role !== "admin") filter.uploadedBy = (session.user as any).id;
  const pgns = (await PGN.find(filter).sort({ sourceFileName: 1, title: 1 }).lean()).filter(looksLikeHomeworkPgn);
  const groups = groupByTopic(pgns);
  const report: any[] = [];

  for (const [topicKey, group] of groups) {
    const matches = await findCourseTopic(topicKey);
    const link = matches.length === 1 ? matches[0] : null;
    const linkStatus = matches.length === 1 ? "linked" : matches.length > 1 ? "needs_review" : "unlinked";
    const payload = {
      title: `${group.topicName} - HW`,
      description: `Auto-created from ${group.pgns.length} homework PGN${group.pgns.length === 1 ? "" : "s"}.`,
      topicName: group.topicName,
      topicKey,
      course: link?.course?._id,
      courseName: link?.course?.name || "",
      level: link?.course?.level || "",
      levelName: link?.level?.name || "",
      activities: [pgnActivity(group.topicName, group.pgns)],
      puzzles: [],
      numberOfAttempts: 1,
      timeLimitMinutes: 0,
      targetMode: "classroom_batches",
      duePolicy: { type: "before_next_class", minutesBefore: 1, noNextClassBehavior: "assign_without_due" },
      autoAssign: true,
      isActive: true,
      linkStatus,
      source: {
        kind: "pgn_import",
        pgnIds: group.pgns.map((pgn: any) => pgn._id),
        fileNames: group.pgns.map(sourceName).filter(Boolean),
        importBatchId: String(body.importBatchId || new Date().toISOString()),
      },
      updatedBy: (session.user as any).id,
    };
    const existing = await AssignmentTemplate.findOne({ topicKey, "source.kind": "pgn_import" });
    const doc = existing
      ? await AssignmentTemplate.findByIdAndUpdate(existing._id, payload, { new: true })
      : await AssignmentTemplate.create({ ...payload, createdBy: (session.user as any).id });
    report.push({ topicName: group.topicName, topicKey, templateId: doc?._id, pgnCount: group.pgns.length, linkStatus, courseName: payload.courseName, levelName: payload.levelName });
  }

  return NextResponse.json({ imported: report.length, skipped: pgns.length === 0 ? "No PGNs with HW/Homework in the name were found." : undefined, report });
}
