import "server-only";

import { dbConnect } from "@/lib/db";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { isCourseTier } from "@/lib/courseTiers";
import { reportTier } from "@/lib/feedback/feedbackQuestions";
import { judgePuzzleMove, parsePgnPuzzle, puzzleFenAt } from "@/lib/pgnPuzzle";
import { cleanPositionQuestion, positionQuestionFor } from "@/lib/exams/examQuestions";
import { ExamBankError, drawPaper, extractBank, pickReplacement, templateMatchesLevel, type ExamBank } from "@/lib/exams/examBank";
import {
  CERTIFICATE_MAX_ATTEMPTS,
  certificateNumberFor,
  certificatePayload,
  nextCertificateAttemptAt,
  postCertificateWebhook,
} from "@/lib/exams/examCertificate";
import {
  notifyCertificateIssued,
  notifyExamAssigned,
  notifyExamReminder,
  notifyExamResult,
  notifyExamStaff,
} from "@/lib/exams/examNotifications";
import {
  EXAM_LEVELS,
  HEARTBEAT_STALE_MS,
  MCQ_COUNT,
  POSITION_COUNT,
  SUBMIT_REASON_LABELS,
  availablePositionMarks,
  dueReminder,
  examEndsAt,
  examLevelLabel,
  examReminderTimes,
  examWindowEnd,
  isExamLevel,
  levelNumberFromName,
  mcqMarks,
  positionMarks,
  scoreExam,
  scorePercent,
  submitReasonFor,
  violationOutcome,
  type SubmitReason,
  type ViolationType,
} from "@/lib/exams/examRules";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { Course } from "@/models/Course";
import { ExamAssignment, ExamClassroomRun, ExamPaper } from "@/models/Exam";
import { User } from "@/models/User";

/**
 * Exam Center: papers, assignments, the sitting itself, the sweep and the
 * certificate queue. Every answer is checked here; the browser only ever
 * receives `serializeForStudent`.
 *
 * Reached from instrumentation.ts through the sweep: no static `crypto`/`fs`
 * imports, and nothing that reaches studentPause or fees.
 */

export class ExamError extends Error {
  constructor(message: string, public status = 400, public code = "") {
    super(message);
  }
}

const idOf = (value: any) => String(value?._id ?? value ?? "");

function assertLevel(tier: unknown, levelNumber: unknown) {
  if (!isExamLevel(tier, levelNumber)) throw new ExamError("Exams exist for Beginner and Intermediate, Levels 1 to 3.");
  return { tier: String(tier), levelNumber: Number(levelNumber) };
}

/* ------------------------------------------------------------- the bank */

async function loadTemplatesWithTier() {
  const templates: any[] = await AssignmentTemplate.find({ isActive: { $ne: false }, linkStatus: { $ne: "unlinked" } })
    .select("title topicName levelName level course activities")
    .lean();
  const courseIds = Array.from(new Set(templates.filter((template) => !isCourseTier(template.level) && template.course).map((template) => idOf(template.course))));
  const courses: any[] = courseIds.length ? await Course.find({ _id: { $in: courseIds } }).select("level").lean() : [];
  const courseTier = new Map(courses.map((course) => [idOf(course), String(course.level || "")]));
  return templates.map((template) => ({
    ...template,
    tier: isCourseTier(template.level) ? template.level : courseTier.get(idOf(template.course)) || "",
  }));
}

async function loadLevelBank(tier: string, levelNumber: number): Promise<ExamBank> {
  const templates = await loadTemplatesWithTier();
  return extractBank(templates.filter((template) => templateMatchesLevel(template, tier, levelNumber)));
}

/** How many usable questions each level's homework holds. */
export async function examBankCounts() {
  await dbConnect();
  const templates = await loadTemplatesWithTier();
  return EXAM_LEVELS.map(({ tier, levelNumber }) => {
    const matching = templates.filter((template) => templateMatchesLevel(template, tier, levelNumber));
    const bank = extractBank(matching);
    return { tier, levelNumber, templates: matching.length, mcqs: bank.mcqs.length, positions: bank.positions.length };
  });
}

/* ------------------------------------------------------------- papers */

function paperSlots<T>(items: T[], prefix: string) {
  return items.map((item, index) => ({ ...item, id: `${prefix}${index + 1}` }));
}

export function serializePaperForStaff(paper: any) {
  if (!paper) return null;
  return {
    id: idOf(paper),
    tier: paper.tier,
    levelNumber: paper.levelNumber,
    levelLabel: examLevelLabel(paper.tier, paper.levelNumber),
    status: paper.status,
    version: paper.version || 1,
    publishedAt: paper.publishedAt || null,
    updatedAt: paper.updatedAt || null,
    mcqs: (paper.mcqs || []).map((mcq: any) => ({
      id: mcq.id,
      question: mcq.question,
      positionFen: mcq.positionFen || "",
      options: (mcq.options || []).map((option: any) => ({ id: option.id, text: option.text, correct: Boolean(option.correct) })),
      explanation: mcq.explanation || "",
      topicName: mcq.topicName || "",
      sourceTitle: mcq.source?.templateTitle || "",
    })),
    positions: (paper.positions || []).map((position: any) => ({
      id: position.id,
      topicName: position.topicName || "",
      title: position.title || "",
      question: positionQuestionFor(position),
      /** What the question falls back to if the admin clears their own wording. */
      autoQuestion: positionQuestionFor({ ...position, question: "" }),
      startFen: position.startFen,
      solution: position.solution || [],
      studentColor: position.studentColor,
      sourceTitle: position.source?.templateTitle || "",
    })),
  };
}

