import { Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { BranchAttendance, BranchSlot, BranchStudent, BranchWaitlist } from "@/models/Branch";
import { BRANCH_LABELS, type BranchKey } from "./scope";
import { getBranchSettings } from "./settings";
import { absenceStreak, shiftDateKey, slotLabel } from "./rules";

/**
 * Notices for the people who run a branch (its admin and managers): a seat
 * freed where families are waiting, and a student missing class after class.
 * Models only, so any branch code can call these.
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");

export async function notifyBranchRunners(branch: BranchKey, notice: { type: string; title: string; message: string; href: string; metadata?: Record<string, unknown> }) {
  const staff: any[] = await User.find({ branch, role: "instructor", branchRole: { $in: ["admin", "manager"] }, isActive: { $ne: false } })
    .select("_id")
    .lean();
  if (!staff.length) return;
  await Notification.insertMany(
    staff.map((user) => ({ user: user._id, type: notice.type, title: notice.title, message: notice.message, metadata: { ...(notice.metadata || {}), href: notice.href } }))
  );
}

/** After a seat may have freed up: tell staff about any of these slots that has room and a waitlist. Never throws. */
export async function alertFreedSeats(branch: BranchKey, slotIds: unknown[]) {
  try {
    const ids = [...new Set(slotIds.map(id).filter(Boolean))];
    if (!ids.length) return;
    const slots: any[] = await BranchSlot.find({ _id: { $in: ids }, branch, isActive: true }).lean();
    for (const slot of slots) {
      const waiting: any[] = await BranchWaitlist.find({ slot: slot._id, status: "waiting" }).sort({ createdAt: 1 }).select("name").lean();
      if (!waiting.length) continue;
      const members = await BranchStudent.countDocuments({ branch, status: "active", slots: slot._id });
      const free = slot.capacity - members;
      if (free < 1) continue;
      await notifyBranchRunners(branch, {
        type: "branch_seat_free",
        title: `A seat is free in ${slotLabel(slot)}`,
        message: `${free} seat${free === 1 ? "" : "s"} free in ${slotLabel(slot)} at ${BRANCH_LABELS[branch]}. Waiting: ${waiting.map((entry) => entry.name).join(", ")}.`,
        href: "/bowbazar/slots",
        metadata: { slotId: id(slot) },
      });
    }
  } catch (error) {
    console.error("Branch seat alert failed", error);
  }
}

/** Each student's statuses on registers since `since`, newest first. */
async function statusesSince(branch: BranchKey, since: string, studentIds?: string[]) {
  const registers: any[] = await BranchAttendance.find({
    branch,
    date: { $gte: since },
    ...(studentIds ? { "records.student": { $in: studentIds } } : {}),
  })
    .select("date records.student records.status")
    .sort({ date: -1 })
    .lean();
  const out = new Map<string, string[]>();
  for (const register of registers) {
    for (const record of register.records || []) {
      const key = id(record.student);
      if (studentIds && !studentIds.includes(key)) continue;
      out.set(key, [...(out.get(key) || []), record.status]);
    }
  }
  return out;
}

/**
 * After a register is saved: alert once when a student's run of missed
 * classes reaches the branch's limit (not again for every class after).
 */
export async function alertAbsences(branch: BranchKey, absentStudentIds: string[], date: string) {
  try {
    if (!absentStudentIds.length) return;
    const { absenceAlertAfter } = await getBranchSettings(branch);
    const statuses = await statusesSince(branch, shiftDateKey(date, -120), absentStudentIds);
    const students: any[] = await BranchStudent.find({ _id: { $in: absentStudentIds }, branch, status: "active" }).select("name").lean();
    for (const student of students) {
      if (absenceStreak(statuses.get(id(student)) || []) !== absenceAlertAfter) continue;
      await notifyBranchRunners(branch, {
        type: "branch_absence_streak",
        title: `${student.name} has missed ${absenceAlertAfter} classes in a row`,
        message: `${student.name} has been absent for the last ${absenceAlertAfter} classes at ${BRANCH_LABELS[branch]}. A call to the family may help.`,
        href: "/bowbazar/students",
        metadata: { studentId: id(student) },
      });
    }
  } catch (error) {
    console.error("Branch absence alert failed", error);
  }
}

/** Active students whose recent classes were all missed, at or past the branch's limit, longest run first. */
export async function absentStreaks(branch: BranchKey, today: string) {
  const { absenceAlertAfter } = await getBranchSettings(branch);
  const [statuses, students]: [Map<string, string[]>, any[]] = await Promise.all([
    statusesSince(branch, shiftDateKey(today, -120)),
    BranchStudent.find({ branch, status: "active" }).select("name phone parentName").lean(),
  ]);
  return students
    .map((student) => ({ id: id(student), name: student.name as string, phone: student.phone || "", parentName: student.parentName || "", missed: absenceStreak(statuses.get(id(student)) || []) }))
    .filter((entry) => entry.missed >= absenceAlertAfter)
    .sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name));
}
