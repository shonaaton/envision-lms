import "server-only";

import { Types } from "mongoose";
import { academyDateTime } from "@/lib/academyTime";
import { exitStudentId as idOf } from "@/lib/classroomStudentExits";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { monthKeyOf } from "@/lib/retention/familyRules";
import { loadPopulation } from "@/lib/retention/studentSignals";
import {
  MONTH_TASK_DUE_DAY,
  RECORD_MONTHS,
  isMonthKey,
  monthTaskReferenceId,
  placeIncomplete,
  placeLabel,
  recentMonthKeys,
  suggestState,
  tidyPlace,
  tournamentActionSchema,
} from "@/lib/retention/tournamentDetailsRules";
import {
  cancelTournamentRequestTask,
  raiseTournamentDetailsMonthTask,
  raiseTournamentRequestTask,
  resolveTournamentDetailsMonthTask,
  resolveTournamentRequestTask,
  tournamentDetailsOwner,
  tournamentRequestOwner,
} from "@/lib/tasks/taskTriggers";
import { matchesLoginIdentifier } from "@/lib/loginIdentity";
import { Notification } from "@/models/Fee";
import { InternalTask } from "@/models/InternalTask";
import { TournamentDetailsRequest, TournamentDetailsSend } from "@/models/TournamentDetails";
import { User } from "@/models/User";

type Actor = { id: string; name?: string };

const LOCATION_FIELDS = "name username phone countryCode parentName parentEmail email city state country age studentLevel";