export async function getPaper(tier: unknown, levelNumber: unknown) {
  const level = assertLevel(tier, levelNumber);
  await dbConnect();
  return serializePaperForStaff(await ExamPaper.findOne(level).lean());
}

export async function listPapers() {
  await dbConnect();
  const papers: any[] = await ExamPaper.find({}).select("tier levelNumber status version publishedAt updatedAt").lean();
  return EXAM_LEVELS.map(({ tier, levelNumber }) => {
    const paper = papers.find((item) => item.tier === tier && item.levelNumber === levelNumber);
    return {
      tier,
      levelNumber,
      levelLabel: examLevelLabel(tier, levelNumber),
      status: paper?.status || "none",
      version: paper?.version || 0,
      publishedAt: paper?.publishedAt || null,
      updatedAt: paper?.updatedAt || null,
    };
  });
}

function bankError(error: unknown): never {
  if (error instanceof ExamBankError) throw new ExamError(error.message, 409);
  throw error;
}

/** Draws a fresh paper for the level (or redraws it). A published paper stays published at the next version. */
export async function generatePaper(tier: unknown, levelNumber: unknown, actorId: string) {
  const level = assertLevel(tier, levelNumber);
  await dbConnect();
  const bank = await loadLevelBank(level.tier, level.levelNumber);
  let drawn: ReturnType<typeof drawPaper>;
  try {
    drawn = drawPaper(bank);
  } catch (error) {
    bankError(error);
  }
  const existing: any = await ExamPaper.findOne(level).select("status").lean();
  const paper = await ExamPaper.findOneAndUpdate(
    level,
    {
      $set: { mcqs: paperSlots(drawn.mcqs, "m"), positions: paperSlots(drawn.positions, "p"), updatedBy: actorId },
      $setOnInsert: { status: "draft", generatedBy: actorId },
      ...(existing?.status === "published" ? { $inc: { version: 1 } } : {}),
    },
    { upsert: true, new: true }
  ).lean();
  return serializePaperForStaff(paper);
}

/** Puts a different bank question in one slot, preferring the same topic. */
export async function replacePaperQuestion(tier: unknown, levelNumber: unknown, slotId: string, actorId: string) {
  const level = assertLevel(tier, levelNumber);
  await dbConnect();
  const paper: any = await ExamPaper.findOne(level).lean();
  if (!paper) throw new ExamError("Generate this level's paper first.", 404);
  const kind = slotId.startsWith("m") ? "mcqs" : slotId.startsWith("p") ? "positions" : "";
  if (!kind) throw new ExamError("Unknown question slot.");
  const slots: any[] = paper[kind] || [];
  const index = slots.findIndex((slot) => slot.id === slotId);
  if (index < 0) throw new ExamError("That question is not on this paper.", 404);
  const bank = await loadLevelBank(level.tier, level.levelNumber);
  const replacement = pickReplacement<any>(bank[kind], slots, slots[index]);
  if (!replacement) {
    throw new ExamError(`This level's homework has no other ${kind === "mcqs" ? "MCQ" : "position"} that is not already on the paper.`, 409);
  }
  const updated = await ExamPaper.findOneAndUpdate(
    { _id: paper._id, [`${kind}.${index}.id`]: slotId },
    {
      $set: { [`${kind}.${index}`]: { ...replacement, id: slotId }, updatedBy: actorId },
      ...(paper.status === "published" ? { $inc: { version: 1 } } : {}),
    },
    { new: true }
  ).lean();
  if (!updated) throw new ExamError("The paper changed while you were replacing. Reload and try again.", 409);
  return serializePaperForStaff(updated);
}

/**
 * Rewrites the question line above one position. An empty question goes back
 * to the automatic one (the PGN's own comment, or the generated line).
 */
export async function editPositionQuestion(tier: unknown, levelNumber: unknown, slotId: string, question: unknown, actorId: string) {
  const level = assertLevel(tier, levelNumber);
  await dbConnect();
  const paper: any = await ExamPaper.findOne(level).select("status positions.id").lean();
  if (!paper) throw new ExamError("Generate this level's paper first.", 404);
  const index = (paper.positions || []).findIndex((position: any) => position.id === slotId);
  if (index < 0) throw new ExamError("That position is not on this paper.", 404);
  const updated = await ExamPaper.findOneAndUpdate(
    { _id: paper._id, [`positions.${index}.id`]: slotId },
    {
      $set: { [`positions.${index}.question`]: cleanPositionQuestion(question), updatedBy: actorId },
      ...(paper.status === "published" ? { $inc: { version: 1 } } : {}),
    },
    { new: true }
  ).lean();
  if (!updated) throw new ExamError("The paper changed while you were editing. Reload and try again.", 409);
  return serializePaperForStaff(updated);
}

export async function publishPaper(tier: unknown, levelNumber: unknown, actorId: string) {
  const level = assertLevel(tier, levelNumber);
  await dbConnect();
  const paper: any = await ExamPaper.findOne(level).lean();
  if (!paper) throw new ExamError("Generate this level's paper first.", 404);
  if ((paper.mcqs || []).length !== MCQ_COUNT || (paper.positions || []).length !== POSITION_COUNT) {
    throw new ExamError(`A paper needs ${MCQ_COUNT} MCQs and ${POSITION_COUNT} positions.`, 409);
  }
  if (paper.status === "published") return serializePaperForStaff(paper);
  const updated = await ExamPaper.findOneAndUpdate(
    { _id: paper._id },
    { $set: { status: "published", publishedAt: new Date(), publishedBy: actorId } },
    { new: true }
  ).lean();
  return serializePaperForStaff(updated);
}

