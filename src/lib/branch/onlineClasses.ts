import "server-only";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { User } from "@/models/User";
import { BranchSlot, BranchStudent, OLD_SLOT_TIME_INDEX } from "@/models/Branch";
import type { BranchKey } from "./scope";
import { BranchError } from "./errors";
import { DAY_NAMES, WEEK_ORDER, isTime, slotLabel, todayKey, dayOfDateKey } from "./rules";

/**
 * The branch's online classes (Online Classes screen). Each one is an online
 * BranchSlot with a name, a coach and its students: one weekly meeting. A
 * class that meets on two days is two of them, made together. Registers,
 * moves, holidays and the live room work on them as on any slot.
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);

type Actor = { id: string; name?: string };

let indexesChecked: Promise<void> | null = null;

/**
 * Drops the old index that allowed one slot per day and time whatever the
 * mode, so online classes can share a time with the centre (and each other).
 * Mongoose builds the new partial index itself. Runs once per process.
 */
export function ensureBranchSlotIndexes() {
  indexesChecked ||= (async () => {
    try {
      const indexes = await BranchSlot.collection.indexes();
      if (indexes.some((index) => index.name === OLD_SLOT_TIME_INDEX)) {
        await BranchSlot.collection.dropIndex(OLD_SLOT_TIME_INDEX);
        await BranchSlot.createIndexes();
      }
    } catch (error: any) {
      // No collection yet (code 26) means no old index either.
      if (error?.code !== 26) {
        indexesChecked = null;
        throw error;
      }
    }
  })();
  return indexesChecked;
}

async function branchStaff(branch: BranchKey) {
  const staff: any[] = await User.find({ branch, role: "instructor", isActive: { $ne: false } })
    .select("name branchRole")
    .sort({ name: 1 })
    .lean();
  return staff.map((user) => ({ id: id(user), name: String(user.name || "Coach"), role: String(user.branchRole || "coach") }));
}

export async function listOnlineClasses(branch: BranchKey) {
  await dbConnect();
  const [slots, students, coaches]: [any[], any[], Awaited<ReturnType<typeof branchStaff>>] = await Promise.all([
    BranchSlot.find({ branch, mode: "online" }).lean(),
    BranchStudent.find({ branch, status: "active" }).select("name regNo slots user courseName courseLevelName").sort({ name: 1 }).lean(),
    branchStaff(branch),
  ]);
  const coachName = new Map(coaches.map((coach) => [coach.id, coach.name]));
  const missingCoaches = slots.map((slot) => id(slot.coach)).filter((coach) => coach && !coachName.has(coach));
  if (missingCoaches.length) {
    // A coach since switched off still shows on the class they were given.
    const extra: any[] = await User.find({ _id: { $in: missingCoaches }, branch }).select("name").lean();
    for (const user of extra) coachName.set(id(user), String(user.name || "Coach"));
  }
  const today = todayKey();
  const todayDay = dayOfDateKey(today);
  const classes = slots
    .sort(
      (a, b) =>
        Number(b.isActive !== false) - Number(a.isActive !== false) ||
        WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) ||
        a.startTime.localeCompare(b.startTime)
    )
    .map((slot) => {
      const seated = students.filter((student) => (student.slots || []).some((ref: any) => id(ref) === id(slot)));
      return {
        id: id(slot),
        name: slot.name || "",
        label: slotLabel(slot),
        dayOfWeek: slot.dayOfWeek as number,
        startTime: slot.startTime as string,
        endTime: slot.endTime as string,
        capacity: slot.capacity as number,
        meetingUrl: slot.meetingUrl || "",
        isActive: slot.isActive !== false,
        coach: slot.coach ? { id: id(slot.coach), name: coachName.get(id(slot.coach)) || "Coach" } : null,
        students: seated.map((student) => ({ id: id(student), name: student.name as string, regNo: student.regNo || "", hasLogin: Boolean(student.user) })),
        meetsToday: slot.isActive !== false && slot.dayOfWeek === todayDay,
      };
    });
  return {
    today,
    classes,
    coaches,
    students: students.map((student) => ({
      id: id(student),
      name: student.name as string,
      regNo: student.regNo || "",
      level: [student.courseName, student.courseLevelName].filter(Boolean).join(" - "),
    })),
  };
}

async function checkCoach(branch: BranchKey, coachId: unknown) {
  if (!coachId) return null;
  if (!isObjectId(coachId)) throw new BranchError("Pick a coach from the list.");
  const coach = await User.exists({ _id: coachId, branch, role: "instructor", isActive: { $ne: false } });
  if (!coach) throw new BranchError("That coach is not on the branch staff.");
  return new Types.ObjectId(coachId as string);
}

