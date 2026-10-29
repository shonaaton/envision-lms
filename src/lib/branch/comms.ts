import "server-only";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { validatePopupInput } from "@/lib/popups/popupAdmin";
import { Notification } from "@/models/Fee";
import { Popup } from "@/models/Popup";
import { User } from "@/models/User";
import { BranchAnnouncement, BranchHoliday, BranchSlot, BranchStudent } from "@/models/Branch";
import { BranchError } from "./errors";
import { BRANCH_LABELS, type BranchKey } from "./scope";
import { dayOfDateKey, isDateKey, slotLabel, todayKey } from "./rules";

/**
 * A branch talking to its own families: announcements, holidays, its own
 * login pop-ups and a log of the notices its accounts got. Nothing here
 * reaches the online academy.
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);
const realEmail = (email: unknown) => (email && !/\.invalid$/i.test(String(email)) ? String(email) : "");

type Actor = { id: string; name?: string };

/** The active students an audience reaches. */
async function audienceStudents(branch: BranchKey, audience: string, slotIds: string[], studentIds: string[]) {
  const filter: any = { branch, status: "active" };
  if (audience === "slots") {
    if (!slotIds.length) throw new BranchError("Pick at least one class.");
    filter.slots = { $in: slotIds };
  } else if (audience === "students") {
    if (!studentIds.length) throw new BranchError("Pick at least one student.");
    filter._id = { $in: studentIds };
  }
  return (await BranchStudent.find(filter).select("name parentName user").lean()) as any[];
}