/* ------------------------------------------------------------- assigning */

type AssignResult = { assigned: number; skipped: { student: string; name?: string; reason: string }[] };

export async function assignExam(input: {
  studentIds: string[];
  tier: unknown;
  levelNumber: unknown;
  source: "manual" | "auto_completion";
  actorId?: string;
  classroomId?: string;
  now?: Date;
}): Promise<AssignResult> {
  const level = assertLevel(input.tier, input.levelNumber);
  await dbConnect();
  const paper: any = await ExamPaper.findOne({ ...level, status: "published" }).lean();
  if (!paper) throw new ExamError(`Publish the ${examLevelLabel(level.tier, level.levelNumber)} paper before assigning it.`, 409);

  const ids = Array.from(new Set(input.studentIds.map(String).filter(Boolean)));
  const students: any[] = await User.find({ _id: { $in: ids } })
    .select("_id name role isActive accountStatus email phone countryCode parentName parentEmail")
    .lean();
  const byId = new Map(students.map((student) => [idOf(student), student]));
  const result: AssignResult = { assigned: 0, skipped: [] };
  const created: any[] = [];
  const now = input.now || new Date();
  const availableUntil = examWindowEnd(now);
  const { threeDayAt, lastDayAt } = examReminderTimes(availableUntil);

  for (const id of ids) {
    const student = byId.get(id);
    if (!student || student.role !== "student") {
      result.skipped.push({ student: id, reason: "Not a student account" });
      continue;
    }
    if (student.isActive === false || student.accountStatus === "demo") {
      result.skipped.push({ student: id, name: student.name, reason: student.isActive === false ? "Account is inactive" : "Demo account" });
      continue;
    }
    try {
      const doc = await ExamAssignment.create({
        student: student._id,
        ...level,
        paper: paper._id,
        paperVersion: paper.version || 1,
        mcqs: paper.mcqs,
        positions: paper.positions,
        source: input.source,
        classroom: input.classroomId || undefined,
        assignedBy: input.actorId || undefined,
        assignedAt: now,
        availableUntil,
        status: "assigned",
        openKey: `${id}:${level.tier}:${level.levelNumber}`,
        autoKey: input.source === "auto_completion" && input.classroomId ? `${input.classroomId}:${id}` : undefined,
        reminders: { threeDayAt, lastDayAt },
      });
      created.push({ ...doc.toObject(), student });
      result.assigned += 1;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      result.skipped.push({
        student: id,
        name: student.name,
        reason: String(error?.message || "").includes("autoKey") ? "Already assigned from this classroom" : "Already has this exam open",
      });
    }
  }

  for (let index = 0; index < created.length; index += 5) {
    const results = await Promise.allSettled(created.slice(index, index + 5).map((assignment) => notifyExamAssigned(assignment)));
    results.forEach((outcome) => {
      if (outcome.status === "rejected") console.error("[exams] assignment notice failed", outcome.reason);
    });
  }
  return result;
}

function exitedIds(classroom: any) {
  return new Set((classroom?.studentExits || []).map((exit: any) => idOf(exit.student)));
}

/** Students to assign for a manual target: chosen students, a batch, or a classroom's current roster. */
export async function resolveAssignTargets(input: { studentIds?: string[]; batchId?: string; classroomId?: string }) {
  await dbConnect();
  const ids = new Set((input.studentIds || []).map(String));
  if (input.batchId) {
    const batch: any = await Batch.findById(input.batchId).select("students").lean();
    if (!batch) throw new ExamError("Batch not found.", 404);
    (batch.students || []).forEach((student: any) => ids.add(idOf(student)));
  }
  if (input.classroomId) {
    const classroom: any = await Classroom.findById(input.classroomId).select("students studentExits").lean();
    if (!classroom) throw new ExamError("Classroom not found.", 404);
    const exited = exitedIds(classroom);
    (classroom.students || []).map(idOf).filter((id: string) => !exited.has(id)).forEach((id: string) => ids.add(id));
  }
  return Array.from(ids);
}

export async function cancelExam(id: string, actorId: string) {
  await dbConnect();
  const updated = await ExamAssignment.findOneAndUpdate(
    { _id: id, status: "assigned" },
    { $set: { status: "cancelled", cancelledAt: new Date(), cancelledBy: actorId }, $unset: { openKey: 1 } },
    { new: true }
  ).lean();
  if (!updated) throw new ExamError("Only an exam that has not been started can be cancelled.", 409);
  return { ok: true };
}

/* ------------------------------------------------------------- the sitting */

function progressFor(doc: any, questionId: string) {
  return (doc.positionProgress || []).find((progress: any) => progress.questionId === questionId) || null;
}

function puzzleFor(position: any) {
  return parsePgnPuzzle(position.pgn);
}

function summary(doc: any, now: Date) {
  return {
    id: idOf(doc),
    tier: doc.tier,
    levelNumber: doc.levelNumber,
    levelLabel: examLevelLabel(doc.tier, doc.levelNumber),
    status: doc.status,
    assignedAt: doc.assignedAt,
    availableUntil: doc.availableUntil,
    startedAt: doc.startedAt || null,
    endsAt: doc.endsAt || null,
    submittedAt: doc.submittedAt || null,
    submitReason: doc.submitReason || null,
    submitReasonLabel: doc.submitReason ? SUBMIT_REASON_LABELS[doc.submitReason as SubmitReason] : null,
    serverNow: now,
    warnings: (doc.violations || []).filter((violation: any) => violation.type !== "app_closed").length,
    score: doc.status === "submitted" ? doc.score || null : null,
    certificate: doc.status === "submitted" ? { status: doc.certificate?.status || "none", url: doc.certificate?.url || "", number: doc.certificateNumber || "" } : null,
    counts: { mcqs: (doc.mcqs || []).length, positions: (doc.positions || []).length },
  };
}

