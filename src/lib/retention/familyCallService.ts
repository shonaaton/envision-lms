import "server-only";

import { Types } from "mongoose";
import { academyDateTime, formatAcademyDateTime } from "@/lib/academyTime";
import { exitStudentId as idOf } from "@/lib/classroomStudentExits";
import { dbConnect } from "@/lib/db";
import { examLevelLabel } from "@/lib/exams/examRules";
import { exitReasonLabel } from "@/lib/retention/exitReasons";
import { sendFamilyCallMessage } from "@/lib/retention/familyCallMessages";
import { listQuestions } from "@/lib/retention/familyQuestions";
import {
  ACTION_LABELS,
  CALL_QUIET_DAYS,
  KIND_LABELS,
  OUTCOME_LABELS,
  childNames,
  dailyTarget,
  familyCallSchema,
  familyKeyOf,
  monthKeyOf,
  queueState,
  recentlyCalled,
  talkingPoints,
} from "@/lib/retention/familyRules";
import { resolveFlag } from "@/lib/retention/retentionService";
import { LEVEL_RANK, RISK_THRESHOLDS, type RiskLevel } from "@/lib/retention/riskRules";
import { STUDENT_FIELDS, loadPopulation, loadStudentContexts, readFees } from "@/lib/retention/studentSignals";
import { raiseFamilyCallActionTask, raiseFamilyCallbackTask, resolveFamilyCallbackTasks, resolveRetentionRiskTask } from "@/lib/tasks/taskTriggers";
import { Classroom } from "@/models/Classroom";
import { ExamAssignment } from "@/models/Exam";
import { FamilyCall, FamilyCallQuestion } from "@/models/FamilyCall";
import { Notification } from "@/models/Fee";
import { LearningExerciseProgress } from "@/models/Learning";
import { RetentionFlag } from "@/models/RetentionFlag";
import { TacticAttempt } from "@/models/TacticPuzzle";
import { User } from "@/models/User";

const DAY = 86_400_000;
/** Renewals shown on the Renewals tab; inside 7 days they also lift a family up today's list. */
const RENEWAL_LIST_DAYS = 14;
const FAMILY_FIELDS = `${STUDENT_FIELDS} lastSeenAt deactivatedAt exitReason accountStatus`;

type Actor = { id: string; name?: string };

function nameOf(student: any) {
  return String(student?.name || student?.username || "Student");
}

function phoneLabel(student: any) {
  return student?.phone ? `${student.countryCode || ""} ${student.phone}`.trim() : "";
}

/** Digits to dial, from the family key: `phone:919876543210` → `919876543210`. */
function dialDigits(familyKey: string) {
  return familyKey.startsWith("phone:") ? familyKey.slice(6) : "";
}

function firstParentName(members: any[]) {
  return String(members.map((member) => member?.parentName).find((value) => String(value || "").trim()) || "").trim();
}

/** The student asked for, plus every active sibling on the same phone. */
async function resolveFamily(studentId: string) {
  if (!Types.ObjectId.isValid(studentId)) throw new Error("Unknown student.");
  await dbConnect();
  const primary: any = await User.findOne({ _id: studentId, role: "student" }).select(FAMILY_FIELDS).lean();
  if (!primary) throw new Error("Unknown student.");
  const familyKey = familyKeyOf(primary);
  const siblings: any[] = familyKey.startsWith("phone:")
    ? await User.find({ _id: { $ne: primary._id }, role: "student", phoneCanonical: dialDigits(familyKey), isActive: { $ne: false }, accountStatus: { $ne: "demo" } })
      .select(FAMILY_FIELDS)
      .lean()
    : [];
  return { familyKey, primary, members: [primary, ...siblings] };
}

async function readExtras(ids: any[], now: Date) {
  const since = new Date(now.getTime() - 30 * DAY);
  const [puzzles, lessons, exams]: any[][] = await Promise.all([
    TacticAttempt.aggregate([{ $match: { student: { $in: ids }, solved: true, createdAt: { $gte: since } } }, { $group: { _id: "$student", count: { $sum: 1 } } }]),
    LearningExerciseProgress.aggregate([{ $match: { studentId: { $in: ids }, firstCompletedAt: { $gte: since } } }, { $group: { _id: "$studentId", count: { $sum: 1 } } }]),
    ExamAssignment.find({ student: { $in: ids }, status: { $in: ["assigned", "in_progress"] } }).select("student tier levelNumber status availableUntil").sort({ availableUntil: 1 }).lean(),
  ]);
  const count = (rows: any[]) => new Map(rows.map((row) => [idOf(row._id), Number(row.count) || 0]));
  const examByStudent = new Map<string, any>();
  exams.forEach((exam) => {
    if (!examByStudent.has(idOf(exam.student))) examByStudent.set(idOf(exam.student), exam);
  });
  return { puzzles: count(puzzles), lessons: count(lessons), exams: examByStudent };
}

