import "server-only";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { BranchSlot, BranchSlotChange, BranchStudent } from "@/models/Branch";
import { BRANCH_LABELS, type BranchKey } from "./scope";
import { BranchError, assertSeats } from "./service";
import { alertFreedSeats } from "./alerts";
import { holidayFor } from "./comms";
import { WEEK_ORDER, isDateKey, slotLabel, todayKey } from "./rules";
import { sameWeekDate, seatsTakenOn, slotsAfterChange, weekMoveProblem, type ChangeType } from "./changeRules";

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);

export type ChangeActor = { id: string; name?: string; staff: boolean };

const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

/** Members of a slot right now. */
async function memberCount(branch: BranchKey, slotId: unknown) {
  return BranchStudent.countDocuments({ branch, status: "active", slots: slotId });
}

/** Seats taken in a slot on one date, counting approved one-week moves in and out. */
export async function seatsOnDate(branch: BranchKey, slot: any, date: string) {
  const [members, away, visiting] = await Promise.all([
    memberCount(branch, slot._id),
    BranchSlotChange.countDocuments({ branch, type: "week", status: "approved", fromSlot: slot._id, fromDate: date }),
    BranchSlotChange.countDocuments({ branch, type: "week", status: "approved", toSlot: slot._id, toDate: date }),
  ]);
  const taken = seatsTakenOn(members, away, visiting);
  return { taken, free: Math.max(0, slot.capacity - taken) };
}

/** Open slots in the centre's week order, Monday first. */
async function activeSlots(branch: BranchKey) {
  const slots = (await BranchSlot.find({ branch, isActive: true }).lean()) as any[];
  return slots.sort((a, b) => WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime));
}

/**
 * What a student can move to. For a one-week move, each other slot's date in
 * the same week and its free seats that day; for a permanent change, the
 * free seats left in each slot.
 */
export async function changeOptions(branch: BranchKey, student: any, input: { type: ChangeType; fromSlot?: string; fromDate?: string }) {
  const own = new Set((student.slots || []).map(id));
  const slots = (await activeSlots(branch)).filter((slot) => !own.has(id(slot)));
  const today = todayKey();
  if (input.type === "week") {
    if (!input.fromDate || !isDateKey(input.fromDate)) return [];
    const fromDate = input.fromDate;
    return Promise.all(
      slots.map(async (slot) => {
        const date = sameWeekDate(fromDate, slot.dayOfWeek);
        const [{ free }, holiday] = await Promise.all([seatsOnDate(branch, slot, date), holidayFor(branch, slot._id, date)]);
        // A class the centre has closed that day has no seat to move into.
        return { slotId: id(slot), label: slotLabel(slot), mode: slot.mode, date, free: holiday ? 0 : free, past: date < today, holiday };
      })
    );
  }
  return Promise.all(
    slots.map(async (slot) => {
      const members = await memberCount(branch, slot._id);
      return { slotId: id(slot), label: slotLabel(slot), mode: slot.mode, date: "", free: Math.max(0, slot.capacity - members), past: false };
    })
  );
}

// ---------------------------------------------------------------------------
// Asking, deciding, undoing
// ---------------------------------------------------------------------------

function serialize(change: any) {
  return {
    id: id(change),
    studentId: id(change.student),
    studentName: change.studentName || "",
    type: change.type as ChangeType,
    fromSlot: change.fromSlot ? id(change.fromSlot) : "",
    toSlot: id(change.toSlot),
    fromLabel: change.fromLabel || "",
    toLabel: change.toLabel || "",
    fromDate: change.fromDate || "",
    toDate: change.toDate || "",
    reason: change.reason || "",
    status: change.status as string,
    requestedByName: change.requestedByName || "",
    requestedByStaff: Boolean(change.requestedByStaff),
    decidedByName: change.decidedByName || "",
    decidedAt: change.decidedAt || null,
    decisionNote: change.decisionNote || "",
    createdAt: change.createdAt,
  };
}

/** One line a family or a coach can read: "Wed 5pm–6pm on Wed, 28 Oct → Sat 10am–11am on Sat, 31 Oct". */
export function describeChange(change: { type: string; fromLabel?: string; toLabel?: string; fromDate?: string; toDate?: string }) {
  if (change.type === "week") {
    return `${change.fromLabel} on ${longDate(change.fromDate!)} → ${change.toLabel} on ${longDate(change.toDate!)}`;
  }
  return change.fromLabel ? `${change.fromLabel} → ${change.toLabel} from now on` : `${change.toLabel} added from now on`;
}