async function checkStudents(branch: BranchKey, input: unknown, capacity: number) {
  const studentIds = [...new Set((Array.isArray(input) ? input : []).map(String))];
  if (studentIds.some((studentId) => !isObjectId(studentId))) throw new BranchError("Pick students from the list.");
  if (studentIds.length > capacity) throw new BranchError(`This class has ${capacity} seats and ${studentIds.length} students were picked.`);
  const found = await BranchStudent.countDocuments({ _id: { $in: studentIds }, branch, status: "active" });
  if (found !== studentIds.length) throw new BranchError("One of the picked students has left or is not in this branch.");
  return studentIds;
}

/** Makes `studentIds` exactly the class's students. */
async function seatStudents(branch: BranchKey, slotId: Types.ObjectId, studentIds: string[]) {
  await BranchStudent.updateMany({ branch, slots: slotId, _id: { $nin: studentIds } }, { $pull: { slots: slotId } });
  if (studentIds.length) await BranchStudent.updateMany({ branch, _id: { $in: studentIds } }, { $addToSet: { slots: slotId } });
}

function classFields(input: any) {
  const name = text(input?.name, 80);
  if (!name) throw new BranchError("Give the class a name, for example the student's name or the level.");
  if (!isTime(input?.startTime) || !isTime(input?.endTime)) throw new BranchError("Enter start and end times.");
  if (input.endTime <= input.startTime) throw new BranchError("The class must end after it starts.");
  const capacity = Math.round(Number(input?.capacity ?? 7));
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > 50) throw new BranchError("Seats must be between 1 and 50.");
  const meetingUrl = text(input?.meetingUrl, 500);
  if (meetingUrl && !/^https:\/\//i.test(meetingUrl)) throw new BranchError("The meeting link must start with https://");
  return { name, startTime: input.startTime as string, endTime: input.endTime as string, capacity, meetingUrl };
}

/** Creates a class: one online slot for each day picked, all with the same coach and students. */
export async function createOnlineClass(branch: BranchKey, input: any, actor: Actor) {
  await dbConnect();
  await ensureBranchSlotIndexes();
  const fields = classFields(input);
  const days = [...new Set<number>((Array.isArray(input?.days) ? input.days : []).map(Number))].filter(
    (day) => Number.isInteger(day) && day >= 0 && day <= 6
  );
  if (!days.length) throw new BranchError("Pick at least one day.");
  const coach = await checkCoach(branch, input?.coachId);
  const studentIds = await checkStudents(branch, input?.studentIds, fields.capacity);
  const clash = await BranchSlot.findOne({ branch, mode: "online", name: fields.name, dayOfWeek: { $in: days }, startTime: fields.startTime }).lean();
  if (clash) throw new BranchError(`"${fields.name}" already meets at that time.`, 409);

  const created: any[] = await BranchSlot.insertMany(
    days.map((dayOfWeek) => ({ branch, mode: "online", isActive: true, dayOfWeek, ...fields, ...(coach ? { coach } : {}) }))
  );
  for (const slot of created) await seatStudents(branch, slot._id, studentIds);
  void recordActivity({
    actor: actor.id,
    type: "branch.online_class_created",
    label: `Created the online class ${fields.name} (${created.map((slot) => DAY_NAMES[slot.dayOfWeek].slice(0, 3)).join(", ")})`,
    entityType: "BranchSlot",
    entityId: id(created[0]),
    metadata: { branch, students: studentIds.length },
  });
  return created.map((slot) => id(slot));
}

/** Edits one class (one weekly meeting). Switching it off takes its students out. */
export async function updateOnlineClass(branch: BranchKey, slotId: string, input: any, actor: Actor) {
  await dbConnect();
  await ensureBranchSlotIndexes();
  if (!isObjectId(slotId)) throw new BranchError("Class not found.", 404);
  const slot: any = await BranchSlot.findOne({ _id: slotId, branch, mode: "online" }).lean();
  if (!slot) throw new BranchError("Class not found.", 404);
  const fields = classFields(input);
  const dayOfWeek = Number(input?.dayOfWeek ?? slot.dayOfWeek);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) throw new BranchError("Choose a day.");
  const isActive = input?.isActive !== false;
  const coach = await checkCoach(branch, input?.coachId);
  const studentIds = isActive ? await checkStudents(branch, input?.studentIds, fields.capacity) : [];

  await BranchSlot.updateOne(
    { _id: slot._id },
    coach ? { $set: { ...fields, dayOfWeek, isActive, coach } } : { $set: { ...fields, dayOfWeek, isActive }, $unset: { coach: 1 } }
  );
  await seatStudents(branch, slot._id, studentIds);
  void recordActivity({
    actor: actor.id,
    type: "branch.online_class_updated",
    label: `${isActive ? "Updated" : "Switched off"} the online class ${fields.name}`,
    entityType: "BranchSlot",
    entityId: id(slot),
    metadata: { branch, students: studentIds.length },
  });
}