function shapeFlag(flag: any) {
  if (!flag) return null;
  return {
    _id: idOf(flag),
    level: flag.level as RiskLevel,
    reasons: (flag.reasons || []).map((reason: any) => ({ code: reason.code, severity: reason.severity, label: reason.label, detail: reason.detail })),
    taskHeldBackUntil: flag.taskSuppressedByCall?.callAt ? new Date(new Date(flag.taskSuppressedByCall.callAt).getTime() + CALL_QUIET_DAYS * DAY) : null,
  };
}

export function shapeCall(call: any, nameById: Map<string, string>) {
  const studentName = (value: unknown) => (value ? nameById.get(idOf(value)) || "" : "");
  return {
    _id: idOf(call),
    at: call.at,
    monthKey: call.monthKey,
    familyKey: call.familyKey,
    kind: call.kind,
    kindLabel: KIND_LABELS[call.kind] || call.kind,
    outcome: call.outcome,
    outcomeLabel: OUTCOME_LABELS[call.outcome] || call.outcome,
    byName: call.byName || "",
    durationMinutes: call.durationMinutes ?? null,
    satisfaction: call.satisfaction ?? null,
    leavingIntent: call.leavingIntent || null,
    students: (call.students || []).map((id: any) => ({ _id: idOf(id), name: studentName(id) || "Removed student" })),
    primaryStudentId: idOf(call.primaryStudent),
    answers: (call.answers || []).map((row: any) => ({ question: row.question, answer: row.answer, studentName: studentName(row.student) })),
    extraQuestions: (call.extraQuestions || []).map((row: any) => ({ question: row.question, answer: row.answer })),
    notes: call.notes || "",
    parentSummary: call.parentSummary || "",
    coachNote: call.coachNote?.text || "",
    talkingPoints: (call.talkingPoints || []).map((row: any) => ({ label: row.label, discussed: Boolean(row.discussed), studentName: studentName(row.student) })),
    actionItems: (call.actionItems || []).map((row: any) => ({ type: row.type, label: ACTION_LABELS[row.type] || row.type, note: row.note })),
    callbackAt: call.callbackAt || null,
    message: call.message?.kind ? { kind: call.message.kind, whatsapp: call.message.whatsapp, email: call.message.email, error: call.message.error || "" } : null,
  };
}

async function namesFor(calls: any[]) {
  const ids = new Set<string>();
  calls.forEach((call) => {
    (call.students || []).forEach((id: any) => ids.add(idOf(id)));
    (call.answers || []).forEach((row: any) => row.student && ids.add(idOf(row.student)));
  });
  const users: any[] = ids.size ? await User.find({ _id: { $in: Array.from(ids) } }).select("name username").lean() : [];
  return new Map(users.map((user) => [idOf(user), nameOf(user)]));
}

// ---------------------------------------------------------------------------
// The call screen
// ---------------------------------------------------------------------------

