import "server-only";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { Classroom } from "@/models/Classroom";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { BranchAttendance, BranchClassSession, BranchHoliday, BranchSlot, BranchStudent } from "@/models/Branch";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { BRANCH_LABELS, type BranchKey } from "./scope";
import { classEmailHtml } from "./classEmail";
import { BranchError } from "./errors";
import { isDateKey, isTime, shiftDateKey, slotLabel, timeLabel, todayKey } from "./rules";
import {
  newDateProblem,
  occurrenceOn,
  scheduleFor,
  shortDate,
  templateWhen,
  whenLabel,
  type Occurrence,
  type SessionRecord,
} from "./classSessionRules";

/**
 * Changing single dates of an online class (Online Classes screen): cancel
 * one meeting, move it, add an extra one, or add students to one meeting
 * only. Registers, the live room and the family's page read these through
 * `classOn` / `classClosedReason`, so a moved or extra meeting gets its own
 * register and live room on its own date. Families and the coach are told in
 * the portal, by email and on WhatsApp (the academy's approved class templates).
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);

type Actor = { id: string; name?: string };

function toRecord(doc: any): SessionRecord {
  return {
    id: id(doc),
    kind: doc.kind,
    date: doc.date,
    fromDate: doc.fromDate || null,
    startTime: doc.startTime || null,
    endTime: doc.endTime || null,
    guests: (doc.guests || []).map(id),
    reason: doc.reason || "",
  };
}

/** This slot's records that touch `date` (meeting there, or moved away from there). */
async function recordsTouching(slotIds: unknown[], date: string) {
  const docs: any[] = await BranchClassSession.find({ slot: { $in: slotIds }, $or: [{ date }, { fromDate: date }] }).lean();
  const bySlot = new Map<string, SessionRecord[]>();
  for (const doc of docs) bySlot.set(id(doc.slot), [...(bySlot.get(id(doc.slot)) || []), toRecord(doc)]);
  return bySlot;
}

async function recordsBetween(slotIds: unknown[], from: string, to: string) {
  const docs: any[] = await BranchClassSession.find({
    slot: { $in: slotIds },
    $or: [{ date: { $gte: from, $lte: to } }, { fromDate: { $gte: from, $lte: to } }],
  }).lean();
  const bySlot = new Map<string, SessionRecord[]>();
  for (const doc of docs) bySlot.set(id(doc.slot), [...(bySlot.get(id(doc.slot)) || []), toRecord(doc)]);
  return bySlot;
}

/** The class on a date (null when it doesn't meet then). Online slots only have records; a centre slot is its week. */
export async function classOn(slot: any, date: string): Promise<Occurrence | null> {
  const records = slot.mode === "online" ? (await recordsTouching([slot._id], date)).get(id(slot)) || [] : [];
  return occurrenceOn(slot, date, records);
}

/** Why an online class doesn't meet on its usual date: cancelled or moved. "" when it does. Read by `holidayFor`. */
export async function classClosedReason(slotId: unknown, date: string) {
  if (!slotId) return "";
  const docs: any[] = await BranchClassSession.find({
    slot: slotId,
    $or: [{ date, kind: "cancelled" }, { fromDate: date, kind: "moved" }],
  }).lean();
  const cancelled = docs.find((doc) => doc.kind === "cancelled");
  if (cancelled) return cancelled.reason ? `Class cancelled: ${cancelled.reason}` : "Class cancelled";
  // A meeting moved to another time on the same day still meets that day.
  const moved = docs.find((doc) => doc.kind === "moved" && doc.date !== date);
  return moved ? `Class moved to ${whenLabel(moved.date, moved.startTime)}` : "";
}

/** Online slots meeting on `date` only because a class was moved there or added (for the day's register list). */
export async function movedInSlotIds(branch: BranchKey, date: string) {
  const docs: any[] = await BranchClassSession.find({ branch, date, kind: { $in: ["moved", "extra"] } }).select("slot").lean();
  return docs.map((doc) => doc.slot);
}