async function findSlot(branch: BranchKey, slotId: unknown) {
  if (!isObjectId(slotId)) throw new BranchError("Pick a class time.");
  const slot: any = await BranchSlot.findOne({ _id: slotId, branch }).lean();
  if (!slot) throw new BranchError("That class time does not exist.", 404);
  return slot;
}

/** Throws unless the move still has a seat. Checked when asked for and again when approved. */
async function assertRoom(branch: BranchKey, student: any, change: { type: ChangeType; toSlot: any; toDate?: string; fromSlot?: string | null }) {
  if (change.type === "week") {
    const { free } = await seatsOnDate(branch, change.toSlot, change.toDate!);
    if (free < 1) throw new BranchError(`${slotLabel(change.toSlot)} is full on ${longDate(change.toDate!)}.`, 409);
    return;
  }
  const next = slotsAfterChange((student.slots || []).map(id), change.fromSlot || null, id(change.toSlot));
  await assertSeats(branch, next, id(student));
}

/**
 * A family asks for a change (pending), or staff make one (approved at once,
 * seats checked). `fromSlot` is the class given up; for a one-week move,
 * `fromDate` is the day of that class being missed.
 */
export async function requestChange(branch: BranchKey, student: any, input: any, actor: ChangeActor) {
  await dbConnect();
  if (student.status !== "active") throw new BranchError("Only active students can change class times.");
  const type: ChangeType = input?.type === "permanent" ? "permanent" : "week";
  const toSlot = await findSlot(branch, input?.toSlot);
  if (toSlot.isActive === false) throw new BranchError("That class time is closed.");
  const own = (student.slots || []).map(id);
  const fromSlotId = input?.fromSlot ? String(input.fromSlot) : "";
  const fromSlot = fromSlotId ? await findSlot(branch, fromSlotId) : null;
  const reason = text(input?.reason, 300);
  const today = todayKey();

  let fromDate = "";
  let toDate = "";
  if (type === "week") {
    if (!fromSlot) throw new BranchError("Pick the class you'll miss.");
    fromDate = String(input?.fromDate || "");
    if (!isDateKey(fromDate)) throw new BranchError("Pick the date of the class you'll miss.");
    toDate = sameWeekDate(fromDate, toSlot.dayOfWeek);
    const problem = weekMoveProblem({
      today,
      fromDate,
      toDate,
      fromDay: fromSlot.dayOfWeek,
      memberOfFrom: own.includes(id(fromSlot)),
      memberOfTo: own.includes(id(toSlot)),
      sameSlot: id(fromSlot) === id(toSlot),
    });
    if (problem) throw new BranchError(problem);
    const closed = await holidayFor(branch, toSlot._id, toDate);
    if (closed) throw new BranchError(`The centre is closed for ${slotLabel(toSlot)} that week (${closed}).`);
    const clash = await BranchSlotChange.exists({ student: student._id, type: "week", fromSlot: fromSlot._id, fromDate, status: { $in: ["pending", "approved"] } });
    if (clash) throw new BranchError("That class already has a change asked for or made.", 409);
  } else {
    if (own.includes(id(toSlot))) throw new BranchError("Already in that class time.");
    if (fromSlot && !own.includes(id(fromSlot))) throw new BranchError("Pick one of the current class times to give up.");
    const clash = await BranchSlotChange.exists({ student: student._id, type: "permanent", status: "pending" });
    if (clash) throw new BranchError("A permanent change is already waiting for the centre.", 409);
  }
  if (!actor.staff && !reason) throw new BranchError("Tell the centre why, in a few words.");
  await assertRoom(branch, student, { type, toSlot, toDate, fromSlot: fromSlot ? id(fromSlot) : null });

  const now = new Date();
  const doc: any = {
    branch,
    student: student._id,
    user: student.user,
    studentName: student.name,
    type,
    fromSlot: fromSlot?._id,
    toSlot: toSlot._id,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    fromLabel: fromSlot ? slotLabel(fromSlot) : "",
    toLabel: slotLabel(toSlot),
    reason,
    requestedBy: actor.id,
    requestedByName: actor.name || "",
    requestedByStaff: actor.staff,
    ...(actor.staff ? { status: "approved", decidedBy: actor.id, decidedByName: actor.name || "", decidedAt: now } : {}),
  };
  const change: any = (await BranchSlotChange.create(doc)).toObject();
  if (actor.staff && type === "permanent") {
    await BranchStudent.updateOne({ _id: student._id }, { $set: { slots: slotsAfterChange(own, fromSlot ? id(fromSlot) : null, id(toSlot)) } });
    if (fromSlot) void alertFreedSeats(branch, [fromSlot._id]);
  }
  void recordActivity({
    actor: actor.id,
    targetUser: id(student.user),
    type: actor.staff ? "branch.class_change_made" : "branch.class_change_asked",
    label: `${actor.staff ? "Moved" : "Asked to move"} ${student.name}: ${describeChange(change)}`,
    entityType: "BranchSlotChange",
    entityId: id(change),
  });
  if (actor.staff) void tellStudent(branch, change, "approved");
  else void tellStaff(branch, change);
  return serialize(change);
}