/** Everything the caller needs on screen: each child's picture, the talking points, open flags, the questions and past calls. */
export async function familyView(studentId: string, now = new Date()) {
  const { familyKey, primary, members } = await resolveFamily(studentId);
  const ids = members.map((member) => member._id);
  const [contexts, flags, calls, extras, questions, fees]: [Awaited<ReturnType<typeof loadStudentContexts>>, any[], any[], Awaited<ReturnType<typeof readExtras>>, Awaited<ReturnType<typeof listQuestions>>, Awaited<ReturnType<typeof readFees>>] = await Promise.all([
    loadStudentContexts(now, { studentIds: ids.map(idOf) }),
    RetentionFlag.find({ student: { $in: ids }, status: "open" }).lean(),
    FamilyCall.find({ $or: [{ familyKey }, { students: { $in: ids } }] }).sort({ at: -1 }).limit(25).lean(),
    readExtras(ids, now),
    listQuestions(),
    readFees(ids, now, RENEWAL_LIST_DAYS),
  ]);

  const classroomIds = Array.from(new Set(Array.from(contexts.values()).flatMap((context) => context.classroomIds)));
  const coachIds = Array.from(new Set(Array.from(contexts.values()).flatMap((context) => context.coachIds)));
  const [classrooms, coaches]: any[][] = await Promise.all([
    classroomIds.length ? Classroom.find({ _id: { $in: classroomIds } }).select("title").lean() : [],
    coachIds.length ? User.find({ _id: { $in: coachIds } }).select("name username").lean() : [],
  ]);
  const classTitle = new Map(classrooms.map((row) => [idOf(row), String(row.title || "Class")]));
  const coachName = new Map(coaches.map((row) => [idOf(row), nameOf(row)]));
  const flagByStudent = new Map(flags.map((flag) => [idOf(flag.student), flag]));
  const nameById = await namesFor(calls);
  members.forEach((member) => nameById.set(idOf(member), nameOf(member)));

  const children = members.map((member) => {
    const id = idOf(member);
    const context = contexts.get(id);
    const snapshot = context?.snapshot;
    const exam = extras.exams.get(id);
    const pointExtras = {
      lastSeenAt: member.lastSeenAt ? new Date(member.lastSeenAt) : null,
      puzzlesLast30: extras.puzzles.get(id) || 0,
      lessonsLast30: extras.lessons.get(id) || 0,
      pendingExam: exam ? { label: examLevelLabel(exam.tier, exam.levelNumber), availableUntil: exam.availableUntil ? new Date(exam.availableUntil) : null, started: exam.status === "in_progress" } : null,
    };
    const recent = (snapshot?.attendance || []).filter((row) => row.date.getTime() >= now.getTime() - RISK_THRESHOLDS.attendanceWindowDays * DAY);
    const fee = fees.get(id) || {};
    return {
      _id: id,
      name: nameOf(member),
      isActive: member.isActive !== false,
      left: member.isActive === false ? { at: member.deactivatedAt || null, reason: member.exitReason?.category ? exitReasonLabel(member.exitReason.category) : "", note: member.exitReason?.note || "" } : null,
      inClass: Boolean(context && context.classroomIds.length),
      pausedUntil: snapshot?.pause?.pausedUntil || null,
      classes: (context?.classroomIds || []).map((classId) => classTitle.get(classId) || "Class"),
      coaches: (context?.coachIds || []).map((coachId) => coachName.get(coachId) || "Coach"),
      stats: {
        attended28: recent.filter((row) => ["present", "late"].includes(row.status)).length,
        missed28: recent.filter((row) => ["absent", "student_no_show", "not_joined"].includes(row.status)).length,
        homeworkDue: snapshot?.homework.length || 0,
        homeworkNotDone: snapshot?.homework.filter((row) => !row.submitted).length || 0,
        lastPracticeAt: snapshot?.lastPracticeAt || null,
        puzzles30: pointExtras.puzzlesLast30,
        lessons30: pointExtras.lessonsLast30,
        lastSeenAt: pointExtras.lastSeenAt,
        effort: snapshot?.latestEffort ?? null,
        exam: pointExtras.pendingExam,
      },
      fees: { planType: fee.planType || null, creditBalance: fee.creditBalance ?? null, nextInvoiceDueAt: fee.nextInvoiceDueAt || null },
      flag: shapeFlag(flagByStudent.get(id)),
      points: snapshot ? talkingPoints(snapshot, pointExtras) : [],
    };
  });

  const lastConnected = calls.find((call) => call.outcome === "connected");
  const callbackCall = calls.find((call) => call.callbackAt);
  const pendingCallback = callbackCall && !(lastConnected && new Date(lastConnected.at) > new Date(callbackCall.at)) ? callbackCall.callbackAt : null;
  const digits = dialDigits(familyKey);

  return {
    familyKey,
    primaryStudentId: idOf(primary),
    parentName: firstParentName(members),
    parentEmail: String(primary.parentEmail || primary.email || ""),
    phone: phoneLabel(primary),
    telHref: digits ? `tel:+${digits}` : "",
    whatsappHref: digits ? `https://wa.me/${digits}` : "",
    childrenLabel: childNames(members.map(nameOf)),
    children,
    questions,
    calls: calls.map((call) => shapeCall(call, nameById)),
    lastConnectedAt: lastConnected?.at || null,
    calledRecently: recentlyCalled(lastConnected?.at ? new Date(lastConnected.at) : null, now),
    pendingCallback,
    callsThisMonth: calls.filter((call) => call.monthKey === monthKeyOf(now)).length,
  };
}