function nameOf(user: any) {
  return String(user?.name || user?.username || "Student");
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Active students (in a live class or on a pause), with where they live. */
async function loadStudents(now: Date) {
  const { population, membership, activePauseByStudent } = await loadPopulation(now, { withSessions: false });
  const ids = population.map((student) => student._id);
  const coachIds = Array.from(new Set(Array.from(membership.values()).flatMap((entry) => Array.from(entry.coachIds))));
  const [details, coaches]: any[] = await Promise.all([
    ids.length ? User.find({ _id: { $in: ids } }).select(LOCATION_FIELDS).lean() : [],
    coachIds.length ? User.find({ _id: { $in: coachIds } }).select("name username").lean() : [],
  ]);
  const coachName = new Map((coaches as any[]).map((coach) => [idOf(coach), nameOf(coach)]));
  return (details as any[]).map((student) => {
    const id = idOf(student);
    const city = tidyPlace(student.city);
    const country = tidyPlace(student.country);
    return {
      _id: id,
      name: nameOf(student),
      parentName: String(student.parentName || "").trim(),
      parentEmail: String(student.parentEmail || student.email || "").trim(),
      phone: student.phone ? `${student.countryCode || ""} ${student.phone}`.trim() : "",
      dial: `${String(student.countryCode || "").replace(/\D/g, "")}${String(student.phone || "").replace(/\D/g, "")}`,
      city,
      state: tidyPlace(student.state),
      country,
      suggestedState: student.state ? "" : suggestState(city, country),
      age: typeof student.age === "number" ? student.age : null,
      level: String(student.studentLevel || ""),
      paused: activePauseByStudent.has(id),
      coaches: Array.from(membership.get(id)?.coachIds || []).map((coachId) => coachName.get(coachId) || "Coach"),
    };
  });
}

function shapeRequest(request: any) {
  return {
    _id: idOf(request),
    monthKey: request.monthKey,
    city: request.city || "",
    state: request.state || "",
    country: request.country || "",
    place: placeLabel(request),
    note: request.note || "",
    studentIds: (request.students || []).map(idOf),
    requestedByName: request.requestedByName || "",
    status: request.status,
    reply: request.reply || "",
    answeredAt: request.answeredAt || null,
    answeredByName: request.answeredByName || "",
    createdAt: request.createdAt,
  };
}

/** The Tournament details tab: every student, this month's state and the last six months. */
export async function tournamentBoard(rawMonth: string | null | undefined, viewerId: string, now = new Date()) {
  await dbConnect();
  // The session has no user ID (`Muktara@ENV`), so read the account.
  const viewer: any = Types.ObjectId.isValid(viewerId) ? (await User.findById(viewerId).select("email username").lean()) || {} : {};
  const current = monthKeyOf(now);
  const monthKey = isMonthKey(rawMonth) && rawMonth <= current ? rawMonth : current;
  const months = recentMonthKeys(monthKey, RECORD_MONTHS);
  const students = await loadStudents(now);
  const ids = students.map((student) => new Types.ObjectId(student._id));

  const [sends, requests]: any[] = await Promise.all([
    TournamentDetailsSend.find({ monthKey: { $in: months }, student: { $in: ids } }).select("student monthKey sentAt sentByName note").lean(),
    TournamentDetailsRequest.find({ $or: [{ status: "open" }, { monthKey: { $in: months.slice(0, 2) } }] }).sort({ createdAt: -1 }).limit(100).lean(),
  ]);

  const sendsByStudent = new Map<string, Record<string, { sentAt: Date; sentByName: string; note: string }>>();
  (sends as any[]).forEach((send) => {
    const id = idOf(send.student);
    const record = sendsByStudent.get(id) || {};
    record[send.monthKey] = { sentAt: send.sentAt, sentByName: send.sentByName || "", note: send.note || "" };
    sendsByStudent.set(id, record);
  });

  const rows = students
    .map((student) => ({ ...student, history: sendsByStudent.get(student._id) || {} }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const sent = rows.filter((row) => row.history[monthKey]).length;

  return {
    monthKey,
    currentMonthKey: current,
    months,
    summary: {
      students: rows.length,
      sent,
      pending: rows.length - sent,
      missingPlace: rows.filter((row) => placeIncomplete(row)).length,
      openRequests: (requests as any[]).filter((request) => request.status === "open").length,
    },
    rows,
    requests: (requests as any[]).map(shapeRequest),
    viewer: {
      isOwner: matchesLoginIdentifier(viewer, tournamentDetailsOwner()),
      isRequestOwner: matchesLoginIdentifier(viewer, tournamentRequestOwner()),
    },
  };
}

/** Settles the month's task once every current student has been sent this month's details. */
async function settleMonthIfDone(monthKey: string, by: string, now: Date) {
  if (monthKey !== monthKeyOf(now)) return;
  const students = await loadStudents(now);
  if (!students.length) return;
  const sent = await TournamentDetailsSend.countDocuments({ monthKey, student: { $in: students.map((student) => new Types.ObjectId(student._id)) } });
  if (sent >= students.length) await resolveTournamentDetailsMonthTask(monthTaskReferenceId(monthKey), by);
}

async function notifyRequester(request: any, actor: Actor) {
  if (!request.requestedBy) return;
  const person: any = await User.findById(request.requestedBy).select("_id name email isActive").lean();
  if (!person || person.isActive === false) return;
  const place = placeLabel(request);
  const href = `/admin/retention?tab=tournaments&month=${request.monthKey}&request=${idOf(request)}`;
  const title = `Tournament details for ${place}`.slice(0, 160);
  const message = `${actor.name || "Saptarshi"} replied to your request:\n\n${request.reply}`;
  await Notification.create({ user: person._id, type: "tournament_details_reply", title, message, metadata: { href, requestId: idOf(request) } });
  if (person.email) {
    await sendAutomationEmail({
      to: person.email,
      subject: title,
      message: [`Hello ${person.name || "there"},`, "", message].join("\n"),
      actionLabel: "Open tournament details",
      metadata: { kind: "tournament_details", event: "reply", dedupKey: `tournament_reply:${idOf(request)}`, href },
    }).catch(() => null);
  }
}

/** Every write on the tab. Returns a short message for the toast. */
export async function applyTournamentAction(raw: unknown, actor: Actor, now = new Date()) {
  const input = tournamentActionSchema.parse(raw);
  await dbConnect();
  const by = Types.ObjectId.isValid(actor.id) ? new Types.ObjectId(actor.id) : undefined;

  if (input.action === "mark_sent") {
    if (input.monthKey > monthKeyOf(now)) throw new Error("That month has not started yet.");
    const students: any[] = await User.find({ _id: { $in: input.studentIds }, role: "student" }).select("_id city state country").lean();
    if (!students.length) throw new Error("Those students were not found.");
    const note = input.note.trim();
    await TournamentDetailsSend.bulkWrite(students.map((student) => ({
      updateOne: {
        filter: { student: student._id, monthKey: input.monthKey },
        update: {
          $set: { sentAt: now, sentBy: by, sentByName: actor.name || "", ...(note ? { note } : {}) },
          $setOnInsert: { city: student.city || "", state: student.state || "", country: student.country || "", ...(note ? {} : { note: "" }) },
        },
        upsert: true,
      },
    })));
    await settleMonthIfDone(input.monthKey, actor.id, now);
    return { message: `Marked ${students.length} student${students.length === 1 ? "" : "s"} as sent for ${monthLabel(input.monthKey)}.` };
  }

  if (input.action === "unmark_sent") {
    await TournamentDetailsSend.deleteOne({ student: input.studentId, monthKey: input.monthKey });
    return { message: "Marked as not sent." };
  }

  if (input.action === "location") {
    const update = { city: tidyPlace(input.city), state: tidyPlace(input.state), country: tidyPlace(input.country) };
    const result = await User.updateOne({ _id: input.studentId, role: "student" }, { $set: update });
    if (!result.matchedCount) throw new Error("Student not found.");
    return { message: `Location saved: ${placeLabel(update) || "cleared"}.` };
  }

  if (input.action === "request") {
    const place = { city: tidyPlace(input.city), state: tidyPlace(input.state), country: tidyPlace(input.country) };
    if (!place.city && !place.state && !place.country) throw new Error("Say which city, state or country is missing.");
    // One open request per place and month: a second click adds to it instead of a twin task.
    const existing: any = await TournamentDetailsRequest.findOne({ monthKey: input.monthKey, status: "open", ...place }).lean();
    if (existing) {
      await TournamentDetailsRequest.updateOne(
        { _id: existing._id },
        { $addToSet: { students: { $each: input.studentIds.map((id) => new Types.ObjectId(id)) } }, ...(input.note.trim() ? { $set: { note: input.note.trim() } } : {}) }
      );
      return { message: `Already asked for ${placeLabel(place)} this month; the request was updated.` };
    }
    const request: any = await TournamentDetailsRequest.create({
      monthKey: input.monthKey,
      ...place,
      note: input.note.trim(),
      students: input.studentIds,
      requestedBy: by,
      requestedByName: actor.name || "",
    });
    await raiseTournamentRequestTask({ request: request.toObject(), place: placeLabel(place), monthLabel: monthLabel(input.monthKey), requesterName: actor.name || "" });
    return { message: `Asked Saptarshi for ${placeLabel(place)}. A task is in his list.` };
  }

  if (input.action === "answer_request") {
    const request: any = await TournamentDetailsRequest.findOneAndUpdate(
      { _id: input.requestId, status: "open" },
      { $set: { status: "answered", reply: input.reply.trim(), answeredAt: now, answeredBy: by, answeredByName: actor.name || "" } },
      { new: true }
    ).lean();
    if (!request) throw new Error("This request is already answered or was cancelled.");
    await resolveTournamentRequestTask(request._id, actor.id);
    await notifyRequester(request, actor).catch((error) => console.error("[tournament-details] reply notice failed", error));
    return { message: "Reply sent back to the requester." };
  }

  const request: any = await TournamentDetailsRequest.findOneAndUpdate({ _id: input.requestId, status: "open" }, { $set: { status: "cancelled" } }, { new: true }).lean();
  if (!request) throw new Error("This request is already closed.");
  await cancelTournamentRequestTask(request._id, `Request withdrawn by ${actor.name || "the requester"}.`);
  return { message: "Request withdrawn." };
}

/**
 * Hourly: from the 1st of each academy month, puts "Send tournament details"
 * in Muktara's tasks (once - the task is keyed by month).
 */
export async function processTournamentDetailsMonth(now = new Date()) {
  await dbConnect();
  const monthKey = monthKeyOf(now);
  const referenceId = monthTaskReferenceId(monthKey);
  // Raised once per month; ticking students off settles it, so there is nothing more to do here.
  if (await InternalTask.exists({ referenceType: "TournamentDetailsMonth", referenceId: new Types.ObjectId(referenceId) })) return { monthKey, raised: false };
  const students = await loadStudents(now);
  if (!students.length) return { monthKey, raised: false };
  // Due on the 10th; a task first raised later in the month (the month this shipped) gets three days.
  const dueDay = academyDateTime(`${monthKey}-${String(MONTH_TASK_DUE_DAY).padStart(2, "0")}`, "20:00");
  const dueAt = dueDay.getTime() > now.getTime() ? dueDay : new Date(now.getTime() + 3 * 86_400_000);
  await raiseTournamentDetailsMonthTask({ referenceId, monthKey, monthLabel: monthLabel(monthKey), students: students.length, dueAt });
  return { monthKey, raised: true };
}