async function findChange(branch: BranchKey, changeId: string) {
  if (!isObjectId(changeId)) throw new BranchError("Request not found.", 404);
  const change: any = await BranchSlotChange.findOne({ _id: changeId, branch }).lean();
  if (!change) throw new BranchError("Request not found.", 404);
  return change;
}

/** Approve (seats checked again, slots updated for a permanent change) or reject. */
export async function decideChange(branch: BranchKey, changeId: string, input: any, actor: ChangeActor) {
  await dbConnect();
  const change = await findChange(branch, changeId);
  if (change.status !== "pending") throw new BranchError("This request has already been decided.");
  const approve = input?.approve === true;
  const note = text(input?.note, 300);
  if (!approve && !note) throw new BranchError("Say why, so the family knows.");

  if (approve) {
    const student: any = await BranchStudent.findOne({ _id: change.student, branch }).lean();
    if (!student || student.status !== "active") throw new BranchError("This student is no longer active.");
    const toSlot = await findSlot(branch, id(change.toSlot));
    if (toSlot.isActive === false) throw new BranchError("That class time has been closed.");
    if (change.type === "week" && change.toDate < todayKey()) throw new BranchError("That class has already happened.");
    await assertRoom(branch, student, { type: change.type, toSlot, toDate: change.toDate, fromSlot: change.fromSlot ? id(change.fromSlot) : null });
    if (change.type === "permanent") {
      await BranchStudent.updateOne(
        { _id: student._id },
        { $set: { slots: slotsAfterChange((student.slots || []).map(id), change.fromSlot ? id(change.fromSlot) : null, id(toSlot)) } }
      );
      if (change.fromSlot) void alertFreedSeats(branch, [change.fromSlot]);
    }
  }
  const decided: any = await BranchSlotChange.findOneAndUpdate(
    { _id: change._id, status: "pending" },
    { $set: { status: approve ? "approved" : "rejected", decidedBy: actor.id, decidedByName: actor.name || "", decidedAt: new Date(), decisionNote: note } },
    { new: true }
  ).lean();
  if (!decided) throw new BranchError("This request has already been decided.");
  void recordActivity({
    actor: actor.id,
    targetUser: id(change.user),
    type: approve ? "branch.class_change_approved" : "branch.class_change_rejected",
    label: `${approve ? "Approved" : "Turned down"} ${change.studentName}'s change: ${describeChange(change)}`,
    entityType: "BranchSlotChange",
    entityId: id(change),
  });
  void tellStudent(branch, decided, approve ? "approved" : "rejected");
  return serialize(decided);
}

/**
 * The family withdraws a request still waiting, or staff undo a one-week move
 * that hasn't happened yet. A permanent change, once made, is undone by
 * editing the student's slots.
 */