// ---------------------------------------------------------------------------
// Logging a call
// ---------------------------------------------------------------------------

/**
 * Saves the call, then does what it implies: mirrors it onto any open risk
 * flag (and closes that flag's call task), settles the flag if asked, raises
 * callback and follow-up tasks, sends the family their message and the coach
 * the shared note. The follow-ups never undo the save.
 */
export async function logFamilyCall(raw: unknown, actor: Actor, now = new Date()) {
  const input = familyCallSchema.parse(raw);
  const { familyKey, primary, members } = await resolveFamily(input.studentId);
  const memberIds = new Set(members.map(idOf));
  const memberObjectIds = members.map((member) => member._id);
  const connected = input.outcome === "connected";
  const children = childNames(members.map(nameOf));
  const familyName = `${children}'s family`;

  const questions: any[] = input.answers.length
    ? await FamilyCallQuestion.find({ _id: { $in: input.answers.map((row) => row.questionId) } }).select("text type").lean()
    : [];
  const questionById = new Map(questions.map((row) => [idOf(row), row]));
  const answers = input.answers
    .filter((row) => row.answer && questionById.has(row.questionId) && (!row.studentId || memberIds.has(row.studentId)))
    .map((row) => ({
      questionId: new Types.ObjectId(row.questionId),
      question: questionById.get(row.questionId).text,
      type: questionById.get(row.questionId).type,
      answer: row.answer,
      student: row.studentId ? new Types.ObjectId(row.studentId) : undefined,
    }));

  const actionItems = input.actionItems.map((item) => ({ _id: new Types.ObjectId(), type: item.type, note: item.note }));
  if (input.outcome === "wrong_number") {
    actionItems.push({ _id: new Types.ObjectId(), type: "other", note: `Wrong number on file (${phoneLabel(primary) || "none"}). Find the right number and update the family's account.` });
  }

  const flags: any[] = await RetentionFlag.find({ student: { $in: memberObjectIds }, status: "open" }).lean();
  const call: any = (await FamilyCall.create({
    familyKey,
    students: memberObjectIds,
    primaryStudent: primary._id,
    monthKey: monthKeyOf(now),
    kind: input.kind,
    outcome: input.outcome,
    at: now,
    by: Types.ObjectId.isValid(actor.id) ? new Types.ObjectId(actor.id) : undefined,
    byName: actor.name || "",
    durationMinutes: input.durationMinutes,
    satisfaction: connected ? input.satisfaction : undefined,
    leavingIntent: connected ? input.leavingIntent : undefined,
    answers,
    extraQuestions: input.extraQuestions.filter((row) => row.question),
    notes: input.notes,
    parentSummary: connected ? input.parentSummary : "",
    coachNote: input.coachNote ? { text: input.coachNote } : undefined,
    talkingPoints: input.talkingPoints
      .filter((row) => memberIds.has(row.studentId))
      .map((row) => ({ student: new Types.ObjectId(row.studentId), code: row.code, label: row.label, discussed: row.discussed })),
    actionItems,
    callbackAt: input.callbackAt || undefined,
    flags: flags.map((flag) => flag._id),
  })).toObject();

  const step = async (label: string, work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      console.error(`[retention] call ${idOf(call)}: could not ${label}`, error);
    }
  };

  if (connected) {
    const when = formatAcademyDateTime(now, { timeZoneName: "short" });
    for (const flag of flags) {
      await step("log it on the flag", () => RetentionFlag.updateOne(
        { _id: flag._id, status: "open" },
        { $push: { contactLog: { at: now, by: call.by, byName: actor.name || "", channel: "call", note: `${KIND_LABELS[input.kind]}: ${input.notes}`.slice(0, 1000) } } }
      ));
      await step("close the risk task", () => resolveRetentionRiskTask(flag._id, actor.id, `Spoke to the family on ${when}.`));
    }
    await step("close callback tasks", () => resolveFamilyCallbackTasks(familyKey, actor.id));
    if (input.settleFlag && flags.some((flag) => idOf(flag) === input.settleFlag!.flagId)) {
      await step("settle the flag", () => resolveFlag(input.settleFlag!.flagId, { outcome: input.settleFlag!.outcome, note: input.settleFlag!.note || input.notes }, actor));
    }
  }

  if (input.callbackAt) {
    await step("raise the callback task", () => raiseFamilyCallbackTask({ call, familyName, assignedTo: actor.id, familyKey, studentId: idOf(primary) }));
  }

  for (const item of actionItems) {
    await step("raise a follow-up task", async () => {
      const task: any = await raiseFamilyCallActionTask({ call, itemId: item._id, type: item.type, note: item.note, familyName, studentId: idOf(primary) });
      if (task?._id) await FamilyCall.updateOne({ _id: call._id, "actionItems._id": item._id }, { $set: { "actionItems.$.task": task._id } });
    });
  }

  if (input.coachNote) await step("share the note with the coach", () => shareWithCoaches(call, members, children, input.coachNote, now));

  if (input.sendMessage) {
    const discussed = input.talkingPoints.filter((row) => row.discussed && memberIds.has(row.studentId)).map((row) => row.label);
    await step("message the family", () => sendFamilyCallMessage({ call, primary, parentName: firstParentName(members), children, callerName: firstName(actor.name), discussed }));
  }

  const saved: any = await FamilyCall.findById(call._id).lean();
  const nameById = new Map(members.map((member) => [idOf(member), nameOf(member)]));
  return shapeCall(saved || call, nameById);
}

