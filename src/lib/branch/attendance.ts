import "server-only";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { academyDateTime } from "@/lib/academyTime";
import { recordActivity } from "@/lib/activity";
import { notifyHomeworkAssigned } from "@/lib/homeworkEmail";
import { cancelHomeworkDeadlineReminders } from "@/lib/homeworkEmailReminders";
import { escapeRegex } from "@/lib/loginIdentity";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Homework, Submission } from "@/models/Homework";
import { BranchAttendance, BranchSlot, BranchStudent } from "@/models/Branch";
import type { BranchKey } from "./scope";
import { BranchError } from "./service";
import {
  DAY_NAMES,
  buildRoster,
  dayOfDateKey,
  isAttendanceStatus,
  isDateKey,
  registerCounts,
  shiftDateKey,
  slotLabel,
  todayKey,
} from "./rules";

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);

type Actor = { id: string; name?: string };

async function findSlot(branch: BranchKey, slotId: string) {
  if (!isObjectId(slotId)) throw new BranchError("Class time not found.", 404);
  const slot: any = await BranchSlot.findOne({ _id: slotId, branch }).lean();
  if (!slot) throw new BranchError("Class time not found.", 404);
  return slot;
}

function checkDay(slot: any, date: string) {
  if (!isDateKey(date)) throw new BranchError("Pick a date.");
  if (dayOfDateKey(date) !== slot.dayOfWeek) {
    throw new BranchError(`This class runs on ${DAY_NAMES[slot.dayOfWeek]}s, and ${date} is a ${DAY_NAMES[dayOfDateKey(date)]}.`);
  }
}

/** Homework set in a register, with who has done it. */
async function homeworkFor(filter: Record<string, unknown>, nameByUser: Map<string, { studentId: string; name: string }>) {
  const homework: any[] = await Homework.find(filter)
    .select("title assignedStudents dueAt sourceTemplate activities.type branchAttendance createdAt")
    .sort({ createdAt: 1 })
    .lean();
  if (!homework.length) return [];
  const submissions: any[] = await Submission.find({ homework: { $in: homework.map((item) => item._id) } })
    .select("homework student totalScore accuracy answers.needsReview")
    .lean();
  const byKey = new Map(submissions.map((submission) => [`${id(submission.homework)}:${id(submission.student)}`, submission]));
  return homework.map((item) => ({
    id: id(item),
    title: item.title as string,
    templateId: id(item.sourceTemplate),
    dueAt: item.dueAt || null,
    activityCount: (item.activities || []).length,
    students: (item.assignedStudents || []).map((userId: any) => {
      const submission = byKey.get(`${id(item)}:${id(userId)}`);
      const who = nameByUser.get(id(userId));
      return {
        userId: id(userId),
        studentId: who?.studentId || "",
        name: who?.name || "Student",
        submitted: Boolean(submission),
        accuracy: submission ? Number(submission.accuracy || 0) : null,
        needsReview: Boolean(submission?.answers?.some((answer: any) => answer?.needsReview)),
      };
    }),
  }));
}

// ---------------------------------------------------------------------------
// The day's registers
// ---------------------------------------------------------------------------

/** Every class on a date with how far its register has got. */
export async function registerDay(branch: BranchKey, date: string) {
  if (!isDateKey(date)) throw new BranchError("Pick a date.");
  await dbConnect();
  const [slots, registers, members] = await Promise.all([
    BranchSlot.find({ branch, dayOfWeek: dayOfDateKey(date) }).lean(),
    BranchAttendance.find({ branch, date }).select("slot records.status homework updatedByName updatedAt").lean(),
    BranchStudent.find({ branch, status: "active" }).select("slots").lean(),
  ]);
  const registerBySlot = new Map((registers as any[]).map((register) => [id(register.slot), register]));
  const memberCount = new Map<string, number>();
  for (const student of members as any[]) {
    for (const slot of student.slots || []) memberCount.set(id(slot), (memberCount.get(id(slot)) || 0) + 1);
  }
  return {
    date,
    today: todayKey(),
    classes: (slots as any[])
      // A closed slot drops off the list, unless it was taught that day.
      .filter((slot) => slot.isActive !== false || registerBySlot.has(id(slot)))
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((slot) => {
        const register: any = registerBySlot.get(id(slot));
        return {
          slotId: id(slot),
          label: slotLabel(slot),
          startTime: slot.startTime,
          endTime: slot.endTime,
          mode: slot.mode,
          members: memberCount.get(id(slot)) || 0,
          saved: Boolean(register),
          counts: register ? registerCounts(register.records || []) : null,
          homework: register ? (register.homework || []).length : 0,
          updatedByName: register?.updatedByName || "",
          updatedAt: register?.updatedAt || null,
        };
      }),
  };
}