/** The only shape in which an exam reaches a student: no right answers, no solutions. */
export function serializeForStudent(doc: any, now = new Date()) {
  const base = summary(doc, now);
  if (doc.status === "in_progress") {
    return {
      ...base,
      mcqs: (doc.mcqs || []).map((mcq: any) => {
        const answer = (doc.mcqAnswers || []).find((item: any) => item.questionId === mcq.id);
        return {
          id: mcq.id,
          question: mcq.question,
          positionFen: mcq.positionFen || "",
          topicName: mcq.topicName || "",
          options: (mcq.options || []).map((option: any) => ({ id: option.id, text: option.text })),
          selected: answer?.selected || null,
        };
      }),
      positions: (doc.positions || []).map((position: any) => {
        const progress = progressFor(doc, position.id) || {};
        const puzzle = puzzleFor(position);
        const ply = Number(progress.ply || 0);
        const hint = !progress.solved && progress.hintPly === ply && puzzle.moves[ply] ? puzzle.moves[ply] : null;
        return {
          id: position.id,
          topicName: position.topicName || "",
          question: positionQuestionFor(position),
          fen: puzzleFenAt(puzzle, ply),
          orientation: position.studentColor || "white",
          wrongMoves: Number(progress.wrongMoves || 0),
          hintsUsed: Number(progress.hintsUsed || 0),
          solved: Boolean(progress.solved),
          available: availablePositionMarks(progress),
          marks: Number(progress.marks || 0),
          hint: hint ? { san: hint.san, from: hint.from, to: hint.to } : null,
        };
      }),
    };
  }
  if (doc.status === "submitted") {
    return {
      ...base,
      result: {
        mcqs: (doc.mcqs || []).map((mcq: any) => {
          const answer = (doc.mcqAnswers || []).find((item: any) => item.questionId === mcq.id);
          return { id: mcq.id, topicName: mcq.topicName || "", answered: Boolean(answer), correct: Boolean(answer?.correct), marks: answer ? mcqMarks(Boolean(answer.correct)) : 0 };
        }),
        positions: (doc.positions || []).map((position: any) => {
          const progress = progressFor(doc, position.id) || {};
          return {
            id: position.id,
            topicName: position.topicName || "",
            solved: Boolean(progress.solved),
            wrongMoves: Number(progress.wrongMoves || 0),
            hintsUsed: Number(progress.hintsUsed || 0),
            marks: positionMarks(progress),
          };
        }),
      },
    };
  }
  return base;
}

async function loadOwn(id: string, studentId: string) {
  await dbConnect();
  const doc: any = await ExamAssignment.findOne({ _id: id, student: studentId });
  if (!doc) throw new ExamError("Exam not found.", 404);
  return doc;
}

/** Throws (after submitting it) when the exam is over; otherwise returns quietly. */
async function assertRunning(doc: any, now: Date) {
  if (doc.status !== "in_progress") throw new ExamError("This exam is not in progress.", 409, doc.status === "submitted" ? "submitted" : "not_running");
  if (doc.endsAt && now.getTime() >= new Date(doc.endsAt).getTime()) {
    await submitExam(idOf(doc), "time_up", now);
    throw new ExamError("Time is up. Your exam has been submitted.", 409, "submitted");
  }
}

async function saveProgress(doc: any) {
  try {
    await doc.save();
  } catch (error: any) {
    if (error?.name === "VersionError") throw new ExamError("Your exam changed in another window. Reloading.", 409, "reload");
    throw error;
  }
}

export async function listStudentExams(studentId: string) {
  await dbConnect();
  const now = new Date();
  const docs: any[] = await ExamAssignment.find({ student: studentId, status: { $ne: "cancelled" } })
    .select("-mcqs -positions -mcqAnswers -positionProgress")
    .sort({ assignedAt: -1 })
    .limit(50)
    .lean();
  return docs.map((doc) => summary(doc, now));
}

export async function getStudentExam(id: string, studentId: string) {
  const doc = await loadOwn(id, studentId);
  const now = new Date();
  if (doc.status === "in_progress" && doc.endsAt && now >= doc.endsAt) {
    await submitExam(id, "time_up", now);
    return serializeForStudent(await ExamAssignment.findById(id).lean(), now);
  }
  return serializeForStudent(doc.toObject(), now);
}

export async function startExam(id: string, studentId: string) {
  await dbConnect();
  const now = new Date();
  const started = await ExamAssignment.findOneAndUpdate(
    { _id: id, student: studentId, status: "assigned", availableUntil: { $gt: now } },
    { $set: { status: "in_progress", startedAt: now, endsAt: examEndsAt(now), lastHeartbeatAt: now } },
    { new: true }
  ).lean();
  if (started) return serializeForStudent(started, now);
  const doc: any = await ExamAssignment.findOne({ _id: id, student: studentId }).lean();
  if (!doc) throw new ExamError("Exam not found.", 404);
  if (doc.status === "assigned") throw new ExamError("This exam's window has closed.", 409);
  if (doc.status === "in_progress") throw new ExamError("This exam has already been started.", 409, "already_started");
  throw new ExamError("This exam can no longer be started.", 409);
}

