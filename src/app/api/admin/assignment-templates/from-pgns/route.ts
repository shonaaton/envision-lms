import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { normalizeTopicKey, topicFromHomeworkFileName } from "@/lib/assignmentAutomation";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Course } from "@/models/Course";
import { PGN } from "@/models/PGN";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bundledFenMcqSources = [
  {
    filePath: "scripts/import-data/Notation-Writing-MCQ.pgn",
    title: "Notation Writing HW",
    topicName: "Notation Writing",
    importBatchId: "notation-writing-fen-mcq-hw",
  },
  {
    filePath: "scripts/import-data/En-Passant-Day-1-MCQ.pgn",
    title: "En-Passant day 1 HW",
    topicName: "En-Passant day 1",
    importBatchId: "en-passant-day-1-fen-mcq-hw",
  },
];

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

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function header(gameText: string, name: string) {
  return gameText.match(new RegExp(`\\[${name}\\s+"([^"]*)"\\]`))?.[1] || "";
}

function commentBlocks(gameText: string) {
  return [...gameText.matchAll(/\{([\s\S]*?)\}/g)].map((match) => match[1].trim());
}

function parseQuestionComment(comment: string) {
  const mcqIndex = comment.search(/MCQ\s*:/i);
  if (mcqIndex < 0) throw new Error(`Missing MCQ marker in comment: ${comment.slice(0, 80)}`);
  const mcqText = comment.slice(mcqIndex).replace(/^MCQ\s*:\s*/i, "");
  const optionStart = mcqText.search(/\n\s*A\)/i);
  if (optionStart < 0) throw new Error(`Missing options in comment: ${comment.slice(0, 80)}`);
  const question = cleanText(mcqText.slice(0, optionStart));
  const optionsText = mcqText.slice(optionStart);
  const options: Record<string, string> = {};
  for (const match of optionsText.matchAll(/^\s*([A-D])\)\s*(.+)$/gim)) {
    options[match[1].toUpperCase()] = cleanText(match[2]);
  }
  for (const id of ["A", "B", "C", "D"]) {
    if (!options[id]) throw new Error(`Missing option ${id} for question: ${question}`);
  }
  return { question, options };
}

function parseAnswer(comment: string) {
  const match = comment.match(/Correct\s+Answer\s*:\s*([A-D])(?:\)|\.|\b)/i);
  if (!match) throw new Error(`Missing correct answer in comment: ${comment.slice(0, 80)}`);
  return match[1].toUpperCase();
}

function parseFenMcqPgn(filePath: string) {
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const pgn = fs.readFileSync(resolvedPath, "utf8");
  return pgn
    .split(/\n\s*(?=\[Event\s+")/g)
    .map((gameText, index) => {
      const fen = header(gameText, "FEN");
      const title = header(gameText, "ChapterName") || `Question ${index + 1}`;
      const comments = commentBlocks(gameText);
      if (!fen || comments.length < 2) throw new Error(`Could not parse game ${index + 1} in ${filePath}`);
      const parsed = parseQuestionComment(comments[0]);
      const answer = parseAnswer(comments.at(-1) || "");
      return {
        id: `q${index + 1}`,
        title,
        question: parsed.question,
        positionFen: fen,
        options: ["A", "B", "C", "D"].map((id) => ({ id, text: parsed.options[id], correct: id === answer })),
        multipleCorrect: false,
        correctAnswers: [["A", "B", "C", "D"].indexOf(answer)],
        explanation: (comments.at(-1) || "").replace(/Correct\s+Answer\s*:\s*/i, "").trim(),
        points: 1,
      };
    });
}

async function importBundledFenMcqTemplates(userId: string) {
  const report: any[] = [];
  for (const source of bundledFenMcqSources) {
    const items = parseFenMcqPgn(source.filePath);
    const topicKey = normalizeTopicKey(source.topicName);
    const matches = await findCourseTopic(topicKey);
    const link = matches.length === 1 ? matches[0] : null;
    const linkStatus = matches.length === 1 ? "linked" : matches.length > 1 ? "needs_review" : "unlinked";
    const topicName = link?.topic?.name || source.topicName;
    const payload = {
      title: source.title,
      description: `FEN-based MCQ homework template for ${topicName}.`,
      instructions: "Look at the board and choose the correct answer.",
      topicName,
      topicKey: normalizeTopicKey(topicName),
      course: link?.course?._id,
      courseName: link?.course?.name || "",
      level: link?.course?.level || "beginner",
      levelName: link?.level?.name || "",
      activities: [
        {
          type: "quiz",
          title: source.title,
          instructions: "Look at the board and choose the correct answer.",
          difficulty: "beginner",
          points: 1,
          timeLimitMinutes: 0,
          topic: topicName,
          source: { kind: "fen_mcq", importBatchId: source.importBatchId },
          items,
        },
      ],
      puzzles: [],
      numberOfAttempts: 1,
      timeLimitMinutes: 0,
      targetMode: "classroom_batches",
      duePolicy: { type: "before_next_class", minutesBefore: 1, noNextClassBehavior: "assign_without_due" },
      autoAssign: true,
      isActive: true,
      linkStatus,
      source: {
        kind: "mcq_import",
        pgnIds: [],
        fileNames: [path.basename(source.filePath)],
        importBatchId: source.importBatchId,
      },
      updatedBy: userId,
    };
    const existing = await AssignmentTemplate.findOne({ topicKey: payload.topicKey, "source.importBatchId": source.importBatchId, isActive: { $ne: false } });
    const doc = existing
      ? await AssignmentTemplate.findByIdAndUpdate(existing._id, payload, { new: true })
      : await AssignmentTemplate.create({ ...payload, createdBy: userId });
    report.push({ topicName, topicKey: payload.topicKey, templateId: doc?._id, questionCount: items.length, linkStatus, courseName: payload.courseName, levelName: payload.levelName, source: "bundled_fen_mcq" });
  }
  return report;
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
    const existing = await AssignmentTemplate.findOne({ topicKey, "source.kind": "pgn_import", isActive: { $ne: false } });
    const doc = existing
      ? await AssignmentTemplate.findByIdAndUpdate(existing._id, payload, { new: true })
      : await AssignmentTemplate.create({ ...payload, createdBy: (session.user as any).id });
    report.push({ topicName: group.topicName, topicKey, templateId: doc?._id, pgnCount: group.pgns.length, linkStatus, courseName: payload.courseName, levelName: payload.levelName });
  }
  const bundledMcqReport = body.includeBundledFenMcq === false ? [] : await importBundledFenMcqTemplates((session.user as any).id);

  return NextResponse.json({
    imported: report.length + bundledMcqReport.length,
    pgnImported: report.length,
    bundledFenMcqImported: bundledMcqReport.length,
    skipped: pgns.length === 0 && bundledMcqReport.length === 0 ? "No PGNs with HW/Homework in the name were found." : undefined,
    report: [...report, ...bundledMcqReport],
  });
}