/** Past topics per student, newest first, from registers before `date`. */
async function recentTopics(branch: BranchKey, studentIds: string[], date: string) {
  const out = new Map<string, { date: string; topic: string }[]>();
  if (!studentIds.length) return out;
  const registers: any[] = await BranchAttendance.find({ branch, "records.student": { $in: studentIds }, date: { $lt: date } })
    .select("date records.student records.topic")
    .sort({ date: -1 })
    .limit(300)
    .lean();
  const wanted = new Set(studentIds);
  for (const register of registers) {
    for (const record of register.records || []) {
      const key = id(record.student);
      if (!wanted.has(key) || !record.topic) continue;
      const list = out.get(key) || [];
      if (list.length < 3) list.push({ date: register.date, topic: record.topic });
      out.set(key, list);
    }
  }
  return out;
}

/** Topics the centre has used lately, most used first: the register's suggestions. */
async function topicSuggestions(branch: BranchKey, date: string) {
  const registers: any[] = await BranchAttendance.find({ branch, date: { $gte: shiftDateKey(date, -120) } })
    .select("records.topic")
    .lean();
  const counts = new Map<string, { topic: string; count: number }>();
  for (const register of registers) {
    for (const record of register.records || []) {
      const topic = text(record.topic, 200);
      if (!topic) continue;
      const key = topic.toLowerCase();
      const entry = counts.get(key) || { topic, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic)).slice(0, 80).map((entry) => entry.topic);
}

export async function getRegister(branch: BranchKey, slotId: string, date: string) {
  await dbConnect();
  const slot = await findSlot(branch, slotId);
  checkDay(slot, date);
  const [register, members, everyone]: [any, any[], any[]] = await Promise.all([
    BranchAttendance.findOne({ slot: slot._id, date }).lean(),
    BranchStudent.find({ branch, status: "active", slots: slot._id }).select("name regNo user").lean(),
    BranchStudent.find({ branch, status: "active" }).select("name regNo user slots").sort({ name: 1 }).lean(),
  ]);
  const studentById = new Map(everyone.map((student) => [id(student), student]));
  const roster = buildRoster(
    members.map((student) => ({ id: id(student), name: student.name as string })),
    ((register?.records || []) as any[]).map((record) => ({ ...record, student: id(record.student) })),
  );
  const memberIds = new Set(members.map((student) => id(student)));
  const recordedIds = roster.recorded.map((record: any) => record.student);
  const topics = await recentTopics(branch, [...recordedIds, ...roster.unmarked.map((member) => member.id)], date);

  const rows = [
    ...roster.recorded.map((record: any) => {
      const student = studentById.get(record.student);
      return {
        studentId: record.student,
        userId: id(record.user || student?.user),
        name: student?.name || record.name || "Student",
        regNo: student?.regNo || "",
        member: memberIds.has(record.student),
        guest: Boolean(record.guest),
        // A student who has since left still shows on the register they sat in.
        left: !student,
        status: record.status as string,
        topic: record.topic || "",
        note: record.note || "",
        homeworkNote: record.homeworkNote || "",
        recentTopics: topics.get(record.student) || [],
      };
    }),
    ...roster.unmarked.map((member) => {
      const student = studentById.get(member.id);
      return {
        studentId: member.id,
        userId: id(student?.user),
        name: member.name,
        regNo: student?.regNo || "",
        member: true,
        guest: false,
        left: false,
        status: "",
        topic: "",
        note: "",
        homeworkNote: "",
        recentTopics: topics.get(member.id) || [],
      };
    }),
  ];
  const onRegister = new Set(rows.map((row) => row.studentId));
  const nameByUser = new Map(rows.map((row) => [row.userId, { studentId: row.studentId, name: row.name }]));

  return {
    date,
    today: todayKey(),
    slot: { id: id(slot), label: slotLabel(slot), mode: slot.mode, dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, isActive: slot.isActive !== false },
    saved: Boolean(register),
    markedByName: register?.markedByName || "",
    updatedByName: register?.updatedByName || "",
    updatedAt: register?.updatedAt || null,
    rows,
    // Other active students, to sit in for the day (a make-up or a swap).
    others: everyone
      .filter((student) => !onRegister.has(id(student)))
      .map((student) => ({ studentId: id(student), name: student.name as string, regNo: student.regNo || "" })),
    homework: register ? await homeworkFor({ branchAttendance: register._id }, nameByUser) : [],
    topicSuggestions: await topicSuggestions(branch, date),
    // Due the day before this class meets again.
    defaultDueDate: shiftDateKey(date, 6),
  };
}

/**
 * Saves the whole register for a class on a day. `rows` is the full list: a
 * row without a status is left off, so a guest added by mistake can be dropped.
 */
export async function saveRegister(branch: BranchKey, slotId: string, date: string, input: any, actor: Actor) {
  await dbConnect();
  const slot = await findSlot(branch, slotId);
  checkDay(slot, date);
  if (date > todayKey()) throw new BranchError("The register can't be taken for a day that hasn't come yet.");

  const rows = (Array.isArray(input?.rows) ? input.rows : []).filter((row: any) => row && row.status);
  if (!rows.length) throw new BranchError("Mark at least one student.");
  if (rows.length > 60) throw new BranchError("Too many students on one register.");
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isObjectId(row.studentId)) throw new BranchError("Student not found.", 404);
    if (!isAttendanceStatus(row.status)) throw new BranchError("Pick present, late, absent or excused.");
    if (seen.has(row.studentId)) throw new BranchError("A student appears twice on the register.");
    seen.add(row.studentId);
  }

  const existing: any = await BranchAttendance.findOne({ slot: slot._id, date }).lean();
  const earlier = new Map(((existing?.records || []) as any[]).map((record) => [id(record.student), record]));
  const students: any[] = await BranchStudent.find({ _id: { $in: [...seen] }, branch }).select("name user slots status").lean();
  const studentById = new Map(students.map((student) => [id(student), student]));
  for (const row of rows) {
    const student = studentById.get(row.studentId);
    if (!student) throw new BranchError("Student not found.", 404);
    // Someone who has left can stay on a register they were already on, but
    // can't be newly added to one.
    if (student.status !== "active" && !earlier.has(row.studentId)) throw new BranchError(`${student.name} is not an active student.`);
  }

  const records = rows.map((row: any) => {
    const student = studentById.get(row.studentId);
    const member = (student.slots || []).some((slotRef: any) => id(slotRef) === id(slot));
    return {
      student: student._id,
      user: student.user,
      name: student.name,
      status: row.status,
      // Nothing was taught to someone who wasn't there.
      topic: row.status === "present" || row.status === "late" ? text(row.topic, 200) : "",
      note: text(row.note, 500),
      homeworkNote: text(row.homeworkNote, 500),
      guest: !member,
    };
  });

  const update = {
    $set: { branch, slotLabel: slotLabel(slot), mode: slot.mode, records, updatedBy: actor.id, updatedByName: actor.name || "" },
    $setOnInsert: { markedBy: actor.id, markedByName: actor.name || "" },
  };
  try {
    await BranchAttendance.updateOne({ slot: slot._id, date }, update, { upsert: true });
  } catch (error: any) {
    // Two people saving the first copy together: the loser updates the winner's.
    if (error?.code !== 11000) throw error;
    await BranchAttendance.updateOne({ slot: slot._id, date }, update);
  }

  void recordActivity({
    actor: actor.id,
    type: "branch.attendance_saved",
    label: `${existing ? "Updated" : "Took"} the ${slotLabel(slot)} register for ${date}`,
    entityType: "BranchAttendance",
    entityId: `${id(slot)}:${date}`,
    metadata: { branch, ...registerCounts(records) },
  });
  return getRegister(branch, slotId, date);
}