export async function answerMcq(id: string, studentId: string, questionId: string, optionId: string) {
  const doc = await loadOwn(id, studentId);
  const now = new Date();
  await assertRunning(doc, now);
  const mcq = (doc.mcqs || []).find((item: any) => item.id === questionId);
  if (!mcq) throw new ExamError("Question not found.", 404);
  const option = (mcq.options || []).find((item: any) => item.id === optionId);
  if (!option) throw new ExamError("Choose one of the options.");
  const correct = Boolean(option.correct);
  const updated = await ExamAssignment.updateOne(
    { _id: id, student: studentId, status: "in_progress", "mcqAnswers.questionId": { $ne: questionId } },
    { $push: { mcqAnswers: { questionId, selected: optionId, correct, marks: mcqMarks(correct), at: now } }, $inc: { __v: 1 } }
  );
  if (!updated.modifiedCount) throw new ExamError("This question has already been answered.", 409);
  return { questionId, selected: optionId };
}

function progressDoc(doc: any, questionId: string) {
  let progress = (doc.positionProgress || []).find((item: any) => item.questionId === questionId);
  if (!progress) {
    doc.positionProgress.push({ questionId, ply: 0, wrongMoves: 0, hintsUsed: 0, hintPly: -1, solved: false, marks: 0 });
    progress = doc.positionProgress[doc.positionProgress.length - 1];
  }
  return progress;
}

export async function playMove(id: string, studentId: string, questionId: string, move: { from: string; to: string; promotion?: string }) {
  const doc = await loadOwn(id, studentId);
  await assertRunning(doc, new Date());
  const position = (doc.positions || []).find((item: any) => item.id === questionId);
  if (!position) throw new ExamError("Position not found.", 404);
  const progress = progressDoc(doc, questionId);
  if (progress.solved) throw new ExamError("This position is already solved.", 409);
  const puzzle = puzzleFor(position);
  const verdict = judgePuzzleMove(puzzle, Number(progress.ply || 0), {
    from: String(move.from || ""),
    to: String(move.to || ""),
    promotion: /^[qrbn]$/.test(String(move.promotion || "")) ? String(move.promotion) : undefined,
  });
  if (!verdict.legal) return { legal: false, fen: puzzleFenAt(puzzle, Number(progress.ply || 0)) };
  if (!verdict.correct) {
    progress.wrongMoves = Number(progress.wrongMoves || 0) + 1;
    await saveProgress(doc);
    return { legal: true, correct: false, fen: puzzleFenAt(puzzle, Number(progress.ply || 0)), wrongMoves: progress.wrongMoves, available: availablePositionMarks(progress) };
  }
  progress.ply = verdict.ply;
  progress.solved = verdict.solved;
  progress.marks = positionMarks(progress);
  await saveProgress(doc);
  return {
    legal: true,
    correct: true,
    fen: verdict.fen,
    solved: verdict.solved,
    reply: verdict.reply ? { san: verdict.reply.san, from: verdict.reply.from, to: verdict.reply.to } : null,
    available: availablePositionMarks(progress),
    marks: progress.marks,
  };
}

export async function takeHint(id: string, studentId: string, questionId: string) {
  const doc = await loadOwn(id, studentId);
  await assertRunning(doc, new Date());
  const position = (doc.positions || []).find((item: any) => item.id === questionId);
  if (!position) throw new ExamError("Position not found.", 404);
  const progress = progressDoc(doc, questionId);
  if (progress.solved) throw new ExamError("This position is already solved.", 409);
  const ply = Number(progress.ply || 0);
  const next = puzzleFor(position).moves[ply];
  if (!next) throw new ExamError("There is no move left to hint.", 409);
  // A hint already bought for this move is shown again for free.
  if (progress.hintPly !== ply) {
    progress.hintsUsed = Number(progress.hintsUsed || 0) + 1;
    progress.hintPly = ply;
    await saveProgress(doc);
  }
  return { hint: { san: next.san, from: next.from, to: next.to }, hintsUsed: progress.hintsUsed, available: availablePositionMarks(progress) };
}

export async function heartbeat(id: string, studentId: string) {
  await dbConnect();
  const now = new Date();
  const doc: any = await ExamAssignment.findOneAndUpdate(
    { _id: id, student: studentId, status: "in_progress" },
    { $set: { lastHeartbeatAt: now } },
    { new: true, projection: { status: 1, endsAt: 1 } }
  ).lean();
  if (!doc) return { status: "not_running", serverNow: now };
  if (doc.endsAt && now >= doc.endsAt) {
    await submitExam(id, "time_up", now);
    return { status: "submitted", serverNow: now };
  }
  return { status: "in_progress", endsAt: doc.endsAt, serverNow: now };
}

export async function recordViolation(id: string, studentId: string, type: ViolationType) {
  await dbConnect();
  const now = new Date();
  const after: any = await ExamAssignment.findOneAndUpdate(
    { _id: id, student: studentId, status: "in_progress" },
    { $push: { violations: { type, at: now } }, $inc: { __v: 1 } },
    { new: true, projection: { violations: 1 } }
  ).lean();
  if (!after) return { outcome: "none" as const };
  const previous = (after.violations || []).slice(0, -1);
  const outcome = violationOutcome(previous, type);
  if (outcome === "submit") await submitExam(id, submitReasonFor(type), now);
  return { outcome, warnings: previous.filter((item: any) => item.type !== "app_closed").length + (type === "app_closed" ? 0 : 1) };
}

export async function submitByStudent(id: string, studentId: string) {
  const doc = await loadOwn(id, studentId);
  if (doc.status !== "in_progress") throw new ExamError("This exam is not in progress.", 409, doc.status === "submitted" ? "submitted" : "not_running");
  const now = new Date();
  const late = doc.endsAt && now >= doc.endsAt;
  await submitExam(id, late ? "time_up" : "completed", now);
  return serializeForStudent(await ExamAssignment.findById(id).lean(), now);
}