function firstName(name?: string) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

/** The note the caller chose to share goes to each child's current coach. */
async function shareWithCoaches(call: any, members: any[], children: string, note: string, now: Date) {
  const { membership } = await loadPopulation(now, { studentIds: members.map(idOf), withSessions: false });
  const coachIds = Array.from(new Set(Array.from(membership.values()).flatMap((entry) => Array.from(entry.coachIds))));
  if (!coachIds.length) return;
  await Notification.insertMany(coachIds.map((coachId) => ({
    user: new Types.ObjectId(coachId),
    type: "family_call_note",
    title: `Note from a call with ${children}'s family`,
    message: note,
    metadata: { callId: idOf(call), studentIds: members.map(idOf), href: "/dashboard" },
  })));
  await FamilyCall.updateOne({ _id: call._id }, { $set: { "coachNote.sharedAt": now } });
}

/** Shared notes from the last weeks for a coach's dashboard. */
export async function coachFamilyNotes(coachId: string, now = new Date()) {
  if (!Types.ObjectId.isValid(coachId)) return [];
  await dbConnect();
  const rows: any[] = await Notification.find({ user: coachId, type: "family_call_note", createdAt: { $gte: new Date(now.getTime() - 45 * DAY) } })
    .sort({ createdAt: -1 })
    .limit(6)
    .select("title message createdAt")
    .lean();
  return rows.map((row) => ({ _id: idOf(row), title: String(row.title || ""), message: String(row.message || ""), at: row.createdAt }));
}

// ---------------------------------------------------------------------------
// Lists: the monthly queue (and today's calls, and renewals)
// ---------------------------------------------------------------------------

/**
 * Every family due a call this month, with where they stand and today's
 * priority. Today's list and the Renewals tab are views of this one list.
 */