/** Each slot's meeting on `date` (for the day's register list). */
export async function occurrencesOn(slots: any[], date: string) {
  const online = slots.filter((slot) => slot.mode === "online");
  const records = online.length ? await recordsTouching(online.map((slot) => slot._id), date) : new Map<string, SessionRecord[]>();
  return new Map(slots.map((slot) => [id(slot), occurrenceOn(slot, date, records.get(id(slot)) || [])]));
}

/** Each online class's meetings from today for `days` days, for the Online Classes screen. */
export async function upcomingSchedules(slots: any[], days = 35) {
  const today = todayKey();
  const records = slots.length ? await recordsBetween(slots.map((slot) => slot._id), today, shiftDateKey(today, days - 1)) : new Map();
  return new Map(slots.map((slot) => [id(slot), scheduleFor(slot, records.get(id(slot)) || [], today, days)]));
}

/**
 * A student's online meetings on `date`: their own classes that go ahead
 * (moved or added ones included) and meetings they were added to as a guest.
 */
export async function studentClassesOn(branch: BranchKey, studentId: unknown, slotIds: unknown[], date: string) {
  const guestDocs: any[] = await BranchClassSession.find({ branch, date, guests: studentId, kind: { $ne: "cancelled" } }).select("slot").lean();
  const ids = [...new Set([...slotIds.map(id), ...guestDocs.map((doc) => id(doc.slot))])];
  if (!ids.length) return [];
  const slots: any[] = await BranchSlot.find({ _id: { $in: ids }, branch, mode: "online", isActive: { $ne: false } }).lean();
  const occurrences = await occurrencesOn(slots, date);
  const guestOf = new Set(guestDocs.map((doc) => id(doc.slot)));
  return slots
    .map((slot) => ({ slot, occurrence: occurrences.get(id(slot)) }))
    .filter(({ slot, occurrence }) => occurrence && !occurrence.closed && (slotIds.map(id).includes(id(slot)) || guestOf.has(id(slot))))
    .map(({ slot, occurrence }) => ({
      slotId: id(slot),
      name: slot.name || "Online class",
      label: `${slot.name ? `${slot.name} · ` : ""}${timeLabel(occurrence!.startTime)}–${timeLabel(occurrence!.endTime)}`,
      startTime: occurrence!.startTime,
      endTime: occurrence!.endTime,
      kind: occurrence!.kind,
      guest: !slotIds.map(id).includes(id(slot)),
      meetingUrl: slot.meetingUrl || "",
    }));
}

/** Changes to a student's online classes in the next `days` days, for their page. */
export async function studentScheduleNotices(branch: BranchKey, studentId: unknown, slotIds: unknown[], days = 21) {
  const today = todayKey();
  const to = shiftDateKey(today, days - 1);
  const docs: any[] = await BranchClassSession.find({
    branch,
    kind: { $ne: "regular" },
    $and: [
      { $or: [{ slot: { $in: slotIds } }, { guests: studentId }] },
      { $or: [{ date: { $gte: today, $lte: to } }, { fromDate: { $gte: today, $lte: to } }] },
    ],
  })
    .sort({ date: 1 })
    .lean();
  const guestOnly: any[] = await BranchClassSession.find({ branch, kind: "regular", guests: studentId, date: { $gte: today, $lte: to } }).lean();
  const all = [...docs, ...guestOnly];
  if (!all.length) return [];
  const slots: any[] = await BranchSlot.find({ _id: { $in: all.map((doc) => doc.slot) }, branch }).select("name dayOfWeek startTime endTime").lean();
  const slotById = new Map(slots.map((slot) => [id(slot), slot]));
  return all
    .map((doc) => {
      const slot = slotById.get(id(doc.slot));
      if (!slot) return null;
      const name = slot.name || "Online class";
      const start = doc.startTime || slot.startTime;
      const reason = doc.reason ? ` (${doc.reason})` : "";
      const message =
        doc.kind === "cancelled"
          ? `${name}: the class on ${whenLabel(doc.date, slot.startTime)} is cancelled${reason}.`
          : doc.kind === "moved"
            ? `${name}: the class on ${whenLabel(doc.fromDate, slot.startTime)} moves to ${whenLabel(doc.date, start)}${reason}.`
            : doc.kind === "extra"
              ? `${name}: extra class on ${whenLabel(doc.date, start)}${reason}.`
              : `You are joining ${name} on ${whenLabel(doc.date, start)}.`;
      return { id: id(doc), kind: doc.kind as string, sortDate: doc.date as string, message };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate));
}