/** Sends to each student's login (portal notice) and, where the family has a real address, by email. */
async function deliver(branch: BranchKey, students: any[], title: string, message: string, kind: "announcement" | "holiday", metadata: Record<string, unknown>) {
  const users: any[] = await User.find({ _id: { $in: students.map((student) => student.user).filter(Boolean) } }).select("name email").lean();
  if (users.length) {
    await Notification.insertMany(
      users.map((user) => ({ user: user._id, type: kind === "holiday" ? "branch_holiday" : "announcement", title, message, metadata: { ...metadata, href: "/bowbazar/me" } }))
    );
  }
  let emailed = 0;
  for (const user of users) {
    const to = realEmail(user.email);
    if (!to) continue;
    const result = await sendAutomationEmail({
      to,
      subject: `${title} - Envision Chess Academy ${BRANCH_LABELS[branch]}`,
      message: [`Hello,`, "", message, "", `- Envision Chess Academy, ${BRANCH_LABELS[branch]} centre`].join("\n"),
      metadata: { kind: `branch_${kind}`, ...metadata },
    }).catch(() => null);
    if (result?.delivered) emailed += 1;
  }
  return { users, emailed };
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export async function sendAnnouncement(branch: BranchKey, input: any, actor: Actor, kind: "announcement" | "holiday" = "announcement") {
  await dbConnect();
  const title = text(input?.title, 140);
  const message = text(input?.message, 2000);
  if (!title) throw new BranchError("Add a title.");
  if (!message) throw new BranchError("Write the message.");
  const audience = ["all", "slots", "students"].includes(input?.audience) ? input.audience : "all";
  const slotIds = (Array.isArray(input?.slotIds) ? input.slotIds : []).filter(isObjectId);
  const studentIds = (Array.isArray(input?.studentIds) ? input.studentIds : []).filter(isObjectId);
  const students = await audienceStudents(branch, audience, slotIds, studentIds);
  if (!students.length) throw new BranchError("Nobody is in that audience.");
  const doc: any = await BranchAnnouncement.create({
    branch,
    title,
    message,
    audience,
    slots: audience === "slots" ? slotIds : [],
    students: audience === "students" ? studentIds : [],
    kind,
    createdBy: actor.id,
    createdByName: actor.name || "",
  });
  const { users, emailed } = await deliver(branch, students, title, message, kind, { announcementId: id(doc) });
  await BranchAnnouncement.updateOne({ _id: doc._id }, { $set: { recipients: users.map((user) => user._id), emailed } });
  void recordActivity({ actor: actor.id, type: `branch.${kind}_sent`, label: `Sent "${title}" to ${users.length} ${BRANCH_LABELS[branch]} families`, entityType: "BranchAnnouncement", entityId: id(doc) });
  return { id: id(doc), recipients: users.length, emailed, whatsappText: `*${title}*\n\n${message}\n\n- Envision Chess Academy, ${BRANCH_LABELS[branch]} centre` };
}

export async function listAnnouncements(branch: BranchKey) {
  await dbConnect();
  const [rows, slots]: [any[], any[]] = await Promise.all([
    BranchAnnouncement.find({ branch, archivedAt: { $exists: false } }).sort({ createdAt: -1 }).limit(100).lean(),
    BranchSlot.find({ branch }).lean(),
  ]);
  const slotById = new Map(slots.map((slot) => [id(slot), slot]));
  return rows.map((row) => ({
    id: id(row),
    title: row.title as string,
    message: row.message as string,
    kind: row.kind || "announcement",
    audience: row.audience,
    audienceLabel:
      row.audience === "slots"
        ? (row.slots || []).map((slot: any) => slotById.get(id(slot))).filter(Boolean).map(slotLabel).join(", ")
        : row.audience === "students"
          ? `${(row.students || []).length} chosen students`
          : "All active students",
    recipients: (row.recipients || []).length,
    emailed: row.emailed || 0,
    createdAt: row.createdAt,
    createdByName: row.createdByName || "",
  }));
}

/** Takes an announcement off families' pages; what was already delivered stays delivered. */
export async function archiveAnnouncement(branch: BranchKey, announcementId: string) {
  await dbConnect();
  if (!isObjectId(announcementId)) throw new BranchError("Not found.", 404);
  const result = await BranchAnnouncement.updateOne({ _id: announcementId, branch }, { $set: { archivedAt: new Date() } });
  if (!result.matchedCount) throw new BranchError("Not found.", 404);
}

/** The last few messages sent to this student, for their page. */
export async function myAnnouncements(userId: unknown) {
  await dbConnect();
  const since = new Date(Date.now() - 45 * 86400000);
  const rows: any[] = await BranchAnnouncement.find({ recipients: userId, archivedAt: { $exists: false }, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  return rows.map((row) => ({ id: id(row), title: row.title as string, message: row.message as string, kind: row.kind || "announcement", createdAt: row.createdAt }));
}

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

/**
 * Closes the centre (or some classes) on a day. Registers can't be taken for
 * those classes, one-week moves into them are refused, and the families of
 * the classes it closes are told unless `notify` is false.
 */
export async function addHoliday(branch: BranchKey, input: any, actor: Actor) {
  await dbConnect();
  const date = String(input?.date || "");
  if (!isDateKey(date)) throw new BranchError("Pick a date.");
  if (date < todayKey()) throw new BranchError("That day has passed.");
  const reason = text(input?.reason, 140);
  if (!reason) throw new BranchError("Say why the centre is closed (e.g. Durga Puja).");
  const slotIds: string[] = (Array.isArray(input?.slotIds) ? input.slotIds : []).filter(isObjectId);
  const daySlots: any[] = await BranchSlot.find({ branch, dayOfWeek: dayOfDateKey(date), isActive: true }).lean();
  if (!daySlots.length) throw new BranchError("No classes meet on that day.");
  if (slotIds.some((slotId) => !daySlots.some((slot) => id(slot) === slotId))) throw new BranchError("Pick classes that meet on that day.");
  if (await BranchHoliday.exists({ branch, date, cancelledAt: { $exists: false } })) throw new BranchError("There is already a holiday on that day. Cancel it first to change it.", 409);
  const closed = slotIds.length ? daySlots.filter((slot) => slotIds.includes(id(slot))) : daySlots;
  const holiday: any = await BranchHoliday.create({ branch, date, slots: slotIds, reason, createdBy: actor.id, createdByName: actor.name || "" });

  let notified = 0;
  if (input?.notify !== false) {
    const when = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    const classes = closed.map(slotLabel).join(", ");
    const sent = await sendAnnouncement(
      branch,
      {
        title: `Centre closed on ${when}`,
        message: `There will be no class on ${when} (${classes}) for ${reason}. Classes carry on as usual after that.`,
        audience: "slots",
        slotIds: closed.map((slot) => id(slot)),
      },
      actor,
      "holiday"
    ).catch(() => null);
    if (sent) {
      notified = sent.recipients;
      await BranchHoliday.updateOne({ _id: holiday._id }, { $set: { announcement: sent.id } });
    }
  }
  return { id: id(holiday), notified };
}

export async function cancelHoliday(branch: BranchKey, holidayId: string) {
  await dbConnect();
  if (!isObjectId(holidayId)) throw new BranchError("Not found.", 404);
  const result = await BranchHoliday.updateOne({ _id: holidayId, branch, cancelledAt: { $exists: false } }, { $set: { cancelledAt: new Date() } });
  if (!result.matchedCount) throw new BranchError("Not found.", 404);
}

export async function listHolidays(branch: BranchKey) {
  await dbConnect();
  const [rows, slots]: [any[], any[]] = await Promise.all([
    BranchHoliday.find({ branch, cancelledAt: { $exists: false }, date: { $gte: todayKey().slice(0, 7) } }).sort({ date: 1 }).lean(),
    BranchSlot.find({ branch }).lean(),
  ]);
  const slotById = new Map(slots.map((slot) => [id(slot), slot]));
  return rows.map((row) => ({
    id: id(row),
    date: row.date as string,
    reason: row.reason as string,
    classes: (row.slots || []).length ? (row.slots || []).map((slot: any) => slotById.get(id(slot))).filter(Boolean).map(slotLabel) : [],
    past: row.date < todayKey(),
    createdByName: row.createdByName || "",
  }));
}

/** The holiday that closes this class on this date, if any. Models only: attendance and changes call it. */
export async function holidayFor(branch: BranchKey, slotId: unknown, date: string) {
  const holiday: any = await BranchHoliday.findOne({
    branch,
    date,
    cancelledAt: { $exists: false },
    $or: [{ slots: { $size: 0 } }, { slots: slotId }],
  })
    .select("reason")
    .lean();
  return holiday ? (holiday.reason as string) : "";
}

/** Holidays still to come that close one of these classes, for a family's page. */
export async function upcomingHolidaysFor(branch: BranchKey, slotIds: unknown[]) {
  await dbConnect();
  const rows: any[] = await BranchHoliday.find({
    branch,
    cancelledAt: { $exists: false },
    date: { $gte: todayKey() },
    $or: [{ slots: { $size: 0 } }, { slots: { $in: slotIds } }],
  })
    .sort({ date: 1 })
    .limit(5)
    .lean();
  return rows.map((row) => ({ id: id(row), date: row.date as string, reason: row.reason as string }));
}

// ---------------------------------------------------------------------------
// Notifications log
// ---------------------------------------------------------------------------

/** Every portal notice the branch's accounts got lately, newest first. */
export async function branchNotifications(branch: BranchKey, input: { kind?: string } = {}) {
  await dbConnect();
  const users: any[] = await User.find({ branch, role: { $in: ["student", "instructor"] } }).select("name role branchRole").lean();
  const userById = new Map(users.map((user) => [id(user), user]));
  const filter: any = { user: { $in: users.map((user) => user._id) } };
  if (input.kind === "students") filter.user = { $in: users.filter((user) => user.role === "student").map((user) => user._id) };
  if (input.kind === "staff") filter.user = { $in: users.filter((user) => user.role !== "student").map((user) => user._id) };
  const rows: any[] = await Notification.find(filter).sort({ createdAt: -1 }).limit(300).lean();
  return rows.map((row) => {
    const user = userById.get(id(row.user));
    return {
      id: id(row),
      title: row.title as string,
      message: row.message as string,
      type: row.type as string,
      read: Boolean(row.readAt),
      createdAt: row.createdAt,
      to: user?.name || "",
      toRole: user ? (user.role === "student" ? "Student" : user.branchRole === "admin" ? "Admin" : user.branchRole === "manager" ? "Manager" : "Coach") : "",
    };
  });
}

// ---------------------------------------------------------------------------
// Pop-ups
// ---------------------------------------------------------------------------

export async function listBranchPopups(branch: BranchKey) {
  await dbConnect();
  const rows: any[] = await Popup.find({ branch }).sort({ createdAt: -1 }).limit(100).lean();
  return rows.map((row) => ({
    id: id(row),
    title: row.title as string,
    body: row.body as string,
    ctaLabel: row.ctaLabel || "",
    ctaHref: row.ctaHref || "",
    audience: row.audience as string,
    targetIds: (row.targetIds || []).map(id),
    targetLabel: row.targetLabel || "",
    startsAt: row.startsAt,
    endsAt: row.endsAt || null,
    priority: row.priority || "normal",
    status: row.status as string,
    createdByName: row.createdByName || "",
  }));
}

/** Only the branch audiences are allowed: everyone at the branch, some classes, or chosen students. */
export async function saveBranchPopup(branch: BranchKey, input: any, actor: Actor, popupId?: string) {
  await dbConnect();
  const audience = ["branch_all", "branch_slot", "student"].includes(input?.audience) ? input.audience : "branch_all";
  if (audience === "student") {
    const count = await User.countDocuments({ _id: { $in: (input?.targetIds || []).filter(isObjectId) }, branch, role: "student" });
    if (!count || count !== (input?.targetIds || []).length) throw new BranchError("Pick students from this centre.");
  }
  if (audience === "branch_slot") {
    const count = await BranchSlot.countDocuments({ _id: { $in: (input?.targetIds || []).filter(isObjectId) }, branch });
    if (!count || count !== (input?.targetIds || []).length) throw new BranchError("Pick classes from this centre.");
  }
  const checked = validatePopupInput({ ...input, audience }, { partial: Boolean(popupId) });
  if ("error" in checked) throw new BranchError(checked.error);
  if (popupId) {
    if (!isObjectId(popupId)) throw new BranchError("Not found.", 404);
    const result = await Popup.updateOne({ _id: popupId, branch }, { $set: checked.fields });
    if (!result.matchedCount) throw new BranchError("Not found.", 404);
    return { id: popupId };
  }
  const doc: any = await Popup.create({ ...checked.fields, branch, createdBy: actor.id, createdByName: actor.name || "" });
  return { id: id(doc) };
}