export async function monthlyQueue(now = new Date()) {
  await dbConnect();
  const monthKey = monthKeyOf(now);
  const { population, membership, activePauseByStudent } = await loadPopulation(now, { withSessions: false });

  const families = new Map<string, any[]>();
  population.forEach((student) => {
    const key = familyKeyOf(student);
    families.set(key, [...(families.get(key) || []), student]);
  });
  const keys = Array.from(families.keys());
  const ids = population.map((student) => student._id);
  const coachIds = Array.from(new Set(Array.from(membership.values()).flatMap((entry) => Array.from(entry.coachIds))));

  const [flags, fees, monthCalls, lastConnected, callbacks, coaches]: any[] = await Promise.all([
    RetentionFlag.find({ status: "open", student: { $in: ids } }).select("student level").lean(),
    readFees(ids, now, RENEWAL_LIST_DAYS),
    FamilyCall.find({ monthKey, familyKey: { $in: keys } }).select("familyKey at outcome").lean(),
    FamilyCall.aggregate([
      { $match: { familyKey: { $in: keys }, outcome: "connected" } },
      { $sort: { at: -1 } },
      { $group: { _id: "$familyKey", at: { $first: "$at" }, satisfaction: { $first: "$satisfaction" } } },
    ]),
    FamilyCall.find({ familyKey: { $in: keys }, callbackAt: { $ne: null }, at: { $gte: new Date(now.getTime() - 60 * DAY) } }).sort({ at: -1 }).select("familyKey at callbackAt").lean(),
    coachIds.length ? User.find({ _id: { $in: coachIds } }).select("name username").lean() : [],
  ]);

  const flagLevel = new Map<string, RiskLevel>((flags as any[]).map((flag) => [idOf(flag.student), flag.level]));
  const coachName = new Map((coaches as any[]).map((row) => [idOf(row), nameOf(row)]));
  const callsByFamily = new Map<string, Array<{ at: Date; outcome: string }>>();
  (monthCalls as any[]).forEach((call) => callsByFamily.set(call.familyKey, [...(callsByFamily.get(call.familyKey) || []), { at: new Date(call.at), outcome: call.outcome }]));
  const connectedByFamily = new Map<string, { at: Date; satisfaction: number | null }>((lastConnected as any[]).map((row) => [row._id, { at: new Date(row.at), satisfaction: row.satisfaction ?? null }]));
  const callbackByFamily = new Map<string, any>();
  (callbacks as any[]).forEach((call) => {
    if (!callbackByFamily.has(call.familyKey)) callbackByFamily.set(call.familyKey, call);
  });

  const rows = keys.map((key) => {
    const students = families.get(key) || [];
    const level = students.reduce<RiskLevel>((worst, student) => {
      const mine = flagLevel.get(idOf(student)) || "none";
      return LEVEL_RANK[mine] > LEVEL_RANK[worst] ? mine : worst;
    }, "none");
    const renewal = familyRenewal(students, fees, now);
    const connected = connectedByFamily.get(key) || null;
    const callback = callbackByFamily.get(key);
    const pendingCallbackAt = callback && !(connected && connected.at > new Date(callback.at)) ? new Date(callback.callbackAt) : null;
    const state = queueState({
      flagLevel: level,
      renewalSoon: Boolean(renewal?.within7),
      lastConnectedAt: connected?.at || null,
      callsThisMonth: callsByFamily.get(key) || [],
      pendingCallbackAt,
    }, now);
    const coachNames = new Set<string>();
    students.forEach((student) => membership.get(idOf(student))?.coachIds.forEach((coachId) => coachNames.add(coachName.get(coachId) || "Coach")));
    return {
      familyKey: key,
      primaryStudentId: idOf(students[0]),
      students: students.map((student) => ({ _id: idOf(student), name: nameOf(student), paused: activePauseByStudent.has(idOf(student)) })),
      parentName: firstParentName(students),
      phone: phoneLabel(students[0]),
      coaches: Array.from(coachNames),
      flagLevel: level,
      renewal,
      lastConnectedAt: connected?.at || null,
      lastSatisfaction: connected?.satisfaction ?? null,
      pendingCallbackAt,
      ...state,
    };
  }).sort((a, b) => b.priority - a.priority);

  const done = rows.filter((row) => row.state === "done").length;
  return {
    monthKey,
    summary: {
      families: rows.length,
      done,
      remaining: rows.length - done,
      dueToday: rows.filter((row) => row.dueToday).length,
      dailyTarget: dailyTarget(rows.length - done, now),
      callbacksDue: rows.filter((row) => row.why.includes("Callback due")).length,
      unreachable: rows.filter((row) => row.state === "unreachable").length,
      renewals: rows.filter((row) => row.renewal).length,
    },
    rows,
  };
}

type Renewal = { label: string; dueAt: Date | null; within7: boolean; sortKey: number };

function familyRenewal(students: any[], fees: Map<string, any>, now: Date) {
  let best: Renewal | null = null;
  for (const student of students) {
    const fee = fees.get(idOf(student));
    if (!fee) continue;
    const first = nameOf(student).split(/\s+/)[0];
    let candidate: Renewal | null = null;
    if (fee.planType === "credits" && typeof fee.creditBalance === "number" && fee.creditBalance <= RISK_THRESHOLDS.lowCredits) {
      candidate = { label: `${first}: ${fee.creditBalance <= 0 ? "credits used up" : `${fee.creditBalance} credit${fee.creditBalance === 1 ? "" : "s"} left`}`, dueAt: null, within7: true, sortKey: fee.creditBalance };
    } else if (fee.nextInvoiceDueAt) {
      const days = Math.floor((new Date(fee.nextInvoiceDueAt).getTime() - now.getTime()) / DAY);
      candidate = {
        label: `${first}: ${days < 0 ? `fee overdue ${-days}d` : days === 0 ? "fee due today" : `fee due in ${days}d`}`,
        dueAt: new Date(fee.nextInvoiceDueAt),
        within7: days <= RISK_THRESHOLDS.invoiceDueDays,
        sortKey: days,
      };
    }
    if (candidate && (!best || candidate.sortKey < best.sortKey)) best = candidate;
  }
  return best ? { label: best.label, dueAt: best.dueAt, within7: best.within7, sortKey: best.sortKey } : null;
}