// ---------------------------------------------------------------------------
// Changing one date
// ---------------------------------------------------------------------------

async function onlineSlotFor(branch: BranchKey, slotId: string) {
  if (!isObjectId(slotId)) throw new BranchError("Class not found.", 404);
  const slot: any = await BranchSlot.findOne({ _id: slotId, branch, mode: "online" }).lean();
  if (!slot) throw new BranchError("Class not found.", 404);
  return slot;
}

async function slotRecords(slot: any) {
  const docs: any[] = await BranchClassSession.find({ slot: slot._id, $or: [{ date: { $gte: shiftDateKey(todayKey(), -1) } }, { fromDate: { $gte: shiftDateKey(todayKey(), -1) } }] }).lean();
  return docs.map(toRecord);
}

function checkDate(value: unknown, label = "Pick a date.") {
  if (!isDateKey(value)) throw new BranchError(label);
  if (value < todayKey()) throw new BranchError("That date has passed. Only today and later dates can be changed.");
  return value;
}

function checkTimes(input: any) {
  if (!isTime(input?.startTime) || !isTime(input?.endTime)) throw new BranchError("Enter start and end times.");
  if (input.endTime <= input.startTime) throw new BranchError("The class must end after it starts.");
  return { startTime: input.startTime as string, endTime: input.endTime as string };
}

async function assertNoRegister(slot: any, date: string) {
  const register = await BranchAttendance.exists({ slot: slot._id, date });
  if (register) throw new BranchError(`The register for ${shortDate(date)} is already taken, so that class has happened.`);
}

async function assertOpenDay(branch: BranchKey, slot: any, date: string) {
  const holiday: any = await BranchHoliday.findOne({
    branch,
    date,
    cancelledAt: { $exists: false },
    $or: [{ slots: { $size: 0 } }, { slots: slot._id }],
  })
    .select("reason")
    .lean();
  if (holiday) throw new BranchError(`The centre is closed on ${shortDate(date)} (${holiday.reason}).`);
}

/** The class's students on a date: its members plus that day's guests. */
async function peopleFor(branch: BranchKey, slot: any, guests: unknown[] = []) {
  const students: any[] = await BranchStudent.find({
    branch,
    status: "active",
    $or: [{ slots: slot._id }, { _id: { $in: guests } }],
  })
    .select("name user phone parentName")
    .lean();
  return students;
}

type Notice = {
  title: string;
  line: string;
  /** Gold label on the branded email, e.g. "Class cancelled". */
  label: string;
  /** Rows in the email's card. */
  details: { label: string; value: string; strike?: boolean }[];
  /** The Bowbazar template and its values after the recipient's name. */
  template: string;
  params: string[];
  /** The academy's approved class template, sent while the Bowbazar one is still with Meta. */
  fallback: string;
  fallbackParams: string[];
  /** The coach gets the WhatsApp too (not for "you have been added"). */
  coachWhatsApp?: boolean;
};

/** Sends the Bowbazar template; if Meta hasn't approved it yet, the academy's own. A template switched off stays off. */
async function sendClassWhatsApp(recipient: any, recipientName: string, notice: Notice, metadata: Record<string, unknown>) {
  const first = await sendWhatsAppAutomationTemplate({
    user: recipient,
    templateName: notice.template,
    bodyParameters: [recipientName, ...notice.params],
    metadata,
  }).catch(() => null);
  if (first?.delivered) return true;
  if ((first as any)?.debug?.reason === "whatsapp_template_automation_disabled") return false;
  const second = await sendWhatsAppAutomationTemplate({
    user: recipient,
    templateName: notice.fallback,
    bodyParameters: [recipientName, ...notice.fallbackParams],
    metadata: { ...metadata, fallbackFor: notice.template },
  }).catch(() => null);
  return Boolean(second?.delivered);
}