/**
 * Ends a sitting and marks it. The status change is the claim: whichever of
 * the student, the beacon and the sweep gets there first submits, the others
 * find nothing to do. `__v` moves so a move saved a moment later is refused
 * rather than changing a marked exam.
 */
export async function submitExam(id: string, reason: SubmitReason, now = new Date()) {
  await dbConnect();
  const doc: any = await ExamAssignment.findOneAndUpdate(
    { _id: id, status: "in_progress" },
    { $set: { status: "submitted", submittedAt: now, submitReason: reason }, $unset: { openKey: 1 }, $inc: { __v: 1 } },
    { new: true }
  ).lean();
  if (!doc) return null;
  const score = scoreExam(doc);
  const certificateNumber = certificateNumberFor({ _id: doc._id, tier: doc.tier, levelNumber: doc.levelNumber, submittedAt: now });
  const scored: any = await ExamAssignment.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        score: { ...score, percent: scorePercent(score.total, score.max) },
        certificateNumber,
        "certificate.status": "pending",
        "certificate.attempts": 0,
        "certificate.nextAttemptAt": now,
      },
    },
    { new: true }
  ).lean();
  await notifyExamResult(scored).catch((error) => console.error("[exams] result notice failed", error));
  void sendCertificate(id).catch((error) => console.error("[exams] certificate send failed", error));
  return scored;
}

/* ------------------------------------------------------------- certificates */

function callbackUrl() {
  const base = resolvePublicAppUrl(undefined, { allowRequestHeaders: false }) || "";
  return `${base}/api/webhooks/exam-certificate`;
}

/** Sends one queued certificate request. Claimed by pushing its next attempt out, so two runs never post twice. */
export async function sendCertificate(id: string, now = new Date()) {
  await dbConnect();
  const claimed: any = await ExamAssignment.findOneAndUpdate(
    { _id: id, status: "submitted", "certificate.status": "pending", "certificate.nextAttemptAt": { $lte: now } },
    { $set: { "certificate.nextAttemptAt": new Date(now.getTime() + 10 * 60_000) } },
    { new: true }
  ).lean();
  if (!claimed) return false;
  const student: any = await User.findById(claimed.student).select("name username email parentName parentEmail phone countryCode").lean();
  const result = await postCertificateWebhook(certificatePayload(claimed, student, callbackUrl()));
  if (result.ok) {
    await ExamAssignment.updateOne(
      { _id: id, "certificate.status": "pending" },
      { $set: { "certificate.status": "sent", "certificate.sentAt": new Date(), "certificate.lastError": "" }, $inc: { "certificate.attempts": 1 } }
    );
    return true;
  }
  const notConfigured = /is not set$/.test(result.error);
  const attempts = Number(claimed.certificate?.attempts || 0) + (notConfigured ? 0 : 1);
  const exhausted = attempts >= CERTIFICATE_MAX_ATTEMPTS;
  await ExamAssignment.updateOne(
    { _id: id },
    {
      $set: {
        "certificate.status": exhausted ? "failed" : "pending",
        "certificate.attempts": attempts,
        "certificate.lastError": result.error,
        // Not configured yet: look again in half an hour without spending a try.
        "certificate.nextAttemptAt": notConfigured ? new Date(now.getTime() + 30 * 60_000) : nextCertificateAttemptAt(attempts, now),
      },
    }
  );
  if (exhausted) {
    await notifyExamStaff(
      `exam:${id}:certificate_failed`,
      "Certificate request failed",
      `The certificate webhook failed ${attempts} times for ${student?.name || "a student"} (${examLevelLabel(claimed.tier, claimed.levelNumber)}): ${result.error}. Use Resend on the Exams page once it is fixed.`
    ).catch(() => undefined);
  }
  return false;
}

export async function resendCertificate(id: string) {
  await dbConnect();
  const updated = await ExamAssignment.updateOne(
    { _id: id, status: "submitted", "certificate.status": { $ne: "issued" } },
    { $set: { "certificate.status": "pending", "certificate.attempts": 0, "certificate.nextAttemptAt": new Date(), "certificate.lastError": "" } }
  );
  if (!updated.matchedCount) throw new ExamError("Only a submitted exam without an issued certificate can be re-sent.", 409);
  await sendCertificate(id);
  return { ok: true };
}