export async function cancelChange(branch: BranchKey, changeId: string, actor: ChangeActor, ownerStudentId?: string) {
  await dbConnect();
  const change = await findChange(branch, changeId);
  if (ownerStudentId && id(change.student) !== ownerStudentId) throw new BranchError("Request not found.", 404);
  const undoable = change.status === "pending" || (actor.staff && change.status === "approved" && change.type === "week" && change.toDate >= todayKey());
  if (!undoable) throw new BranchError(change.type === "permanent" && change.status === "approved" ? "Change the student's slots on the Students page instead." : "This can no longer be cancelled.");
  await BranchSlotChange.updateOne({ _id: change._id, status: change.status }, { $set: { status: "cancelled", decidedBy: actor.id, decidedByName: actor.name || "", decidedAt: new Date() } });
  if (actor.staff && change.status === "approved") void tellStudent(branch, { ...change, status: "cancelled" }, "cancelled");
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** For staff: waiting requests, one-week moves still to come, and the rest. */
export async function listChanges(branch: BranchKey) {
  await dbConnect();
  const today = todayKey();
  const changes: any[] = await BranchSlotChange.find({ branch }).sort({ createdAt: -1 }).limit(400).lean();
  const all = changes.map(serialize);
  return {
    pending: all.filter((change) => change.status === "pending"),
    upcoming: all
      .filter((change) => change.status === "approved" && change.type === "week" && change.toDate >= today)
      .sort((a, b) => a.toDate.localeCompare(b.toDate)),
    history: all.filter((change) => !(change.status === "pending" || (change.status === "approved" && change.type === "week" && change.toDate >= today))),
  };
}

/** For the student's own page. */
export async function myChanges(student: any) {
  await dbConnect();
  const changes: any[] = await BranchSlotChange.find({ student: student._id }).sort({ createdAt: -1 }).limit(30).lean();
  return changes.map(serialize);
}

/** Approved one-week moves in or out of a slot on a date, for its register. */
export async function movesForRegister(branch: BranchKey, slotId: unknown, date: string) {
  const [arriving, leaving]: [any[], any[]] = await Promise.all([
    BranchSlotChange.find({ branch, type: "week", status: "approved", toSlot: slotId, toDate: date }).select("student fromLabel").lean(),
    BranchSlotChange.find({ branch, type: "week", status: "approved", fromSlot: slotId, fromDate: date }).select("student toLabel toDate").lean(),
  ]);
  return {
    arriving: arriving.map((change) => ({ studentId: id(change.student), from: change.fromLabel || "" })),
    leaving: leaving.map((change) => ({ studentId: id(change.student), to: change.toLabel || "", toDate: change.toDate || "" })),
  };
}

/** Approved one-week moves on a date, per slot, for the day's class list. */
export async function moveCountsOn(branch: BranchKey, date: string) {
  const changes: any[] = await BranchSlotChange.find({
    branch,
    type: "week",
    status: "approved",
    $or: [{ toDate: date }, { fromDate: date }],
  })
    .select("fromSlot toSlot fromDate toDate")
    .lean();
  const counts = new Map<string, { arriving: number; leaving: number }>();
  const bump = (slot: unknown, key: "arriving" | "leaving") => {
    const entry = counts.get(id(slot)) || { arriving: 0, leaving: 0 };
    entry[key] += 1;
    counts.set(id(slot), entry);
  };
  for (const change of changes) {
    if (change.toDate === date) bump(change.toSlot, "arriving");
    if (change.fromDate === date) bump(change.fromSlot, "leaving");
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Telling people
// ---------------------------------------------------------------------------

async function tellStaff(branch: BranchKey, change: any) {
  try {
    const staff: any[] = await User.find({ branch, role: "instructor", branchRole: { $in: ["admin", "manager"] }, isActive: { $ne: false } })
      .select("_id")
      .lean();
    if (!staff.length) return;
    await Notification.insertMany(
      staff.map((user) => ({
        user: user._id,
        type: "branch_class_change_requested",
        title: change.type === "week" ? "One-week class change asked for" : "Permanent class change asked for",
        message: `${change.studentName}: ${describeChange(change)}.${change.reason ? ` Reason: ${change.reason}` : ""}`,
        metadata: { changeId: id(change), href: "/bowbazar/changes" },
      }))
    );
  } catch (error) {
    console.error("Branch class change staff notice failed", error);
  }
}

const OUTCOME: Record<string, string> = {
  approved: "is confirmed",
  rejected: "could not be made",
  cancelled: "has been cancelled by the centre",
};

/** In the portal, and by email when the family has a real address. */
async function tellStudent(branch: BranchKey, change: any, outcome: "approved" | "rejected" | "cancelled") {
  try {
    const user: any = await User.findById(change.user).select("name email").lean();
    if (!user) return;
    const what = change.type === "week" ? "one-week class change" : "class time change";
    const title = `Your ${what} ${OUTCOME[outcome]}`;
    const lines = [describeChange(change), change.decisionNote ? `Note from the centre: ${change.decisionNote}` : ""].filter(Boolean);
    await Notification.create({
      user: change.user,
      type: "branch_class_change_decided",
      title,
      message: lines.join(" "),
      metadata: { changeId: id(change), href: "/bowbazar/me" },
    });
    if (user.email) {
      await sendAutomationEmail({
        to: user.email,
        subject: `${title} - Envision Chess Academy ${BRANCH_LABELS[branch]}`,
        message: [`Hello ${user.name},`, "", `${title}:`, ...lines].join("\n"),
        metadata: { kind: "branch_class_change", changeId: id(change), outcome },
      });
    }
  } catch (error) {
    console.error("Branch class change student notice failed", error);
  }
}