export type NoticeResult = { families: number; portal: number; email: number; whatsapp: number; coach: boolean };

/** Tells families (in the portal, by email, on WhatsApp) and the class's coach. Never throws. */
async function tell(branch: BranchKey, slot: any, students: any[], notice: Notice, kind: string): Promise<NoticeResult> {
  const result: NoticeResult = { families: students.length, portal: 0, email: 0, whatsapp: 0, coach: false };
  const branchLabel = BRANCH_LABELS[branch];
  const users: any[] = await User.find({ _id: { $in: [...students.map((student) => student.user), slot.coach].filter(Boolean) } })
    .setOptions({ allBranches: true })
    .select("name email phone countryCode role")
    .lean();
  const userById = new Map(users.map((user) => [id(user), user]));

  const base = resolvePublicAppUrl();
  const send = async (user: any, recipientName: string, phone: string | undefined, href: string, whatsapp = true) => {
    const sent = { portal: false, email: false, whatsapp: false };
    try {
      if (user) {
        await Notification.create({ user: user._id, type: `branch_class_${kind}`, title: notice.title, message: notice.line, metadata: { slotId: id(slot), href } });
        sent.portal = true;
      }
      const email = user?.email && !/\.invalid$/i.test(user.email) ? user.email : "";
      if (email) {
        const buttonUrl = base ? `${base}${href}` : "";
        const delivered = await sendAutomationEmail({
          to: email,
          subject: `${notice.title} - Envision Chess Academy ${branchLabel}`,
          message: [`Hello ${recipientName},`, "", notice.line, "", "Team Envision Chess Academy"].join("\n"),
          htmlBody: classEmailHtml({
            label: notice.label,
            title: classTitle(slot),
            recipientName,
            message: notice.line,
            details: notice.details,
            buttonUrl,
            buttonLabel: href === "/bowbazar/me" ? "Open my Bowbazar page" : "Open Online classes",
          }),
          htmlIsFinal: true,
          metadata: { kind: `branch_class_${kind}`, slotId: id(slot) },
        }).catch(() => null);
        sent.email = Boolean((delivered as any)?.delivered ?? delivered);
      }
      const recipient = user ? { ...user, phone: user.phone || phone } : phone ? { name: recipientName, phone } : null;
      if (whatsapp && recipient?.phone) {
        sent.whatsapp = await sendClassWhatsApp(recipient, recipientName, notice, { kind: `branch_class_${kind}`, slotId: id(slot) });
      }
    } catch (error) {
      console.error("Branch class notice failed", error);
    }
    return sent;
  };

  for (const student of students) {
    const sent = await send(userById.get(id(student.user)), String(student.name || "there"), student.phone, "/bowbazar/me");
    if (sent.portal) result.portal += 1;
    if (sent.email) result.email += 1;
    if (sent.whatsapp) result.whatsapp += 1;
  }
  const coach = slot.coach ? userById.get(id(slot.coach)) : null;
  if (coach) {
    await send(coach, String(coach.name || "Coach"), undefined, "/bowbazar/online", notice.coachWhatsApp !== false);
    result.coach = true;
  }
  return result;
}

function classTitle(slot: any) {
  return String(slot.name || slotLabel(slot));
}

/**
 * One change to one date of an online class. `action`:
 * cancel | restore | reschedule | undo_move | extra | remove_extra | add_guests | remove_guest.
 * `notify` (default true) tells the families and coach.
 */