// ---------------------------------------------------------------------------
// Homework from the register
// ---------------------------------------------------------------------------

/** The academy's homework templates, to set from the register. */
export async function searchTemplates(query: string) {
  await dbConnect();
  const q = text(query, 80);
  const match: any = { isActive: true };
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    match.$or = [{ title: pattern }, { topicName: pattern }, { levelName: pattern }, { courseName: pattern }];
  }
  const templates: any[] = await AssignmentTemplate.aggregate([
    { $match: match },
    { $sort: { updatedAt: -1 } },
    { $limit: 25 },
    {
      $project: {
        title: 1,
        topicName: 1,
        levelName: 1,
        courseName: 1,
        activityCount: { $size: { $ifNull: ["$activities", []] } },
      },
    },
  ]);
  return templates.map((template) => ({
    id: id(template),
    title: template.title as string,
    topicName: template.topicName || "",
    levelName: template.levelName || "",
    courseName: template.courseName || "",
    activityCount: Number(template.activityCount || 0),
  }));
}

function homeworkType(activities: any[]) {
  if (activities.some((activity) => activity?.type === "study_pgn")) return "pgn_study";
  if (activities.some((activity) => activity?.type === "quiz" || activity?.type === "written_answer")) return "quiz";
  return "puzzle_set";
}