// ---------------------------------------------------------------------------
// Call history, win-back and stats
// ---------------------------------------------------------------------------

const PAGE_SIZE = 30;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function callHistory(filters: { studentId?: string; q?: string; month?: string; outcome?: string; callerId?: string; page?: number }) {
  await dbConnect();
  const query: any = {};
  if (filters.studentId && Types.ObjectId.isValid(filters.studentId)) {
    const student: any = await User.findById(filters.studentId).select("phone countryCode phoneCanonical").lean();
    const or: any[] = [{ students: new Types.ObjectId(filters.studentId) }];
    if (student) or.push({ familyKey: familyKeyOf(student) });
    query.$or = or;
  }
  if (filters.q?.trim()) {
    const pattern = new RegExp(escapeRegex(filters.q.trim()), "i");
    const matches: any[] = await User.find({ role: "student", $or: [{ name: pattern }, { username: pattern }, { parentName: pattern }, { phone: pattern }] }).select("_id").limit(200).lean();
    query.students = { $in: matches.map((row) => row._id) };
  }
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) query.monthKey = filters.month;
  if (filters.outcome) query.outcome = filters.outcome === "missed" ? { $in: ["no_answer", "busy", "switched_off"] } : filters.outcome;
  if (filters.callerId && Types.ObjectId.isValid(filters.callerId)) query.by = new Types.ObjectId(filters.callerId);
  const page = Math.max(1, Math.floor(Number(filters.page) || 1));
  const [rows, total]: [any[], number] = await Promise.all([
    FamilyCall.find(query).sort({ at: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    FamilyCall.countDocuments(query),
  ]);
  const nameById = await namesFor(rows);
  return { rows: rows.map((row) => shapeCall(row, nameById)), total, page, pageSize: PAGE_SIZE };
}

/** Students who left in the last four months, with how long ago, why, and whether a win-back call is due. */
export async function winBackList(now = new Date()) {
  await dbConnect();
  const leavers: any[] = await User.find({
    role: "student",
    isActive: false,
    accountStatus: { $ne: "demo" },
    deactivatedAt: { $gte: new Date(now.getTime() - 120 * DAY), $lte: now },
  })
    .select("name username parentName phone countryCode phoneCanonical deactivatedAt exitReason")
    .sort({ deactivatedAt: -1 })
    .lean();
  const ids = leavers.map((row) => row._id);
  const calls: any[] = ids.length ? await FamilyCall.find({ students: { $in: ids } }).sort({ at: -1 }).select("students at outcome kind").lean() : [];
  return leavers.map((student) => {
    const id = idOf(student);
    const mine = calls.filter((call) => (call.students || []).some((value: any) => idOf(value) === id));
    const lastWinBack = mine.find((call) => call.kind === "win_back") || null;
    const daysSinceLeft = Math.floor((now.getTime() - new Date(student.deactivatedAt).getTime()) / DAY);
    return {
      _id: id,
      name: nameOf(student),
      parentName: String(student.parentName || ""),
      phone: phoneLabel(student),
      leftAt: student.deactivatedAt,
      daysSinceLeft,
      bucket: daysSinceLeft >= 90 ? 90 : daysSinceLeft >= 60 ? 60 : daysSinceLeft >= 30 ? 30 : 0,
      reason: student.exitReason?.category ? exitReasonLabel(student.exitReason.category) : "Not recorded",
      reasonNote: String(student.exitReason?.note || ""),
      lastCall: mine[0] ? { at: mine[0].at, outcome: OUTCOME_LABELS[mine[0].outcome] || mine[0].outcome, kind: KIND_LABELS[mine[0].kind] || mine[0].kind } : null,
      // A month after leaving, and not already called about coming back in the last month.
      due: daysSinceLeft >= 30 && (!lastWinBack || now.getTime() - new Date(lastWinBack.at).getTime() > 30 * DAY),
    };
  });
}

/** Per caller for one month, plus the satisfaction trend over six months. */
export async function callerStats(monthKey: string, now = new Date()) {
  await dbConnect();
  const month = /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : monthKeyOf(now);
  const [year, monthNumber] = month.split("-").map(Number);
  const trendMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - 1 - (5 - index), 15));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const nextMonth = new Date(Date.UTC(year, monthNumber, 15));
  const monthStart = academyDateTime(`${month}-01`);
  const monthEnd = academyDateTime(`${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`);
  const [calls, trend, saves]: any[][] = await Promise.all([
    FamilyCall.find({ monthKey: month }).select("by byName outcome familyKey satisfaction at students actionItems").lean(),
    FamilyCall.aggregate([
      { $match: { monthKey: { $in: trendMonths }, outcome: "connected", satisfaction: { $gte: 1 } } },
      { $group: { _id: "$monthKey", average: { $avg: "$satisfaction" }, calls: { $sum: 1 } } },
    ]),
    RetentionFlag.find({ "resolution.outcome": "stayed", "resolution.auto": { $ne: true }, "resolution.at": { $gte: monthStart, $lt: monthEnd } })
      .select("resolution.by")
      .lean(),
  ]);

  // Families who left within 30 days of a call that connected.
  const connectedCalls = calls.filter((call) => call.outcome === "connected");
  const studentIds = Array.from(new Set(connectedCalls.flatMap((call) => (call.students || []).map(idOf))));
  const left: any[] = studentIds.length ? await User.find({ _id: { $in: studentIds }, isActive: false, deactivatedAt: { $ne: null } }).select("deactivatedAt").lean() : [];
  const leftAt = new Map(left.map((row) => [idOf(row), new Date(row.deactivatedAt)]));

  const byCaller = new Map<string, any>();
  for (const call of calls) {
    const key = idOf(call.by) || "unknown";
    const row = byCaller.get(key) || { callerId: key, name: call.byName || "Unknown", attempts: 0, connected: 0, missed: 0, callbacks: 0, families: new Set<string>(), scores: [] as number[], followUps: 0, saves: 0, leftAfter: new Set<string>() };
    row.attempts += 1;
    if (call.outcome === "connected") {
      row.connected += 1;
      row.families.add(call.familyKey);
      if (typeof call.satisfaction === "number") row.scores.push(call.satisfaction);
      (call.students || []).forEach((studentId: any) => {
        const at = leftAt.get(idOf(studentId));
        if (at && at >= new Date(call.at) && at.getTime() - new Date(call.at).getTime() <= 30 * DAY) row.leftAfter.add(call.familyKey);
      });
    } else if (call.outcome === "callback_requested") row.callbacks += 1;
    else if (["no_answer", "busy", "switched_off"].includes(call.outcome)) row.missed += 1;
    row.followUps += (call.actionItems || []).length;
    byCaller.set(key, row);
  }
  saves.forEach((flag) => {
    const row = byCaller.get(idOf(flag.resolution?.by));
    if (row) row.saves += 1;
  });

  const callers = Array.from(byCaller.values()).map((row) => ({
    callerId: row.callerId,
    name: row.name,
    attempts: row.attempts,
    connected: row.connected,
    missed: row.missed,
    callbacks: row.callbacks,
    connectRate: row.attempts ? Math.round((row.connected / row.attempts) * 100) : 0,
    families: row.families.size,
    averageSatisfaction: row.scores.length ? Math.round((row.scores.reduce((sum: number, value: number) => sum + value, 0) / row.scores.length) * 10) / 10 : null,
    followUps: row.followUps,
    saves: row.saves,
    leftAfterCall: row.leftAfter.size,
  })).sort((a, b) => b.attempts - a.attempts);

  const trendByMonth = new Map(trend.map((row) => [row._id, row]));
  return {
    monthKey: month,
    callers,
    totals: {
      attempts: calls.length,
      connected: connectedCalls.length,
      families: new Set(connectedCalls.map((call) => call.familyKey)).size,
      averageSatisfaction: connectedCalls.some((call) => typeof call.satisfaction === "number")
        ? Math.round((connectedCalls.reduce((sum, call) => sum + (call.satisfaction || 0), 0) / connectedCalls.filter((call) => typeof call.satisfaction === "number").length) * 10) / 10
        : null,
    },
    satisfactionTrend: trendMonths.map((key) => ({ monthKey: key, average: trendByMonth.get(key) ? Math.round(trendByMonth.get(key).average * 10) / 10 : null, calls: trendByMonth.get(key)?.calls || 0 })),
  };
}