export async function changeClassSession(branch: BranchKey, slotId: string, input: any, actor: Actor) {
  await dbConnect();
  const slot = await onlineSlotFor(branch, slotId);
  const action = String(input?.action || "");
  const notify = input?.notify !== false;
  const reason = text(input?.reason, 200);
  const records = await slotRecords(slot);
  const today = todayKey();
  const title = classTitle(slot);
  const by = { createdBy: actor.id, createdByName: actor.name || "", updatedByName: actor.name || "" };
  let notice: Notice | null = null;
  let audience: any[] = [];
  let activity = "";

  const occurrenceAt = (date: string) => occurrenceOn(slot, date, records.filter((record) => record.date === date || record.fromDate === date));

  if (action === "cancel") {
    const date = checkDate(input?.date);
    const occurrence = occurrenceAt(date);
    if (!occurrence || occurrence.closed) throw new BranchError(`This class doesn't meet on ${shortDate(date)}.`);
    await assertNoRegister(slot, date);
    audience = await peopleFor(branch, slot, occurrence.guests);
    if (occurrence.kind === "regular") {
      await BranchClassSession.updateOne(
        { slot: slot._id, date },
        { $set: { branch, kind: "cancelled", reason, updatedByName: actor.name || "" }, $setOnInsert: { createdBy: actor.id, createdByName: actor.name || "" } },
        { upsert: true }
      );
    } else {
      // A moved or extra meeting that is called off simply goes; a moved one
      // leaves its usual date cancelled too, so nobody expects it back there.
      await BranchClassSession.deleteOne({ _id: occurrence.sessionId });
      if (occurrence.kind === "moved" && occurrence.fromDate) {
        await BranchClassSession.updateOne(
          { slot: slot._id, date: occurrence.fromDate },
          { $set: { branch, kind: "cancelled", reason, updatedByName: actor.name || "" }, $setOnInsert: { createdBy: actor.id, createdByName: actor.name || "" } },
          { upsert: true }
        );
      }
    }
    const when = templateWhen(date, occurrence.startTime);
    notice = {
      title: `Class cancelled: ${title}`,
      line: `The ${title} class on ${whenLabel(date, occurrence.startTime)} is cancelled${reason ? ` (${reason})` : ""}. Your next class goes ahead as usual.`,
      label: "Class cancelled",
      details: [
        { label: "Class", value: whenLabel(date, occurrence.startTime), strike: true },
        { label: "Reason", value: reason },
      ],
      template: "bowbazar_class_cancelled",
      params: [title, when, reason || "We are sorry for the change."],
      fallback: "class_session_cancelled",
      fallbackParams: [title, when],
    };
    activity = `Cancelled ${title} on ${date}`;
  } else if (action === "restore") {
    const date = checkDate(input?.date);
    const doc: any = await BranchClassSession.findOne({ slot: slot._id, date, kind: "cancelled" }).lean();
    if (!doc) throw new BranchError("That class isn't cancelled.");
    if ((doc.guests || []).length) await BranchClassSession.updateOne({ _id: doc._id }, { $set: { kind: "regular", reason: "", updatedByName: actor.name || "" } });
    else await BranchClassSession.deleteOne({ _id: doc._id });
    audience = await peopleFor(branch, slot, doc.guests);
    notice = {
      title: `Class back on: ${title}`,
      line: `The ${title} class on ${whenLabel(date, slot.startTime)} goes ahead after all.`,
      label: "Class back on",
      details: [{ label: "Class", value: `${whenLabel(date, slot.startTime)}–${timeLabel(slot.endTime)}` }],
      template: "bowbazar_class_restored",
      params: [title, templateWhen(date, slot.startTime)],
      fallback: "class_schedule_updated",
      fallbackParams: [title, templateWhen(date, slot.startTime)],
    };
    activity = `Restored ${title} on ${date}`;
  } else if (action === "reschedule") {
    const date = checkDate(input?.date);
    const toDate = checkDate(input?.toDate, "Pick the new date.");
    const times = checkTimes(input);
    const occurrence = occurrenceAt(date);
    if (!occurrence || occurrence.closed) throw new BranchError(`This class doesn't meet on ${shortDate(date)}.`);
    await assertNoRegister(slot, date);
    if (toDate !== date) {
      const problem = newDateProblem(slot, toDate, records, today, occurrence.sessionId);
      if (problem) throw new BranchError(problem);
      await assertNoRegister(slot, toDate);
    }
    await assertOpenDay(branch, slot, toDate);
    if (toDate === date && times.startTime === occurrence.startTime && times.endTime === occurrence.endTime) throw new BranchError("That's the same date and time.");
    audience = await peopleFor(branch, slot, occurrence.guests);
    if (occurrence.kind === "regular") {
      // Its guests move with it. A new time on the same day is a move onto its own date.
      await BranchClassSession.deleteOne({ slot: slot._id, date, kind: "regular" });
      await BranchClassSession.create({ branch, slot: slot._id, kind: "moved", date: toDate, fromDate: date, ...times, guests: occurrence.guests, reason, ...by });
    } else {
      await BranchClassSession.updateOne({ _id: occurrence.sessionId }, { $set: { date: toDate, ...times, reason: reason || occurrence.reason, updatedByName: actor.name || "" } });
    }
    notice = {
      title: `Class rescheduled: ${title}`,
      line: `The ${title} class on ${whenLabel(date, occurrence.startTime)} moves to ${whenLabel(toDate, times.startTime)}–${timeLabel(times.endTime)}${reason ? ` (${reason})` : ""}.`,
      label: "Class rescheduled",
      details: [
        { label: "Was", value: whenLabel(date, occurrence.startTime), strike: true },
        { label: "Now", value: `${whenLabel(toDate, times.startTime)}–${timeLabel(times.endTime)}` },
        { label: "Reason", value: reason },
      ],
      template: "bowbazar_class_rescheduled",
      params: [title, templateWhen(date, occurrence.startTime), templateWhen(toDate, times.startTime), reason || "We are sorry for the change."],
      fallback: "class_rescheduled",
      fallbackParams: [title, templateWhen(date, occurrence.startTime), templateWhen(toDate, times.startTime)],
    };
    activity = `Moved ${title} from ${date} to ${toDate} ${times.startTime}`;
  } else if (action === "undo_move") {
    const date = checkDate(input?.date);
    const doc: any = await BranchClassSession.findOne({ slot: slot._id, date, kind: "moved" }).lean();
    if (!doc) throw new BranchError("That class wasn't moved.");
    await assertNoRegister(slot, date);
    const back = doc.fromDate as string;
    if (back < today) throw new BranchError(`Its usual date (${shortDate(back)}) has passed. Cancel it instead.`);
    await BranchClassSession.deleteOne({ _id: doc._id });
    if ((doc.guests || []).length) {
      await BranchClassSession.updateOne(
        { slot: slot._id, date: back },
        { $set: { branch, kind: "regular", guests: doc.guests, updatedByName: actor.name || "" }, $setOnInsert: { createdBy: actor.id, createdByName: actor.name || "" } },
        { upsert: true }
      );
    }
    audience = await peopleFor(branch, slot, doc.guests);
    notice = {
      title: `Class back at its usual time: ${title}`,
      line: `The ${title} class is back on ${whenLabel(back, slot.startTime)}, not ${whenLabel(date, doc.startTime)}.`,
      label: "Class rescheduled",
      details: [
        { label: "Was", value: whenLabel(date, doc.startTime), strike: true },
        { label: "Now", value: `${whenLabel(back, slot.startTime)}–${timeLabel(slot.endTime)}` },
      ],
      template: "bowbazar_class_rescheduled",
      params: [title, templateWhen(date, doc.startTime), templateWhen(back, slot.startTime), "The class is back at its usual time."],
      fallback: "class_rescheduled",
      fallbackParams: [title, templateWhen(date, doc.startTime), templateWhen(back, slot.startTime)],
    };
    activity = `Put ${title} back on ${back}`;
  } else if (action === "extra") {
    const date = checkDate(input?.date, "Pick the date of the extra class.");
    const times = checkTimes(input);
    const problem = newDateProblem(slot, date, records, today);
    if (problem) throw new BranchError(problem);
    await assertOpenDay(branch, slot, date);
    const guests = await checkGuests(branch, slot, input?.studentIds, []);
    await BranchClassSession.create({ branch, slot: slot._id, kind: "extra", date, ...times, guests, reason, ...by });
    audience = await peopleFor(branch, slot, guests);
    notice = {
      title: `Extra class: ${title}`,
      line: `An extra ${title} class is set for ${whenLabel(date, times.startTime)}–${timeLabel(times.endTime)}${reason ? ` (${reason})` : ""}. Join it from your Bowbazar page.`,
      label: "Extra class",
      details: [
        { label: "When", value: `${whenLabel(date, times.startTime)}–${timeLabel(times.endTime)}` },
        { label: "Why", value: reason },
      ],
      template: "bowbazar_extra_class",
      params: [title, templateWhen(date, times.startTime), reason || "See you in class."],
      fallback: "class_schedule_updated",
      fallbackParams: [title, templateWhen(date, times.startTime)],
    };
    activity = `Added an extra ${title} class on ${date}`;
  } else if (action === "remove_extra") {
    const date = checkDate(input?.date);
    const doc: any = await BranchClassSession.findOne({ slot: slot._id, date, kind: "extra" }).lean();
    if (!doc) throw new BranchError("No extra class on that date.");
    await assertNoRegister(slot, date);
    await BranchClassSession.deleteOne({ _id: doc._id });
    audience = await peopleFor(branch, slot, doc.guests);
    notice = {
      title: `Extra class cancelled: ${title}`,
      line: `The extra ${title} class on ${whenLabel(date, doc.startTime)} is cancelled${reason ? ` (${reason})` : ""}.`,
      label: "Extra class cancelled",
      details: [
        { label: "Class", value: whenLabel(date, doc.startTime), strike: true },
        { label: "Reason", value: reason },
      ],
      template: "bowbazar_class_cancelled",
      params: [title, templateWhen(date, doc.startTime), reason || "The extra class will not take place."],
      fallback: "class_session_cancelled",
      fallbackParams: [title, templateWhen(date, doc.startTime)],
    };
    activity = `Removed the extra ${title} class on ${date}`;
  } else if (action === "add_guests") {
    const date = checkDate(input?.date);
    const occurrence = occurrenceAt(date);
    if (!occurrence || occurrence.closed) throw new BranchError(`This class doesn't meet on ${shortDate(date)}.`);
    const added = await checkGuests(branch, slot, input?.studentIds, occurrence.guests);
    if (!added.length) throw new BranchError("Pick at least one student.");
    if (occurrence.sessionId) {
      await BranchClassSession.updateOne({ _id: occurrence.sessionId }, { $addToSet: { guests: { $each: added } }, $set: { updatedByName: actor.name || "" } });
    } else {
      await BranchClassSession.create({ branch, slot: slot._id, kind: "regular", date, guests: added, ...by });
    }
    // Only the students added hear about it; the coach is told who joins.
    audience = await BranchStudent.find({ _id: { $in: added }, branch }).select("name user phone parentName").lean();
    const names = audience.map((student) => student.name).join(", ");
    notice = {
      title: `Added to ${title}`,
      line: `${names} ${audience.length === 1 ? "is" : "are"} joining the ${title} class on ${whenLabel(date, occurrence.startTime)}–${timeLabel(occurrence.endTime)}. Join it from the Bowbazar page at class time.`,
      label: "Added to a class",
      details: [
        { label: "When", value: `${whenLabel(date, occurrence.startTime)}–${timeLabel(occurrence.endTime)}` },
        { label: "Joining", value: names },
      ],
      template: "bowbazar_class_added",
      params: [title, templateWhen(date, occurrence.startTime)],
      fallback: "class_schedule_updated",
      fallbackParams: [title, templateWhen(date, occurrence.startTime)],
      // The coach reads who joins in the portal and email; "you have been added" isn't for them.
      coachWhatsApp: false,
    };
    activity = `Added ${names} to ${title} on ${date}`;
  } else if (action === "remove_guest") {
    const date = checkDate(input?.date);
    const studentId = String(input?.studentId || "");
    if (!isObjectId(studentId)) throw new BranchError("Student not found.", 404);
    const doc: any = await BranchClassSession.findOne({ slot: slot._id, date, guests: studentId }).lean();
    if (!doc) throw new BranchError("That student wasn't added to this class.");
    await BranchClassSession.updateOne({ _id: doc._id }, { $pull: { guests: new Types.ObjectId(studentId) } });
    if (doc.kind === "regular" && (doc.guests || []).length <= 1) await BranchClassSession.deleteOne({ _id: doc._id, kind: "regular", guests: { $size: 0 } });
    activity = `Took a student off ${title} on ${date}`;
  } else {
    throw new BranchError("Unknown change.");
  }

  void recordActivity({
    actor: actor.id,
    type: `branch.online_class_${action}`,
    label: activity,
    entityType: "BranchSlot",
    entityId: id(slot),
    metadata: { branch, date: input?.date, toDate: input?.toDate },
  });
  const told = notify && notice ? await tell(branch, slot, audience, notice, action) : null;
  return { told };
}