/**
 * Sets a template as homework for students on a saved register. Setting the
 * same template again on the same register adds students to the one copy.
 */
export async function assignHomework(branch: BranchKey, slotId: string, date: string, input: any, actor: Actor) {
  await dbConnect();
  const slot = await findSlot(branch, slotId);
  checkDay(slot, date);
  const register: any = await BranchAttendance.findOne({ slot: slot._id, date }).lean();
  if (!register) throw new BranchError("Save the register first, then set homework.");
  if (!isObjectId(input?.templateId)) throw new BranchError("Pick the homework to set.");
  const template: any = await AssignmentTemplate.findOne({ _id: input.templateId, isActive: true }).lean();
  if (!template) throw new BranchError("That homework is no longer available.", 404);

  const studentIds: string[] = (Array.isArray(input?.studentIds) ? input.studentIds : []).filter(isObjectId);
  if (!studentIds.length) throw new BranchError("Pick at least one student.");
  const onRegister = new Map(((register.records || []) as any[]).map((record) => [id(record.student), record]));
  const userIds: string[] = [];
  for (const studentId of studentIds) {
    const record = onRegister.get(studentId);
    if (!record) throw new BranchError("Homework can only go to students on this register.");
    if (record.user) userIds.push(id(record.user));
  }
  if (!userIds.length) throw new BranchError("Those students have no login yet.");

  const dueDate = input?.dueDate ? String(input.dueDate) : shiftDateKey(date, 6);
  if (!isDateKey(dueDate)) throw new BranchError("Pick a due date.");
  if (dueDate < todayKey()) throw new BranchError("The due date has already passed.");
  const dueAt = academyDateTime(dueDate, "23:59");

  const key = { branchAttendance: register._id, sourceTemplate: template._id };
  let homework: any = await Homework.findOne(key).lean();
  let newUserIds = userIds;
  if (homework) {
    const already = new Set(((homework.assignedStudents || []) as any[]).map(id));
    newUserIds = userIds.filter((userId) => !already.has(userId));
    await Homework.updateOne(key, { $addToSet: { assignedStudents: { $each: newUserIds } }, $set: { dueAt } });
  } else {
    try {
      homework = await Homework.create({
        ...key,
        branch,
        instructor: actor.id,
        type: homeworkType(template.activities || []),
        title: template.title,
        description: template.description,
        instructions: template.instructions,
        assignedStudents: userIds,
        assignedBatches: [],
        assignAllStudents: false,
        puzzles: JSON.parse(JSON.stringify(template.puzzles || [])),
        activities: JSON.parse(JSON.stringify(template.activities || [])),
        dueAt,
        numberOfAttempts: template.numberOfAttempts || 1,
        timeLimitMinutes: template.timeLimitMinutes || 0,
        scoring: template.scoring || undefined,
        isPublished: true,
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      return assignHomework(branch, slotId, date, input, actor);
    }
    homework = homework.toObject();
    await BranchAttendance.updateOne({ _id: register._id }, { $addToSet: { homework: homework._id } });
  }

  if (newUserIds.length) {
    // Only the students just added hear about it.
    void notifyHomeworkAssigned({ ...homework, dueAt, assignedStudents: newUserIds, assignedBatches: [], assignAllStudents: false }).catch((error) =>
      console.error("Branch homework notification failed", error)
    );
    void recordActivity({
      actor: actor.id,
      type: "homework.created",
      label: `Set homework ${template.title} for ${newUserIds.length} Bowbazar student${newUserIds.length === 1 ? "" : "s"}`,
      entityType: "Homework",
      entityId: id(homework),
      metadata: { branch, slot: id(slot), date, assignedStudents: newUserIds.length, source: "branch_register" },
    });
  }
  return getRegister(branch, slotId, date);
}

/** Takes one student off a piece of branch homework they haven't done; the last one off removes it. */
export async function unassignHomework(branch: BranchKey, homeworkId: string, userId: string) {
  await dbConnect();
  if (!isObjectId(homeworkId) || !isObjectId(userId)) throw new BranchError("Homework not found.", 404);
  const homework: any = await Homework.findOne({ _id: homeworkId, branch }).lean();
  if (!homework) throw new BranchError("Homework not found.", 404);
  if (await Submission.exists({ homework: homework._id, student: userId })) {
    throw new BranchError("This student has already done it, so it stays on their record.");
  }
  const remaining = ((homework.assignedStudents || []) as any[]).map(id).filter((value) => value !== userId);
  if (!remaining.length && !(await Submission.exists({ homework: homework._id }))) {
    await Homework.deleteOne({ _id: homework._id });
    await BranchAttendance.updateOne({ _id: homework.branchAttendance }, { $pull: { homework: homework._id } });
    await cancelHomeworkDeadlineReminders(homework._id, "Homework was removed from the register.");
  } else {
    await Homework.updateOne({ _id: homework._id }, { $pull: { assignedStudents: new Types.ObjectId(userId) } });
  }
  const register: any = await BranchAttendance.findById(homework.branchAttendance).select("slot date").lean();
  return register ? getRegister(branch, id(register.slot), register.date) : null;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** One student's classes: what was taught, attendance and homework. */
export async function studentHistory(branch: BranchKey, studentId: string) {
  await dbConnect();
  if (!isObjectId(studentId)) throw new BranchError("Student not found.", 404);
  const student: any = await BranchStudent.findOne({ _id: studentId, branch }).select("name user").lean();
  if (!student) throw new BranchError("Student not found.", 404);
  return classLog(branch, student, 100);
}

async function classLog(branch: BranchKey, student: any, limit: number) {
  const registers: any[] = await BranchAttendance.find({ branch, "records.student": student._id })
    .select("date slotLabel mode records")
    .sort({ date: -1 })
    .limit(limit)
    .lean();
  const classes = registers.map((register) => {
    const record = (register.records || []).find((item: any) => id(item.student) === id(student));
    return {
      date: register.date as string,
      slotLabel: register.slotLabel || "",
      mode: register.mode || "offline",
      status: record?.status || "",
      topic: record?.topic || "",
      note: record?.note || "",
      homeworkNote: record?.homeworkNote || "",
      guest: Boolean(record?.guest),
    };
  });
  const userId = id(student.user);
  const nameByUser = new Map([[userId, { studentId: id(student), name: student.name as string }]]);
  const homework = student.user
    ? (await homeworkFor({ branch, assignedStudents: student.user }, nameByUser)).reverse().map((item) => {
        const mine = item.students.find((entry: any) => entry.userId === userId);
        return { id: item.id, title: item.title, dueAt: item.dueAt, submitted: Boolean(mine?.submitted), accuracy: mine?.accuracy ?? null };
      })
    : [];
  const since = shiftDateKey(todayKey(), -30);
  return {
    name: student.name as string,
    classes,
    homework: homework.slice(0, 50),
    summary: registerCounts(classes),
    lastMonth: registerCounts(classes.filter((item) => item.date >= since)),
  };
}

/** The student's own page: recent classes and homework. */
export async function myClassLog(userId: string) {
  await dbConnect();
  const student: any = await BranchStudent.findOne({ user: userId }).select("name user branch").lean();
  if (!student) return null;
  return classLog(student.branch, student, 12);
}

/** Every piece of homework the branch has set, newest first, with how many have done it. */
export async function branchHomework(branch: BranchKey) {
  await dbConnect();
  const homework: any[] = await Homework.find({ branch })
    .select("title assignedStudents dueAt branchAttendance createdAt")
    .sort({ createdAt: -1 })
    .limit(150)
    .lean();
  const [registers, submissions]: [any[], any[]] = await Promise.all([
    BranchAttendance.find({ _id: { $in: homework.map((item) => item.branchAttendance).filter(Boolean) } }).select("date slotLabel").lean(),
    Submission.find({ homework: { $in: homework.map((item) => item._id) } }).select("homework answers.needsReview").lean(),
  ]);
  const registerById = new Map(registers.map((register) => [id(register), register]));
  const done = new Map<string, { submitted: number; needsReview: number }>();
  for (const submission of submissions) {
    const entry = done.get(id(submission.homework)) || { submitted: 0, needsReview: 0 };
    entry.submitted += 1;
    if ((submission.answers || []).some((answer: any) => answer?.needsReview)) entry.needsReview += 1;
    done.set(id(submission.homework), entry);
  }
  return homework.map((item) => {
    const register = registerById.get(id(item.branchAttendance));
    const counts = done.get(id(item)) || { submitted: 0, needsReview: 0 };
    return {
      id: id(item),
      title: item.title as string,
      date: register?.date || "",
      slotLabel: register?.slotLabel || "",
      dueAt: item.dueAt || null,
      assigned: (item.assignedStudents || []).length,
      ...counts,
    };
  });
}