/** n8n's call back with the finished certificate's link. */
export async function recordIssuedCertificate(assignmentId: string, url: string) {
  await dbConnect();
  if (!/^https?:\/\//i.test(url)) throw new ExamError("A certificate URL (http or https) is required.");
  const updated: any = await ExamAssignment.findOneAndUpdate(
    { _id: assignmentId, status: "submitted" },
    { $set: { "certificate.status": "issued", "certificate.url": url, "certificate.issuedAt": new Date() } },
    { new: true, projection: { student: 1, tier: 1, levelNumber: 1 } }
  ).lean();
  if (!updated) throw new ExamError("No submitted exam with that id.", 404);
  await notifyCertificateIssued(updated).catch((error) => console.error("[exams] certificate notice failed", error));
  return { ok: true };
}

/* ------------------------------------------------------------- the sweep */

export function autoAssignFrom() {
  const raw = String(process.env.EXAMS_AUTO_ASSIGN_FROM || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function classroomExamLevel(classroom: any, course: any) {
  const tier = reportTier({ courseLevel: course?.level, classroomLevel: classroom.level });
  let levelNumber = levelNumberFromName(classroom.levelName);
  if (!levelNumber && course?.levels?.length && classroom.levelName) {
    const levels = [...course.levels].sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0));
    const index = levels.findIndex((level: any) => String(level.name || "").trim().toLowerCase() === String(classroom.levelName).trim().toLowerCase());
    if (index >= 0) levelNumber = index + 1;
  }
  return { tier, levelNumber };
}

/**
 * Assigns the level exam to everyone who finished a classroom of that level.
 * Covers every way a course reaches "completed" (the admin button, the armed
 * close after the last class, the hourly close) by looking at the result
 * rather than hooking each path. Only courses completed on or after
 * EXAMS_AUTO_ASSIGN_FROM count: without it, launch day would hand an exam to
 * everyone who ever finished a course. Unset means automatic assignment is off.
 */
export async function assignExamsForCompletedClassrooms(now = new Date(), onlyClassroomId?: string) {
  const from = autoAssignFrom();
  if (!from) return { classrooms: 0, assigned: 0 };
  await dbConnect();
  const done: any[] = await ExamClassroomRun.find(onlyClassroomId ? { classroom: onlyClassroomId } : {}).distinct("classroom");
  const classrooms: any[] = await Classroom.find({
    ...(onlyClassroomId ? { _id: onlyClassroomId } : {}),
    status: "completed",
    completedAt: { $gte: from, $lte: now },
    isSessionInstance: { $ne: true },
    isTestClassroom: { $ne: true },
    classroomType: { $ne: "demo" },
    _id: { $nin: done },
  })
    .select("title students studentExits level levelName course")
    .sort({ completedAt: 1 })
    .limit(50)
    .lean();
  if (!classrooms.length) return { classrooms: 0, assigned: 0 };

  const courseIds = Array.from(new Set(classrooms.map((classroom) => idOf(classroom.course)).filter(Boolean)));
  const courses: any[] = courseIds.length ? await Course.find({ _id: { $in: courseIds } }).select("level levels.name levels.order").lean() : [];
  const courseById = new Map(courses.map((course) => [idOf(course), course]));
  let assigned = 0;

  for (const classroom of classrooms) {
    const { tier, levelNumber } = classroomExamLevel(classroom, courseById.get(idOf(classroom.course)));
    if (!isExamLevel(tier, levelNumber)) {
      await ExamClassroomRun.create({ classroom: classroom._id, tier, levelNumber, result: "not_an_exam_level" }).catch(() => undefined);
      continue;
    }
    const paper = await ExamPaper.exists({ tier, levelNumber, status: "published" });
    if (!paper) {
      // Left unrecorded so the next sweep assigns it once the paper is published.
      await notifyExamStaff(
        `exam:paper_missing:${tier}:${levelNumber}`,
        `Publish the ${examLevelLabel(tier, levelNumber)} exam paper`,
        `"${classroom.title}" was completed, but the ${examLevelLabel(tier, levelNumber)} paper is not published yet. Its students get the exam as soon as it is.`
      ).catch(() => undefined);
      continue;
    }
    const exited = exitedIds(classroom);
    const studentIds = (classroom.students || []).map(idOf).filter((id: string) => !exited.has(id));
    const result = await assignExam({ studentIds, tier, levelNumber, source: "auto_completion", classroomId: idOf(classroom), now });
    assigned += result.assigned;
    await ExamClassroomRun.create({ classroom: classroom._id, tier, levelNumber, result: "assigned", assignedCount: result.assigned }).catch(() => undefined);
  }
  return { classrooms: classrooms.length, assigned };
}

export function kickExamAutoAssign(classroomId: string) {
  void assignExamsForCompletedClassrooms(new Date(), classroomId).catch((error) => console.error("[exams] auto-assign failed", error));
}

async function sendDueReminders(now: Date) {
  const due: any[] = await ExamAssignment.find({
    status: "assigned",
    availableUntil: { $gt: now },
    $or: [
      { "reminders.threeDayAt": { $lte: now }, "reminders.threeDaySentAt": null },
      { "reminders.lastDayAt": { $lte: now }, "reminders.lastDaySentAt": null },
    ],
  })
    .select("student tier levelNumber availableUntil reminders")
    .limit(200)
    .lean();
  let sent = 0;
  for (const assignment of due) {
    const kind = dueReminder({ now, availableUntil: assignment.availableUntil, ...assignment.reminders });
    const claim =
      kind === "last_day"
        ? // The three-day reminder is dropped once the last day is here.
          { $set: { "reminders.lastDaySentAt": now, ...(assignment.reminders?.threeDaySentAt ? {} : { "reminders.threeDaySentAt": now }) } }
        : kind === "three_day"
          ? { $set: { "reminders.threeDaySentAt": now } }
          : null;
    if (!kind || !claim) continue;
    const field = kind === "last_day" ? "reminders.lastDaySentAt" : "reminders.threeDaySentAt";
    const won = await ExamAssignment.updateOne({ _id: assignment._id, status: "assigned", [field]: null }, claim);
    if (!won.modifiedCount) continue;
    await notifyExamReminder(assignment, kind).catch((error) => console.error("[exams] reminder failed", error));
    sent += 1;
  }
  return sent;
}

/**
 * Every five minutes: close windows that ran out, submit sittings that ran
 * out of time or went silent, send due reminders, assign exams for newly
 * completed courses and work the certificate queue. Every step is a guarded
 * status change, so a run that overlaps the student's own submit is harmless.
 */
export async function processExamSweep(now = new Date()) {
  await dbConnect();
  const expired = await ExamAssignment.updateMany(
    { status: "assigned", availableUntil: { $lte: now } },
    { $set: { status: "expired" }, $unset: { openKey: 1 } }
  );

  const overdue: any[] = await ExamAssignment.find({ status: "in_progress", endsAt: { $lte: now } }).select("_id").limit(200).lean();
  for (const doc of overdue) await submitExam(idOf(doc), "time_up", now);

  const silent: any[] = await ExamAssignment.find({ status: "in_progress", lastHeartbeatAt: { $lte: new Date(now.getTime() - HEARTBEAT_STALE_MS) } })
    .select("_id")
    .limit(200)
    .lean();
  for (const doc of silent) await submitExam(idOf(doc), "disconnected", now);

  const reminders = await sendDueReminders(now);
  const auto = await assignExamsForCompletedClassrooms(now);

  const queued: any[] = await ExamAssignment.find({ status: "submitted", "certificate.status": "pending", "certificate.nextAttemptAt": { $lte: now } })
    .select("_id")
    .limit(50)
    .lean();
  let certificates = 0;
  for (const doc of queued) if (await sendCertificate(idOf(doc), now)) certificates += 1;

  return { expired: expired.modifiedCount, timedOut: overdue.length, disconnected: silent.length, reminders, autoAssigned: auto.assigned, certificates };
}

/* ------------------------------------------------------------- staff views */

function staffRow(doc: any) {
  const student = doc.student || {};
  return {
    id: idOf(doc),
    student: { id: idOf(student), name: student.name || "", username: student.username || "" },
    tier: doc.tier,
    levelNumber: doc.levelNumber,
    levelLabel: examLevelLabel(doc.tier, doc.levelNumber),
    paperVersion: doc.paperVersion || 1,
    source: doc.source,
    classroom: doc.classroom ? { id: idOf(doc.classroom), title: doc.classroom.title || "" } : null,
    assignedAt: doc.assignedAt,
    availableUntil: doc.availableUntil,
    status: doc.status,
    startedAt: doc.startedAt || null,
    submittedAt: doc.submittedAt || null,
    submitReason: doc.submitReason || null,
    submitReasonLabel: doc.submitReason ? SUBMIT_REASON_LABELS[doc.submitReason as SubmitReason] : null,
    violations: (doc.violations || []).map((violation: any) => ({ type: violation.type, at: violation.at })),
    score: doc.score || null,
    mcqCorrect: (doc.mcqAnswers || []).filter((answer: any) => answer.correct).length,
    mcqAnswered: (doc.mcqAnswers || []).length,
    positionsSolved: (doc.positionProgress || []).filter((progress: any) => progress.solved).length,
    wrongMoves: (doc.positionProgress || []).reduce((sum: number, progress: any) => sum + Number(progress.wrongMoves || 0), 0),
    hintsUsed: (doc.positionProgress || []).reduce((sum: number, progress: any) => sum + Number(progress.hintsUsed || 0), 0),
    certificate: {
      status: doc.certificate?.status || "none",
      url: doc.certificate?.url || "",
      lastError: doc.certificate?.lastError || "",
      attempts: doc.certificate?.attempts || 0,
      number: doc.certificateNumber || "",
    },
  };
}

const STAFF_SELECT = "-mcqs -positions";

export async function listAssignmentsForStaff(filters: { tier?: string; levelNumber?: number; status?: string; studentIds?: string[] } = {}) {
  await dbConnect();
  const query: Record<string, unknown> = {};
  if (filters.tier) query.tier = filters.tier;
  if (filters.levelNumber) query.levelNumber = filters.levelNumber;
  if (filters.status) query.status = filters.status;
  if (filters.studentIds) query.student = { $in: filters.studentIds };
  const docs: any[] = await ExamAssignment.find(query)
    .select(STAFF_SELECT)
    .populate("student", "name username")
    .populate("classroom", "title")
    .sort({ assignedAt: -1 })
    .limit(500)
    .lean();
  return docs.map(staffRow);
}

/** A coach sees the exams of students in the classrooms they teach, read-only. */
export async function listAssignmentsForCoach(coachId: string) {
  await dbConnect();
  const studentIds: any[] = await Classroom.find({ $or: [{ coach: coachId }, { instructor: coachId }], isSessionInstance: { $ne: true } }).distinct("students");
  if (!studentIds.length) return [];
  return listAssignmentsForStaff({ studentIds: studentIds.map(String) });
}

export async function assignTargets() {
  await dbConnect();
  const [students, batches, classrooms] = await Promise.all([
    User.find({ role: "student", isActive: { $ne: false }, accountStatus: { $ne: "demo" } }).select("name username").sort({ name: 1 }).limit(2000).lean(),
    Batch.find({ isActive: { $ne: false } }).select("name students").sort({ name: 1 }).lean(),
    Classroom.find({ isSessionInstance: { $ne: true }, classroomType: { $ne: "demo" }, status: { $ne: "cancelled" }, isTestClassroom: { $ne: true } })
      .select("title students studentExits level levelName status")
      .sort({ updatedAt: -1 })
      .limit(400)
      .lean(),
  ]);
  return {
    students: (students as any[]).map((student) => ({ id: idOf(student), name: student.name || "", username: student.username || "" })),
    batches: (batches as any[]).map((batch) => ({ id: idOf(batch), name: batch.name || "", studentCount: (batch.students || []).length })),
    classrooms: (classrooms as any[]).map((classroom) => {
      const exited = exitedIds(classroom);
      return {
        id: idOf(classroom),
        title: classroom.title || "",
        status: classroom.status,
        levelName: classroom.levelName || "",
        studentCount: (classroom.students || []).filter((student: any) => !exited.has(idOf(student))).length,
      };
    }),
  };
}