/** Students added to one meeting: active, in this branch, not already in the class, and within its seats. */
async function checkGuests(branch: BranchKey, slot: any, input: unknown, existing: string[]) {
  const ids = [...new Set((Array.isArray(input) ? input : []).map(String))].filter((value) => !existing.includes(value));
  if (ids.some((value) => !isObjectId(value))) throw new BranchError("Pick students from the list.");
  if (!ids.length) return [];
  const students: any[] = await BranchStudent.find({ _id: { $in: ids }, branch, status: "active" }).select("name slots").lean();
  if (students.length !== ids.length) throw new BranchError("One of the picked students has left or is not in this branch.");
  const member = students.find((student) => (student.slots || []).some((ref: any) => id(ref) === id(slot)));
  if (member) throw new BranchError(`${member.name} is already in this class every week.`);
  const seated = await BranchStudent.countDocuments({ branch, status: "active", slots: slot._id });
  if (seated + existing.length + ids.length > slot.capacity) {
    throw new BranchError(`This class has ${slot.capacity} seats: ${seated + existing.length} taken, ${ids.length} picked. Raise its seats first.`);
  }
  return ids.map((value) => new Types.ObjectId(value));
}

/**
 * Deletes a weekly online class: its students come out of it, its upcoming
 * changes and live room go. Past registers stay in each student's history.
 */
export async function deleteOnlineClass(branch: BranchKey, slotId: string, input: any, actor: Actor) {
  await dbConnect();
  const slot = await onlineSlotFor(branch, slotId);
  const title = classTitle(slot);
  const audience = await peopleFor(branch, slot);
  await BranchStudent.updateMany({ branch, slots: slot._id }, { $pull: { slots: slot._id } });
  await BranchClassSession.deleteMany({ slot: slot._id });
  await Classroom.updateMany({ branch, branchSlot: slot._id }, { $set: { isActive: false } });
  await BranchSlot.deleteOne({ _id: slot._id });
  void recordActivity({
    actor: actor.id,
    type: "branch.online_class_deleted",
    label: `Deleted the online class ${slotLabel(slot)}`,
    entityType: "BranchSlot",
    entityId: id(slot),
    metadata: { branch, students: audience.length },
  });
  const told =
    input?.notify !== false && audience.length
      ? await tell(
          branch,
          slot,
          audience,
          {
            title: `Class stopped: ${title}`,
            line: `The ${slotLabel(slot)} online class has stopped. The centre will tell you about your next class.`,
            label: "Class stopped",
            details: [{ label: "Class", value: slotLabel(slot), strike: true }],
            template: "bowbazar_class_stopped",
            params: [title],
            fallback: "class_series_cancelled",
            fallbackParams: [title],
          },
          "deleted"
        )
      : null;
  return { told };
}
