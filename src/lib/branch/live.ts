import "server-only";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { academyDateTime } from "@/lib/academyTime";
import { isJoinWindowOpenOnServer } from "@/lib/classroomSessions";
import { Classroom } from "@/models/Classroom";
import { ClassroomSession } from "@/models/ClassroomLive";
import { BranchSlot } from "@/models/Branch";
import type { BranchKey } from "./scope";
import { BRANCH_LABELS } from "./scope";
import { BranchError } from "./errors";
import { getRegister, saveRegister } from "./attendance";
import { holidayFor } from "./comms";
import { classOn } from "./classSessions";
import { isAttendanceStatus, slotLabel, todayKey } from "./rules";

/**
 * A branch's online class in the academy's live room.
 *
 * The live room (board, PGN library, puzzles, student moves, chat, summary) is
 * built on `Classroom`, so each online BranchSlot gets one Classroom with
 * `branch` + `branchSlot`, and each day it meets gets one generated session
 * (`branchDate`). The Classroom model hides these from every online query, and
 * the live room skips credits, coach pay and no-show automation for them. The
 * register stays the branch's own: ending the class writes that day's
 * BranchAttendance (finishBranchLiveClass), never the online Attendance.
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);

type Actor = { id: string; name?: string };
/** Who is opening the room: staff become its coach when it has none yet. */
type Opener = Actor & { staff: boolean };

function minutesBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  return minutes > 0 ? minutes : 60;
}

async function onlineSlot(branch: BranchKey, slotId: string) {
  if (!isObjectId(slotId)) throw new BranchError("Class time not found.", 404);
  const slot: any = await BranchSlot.findOne({ _id: slotId, branch }).lean();
  if (!slot) throw new BranchError("Class time not found.", 404);
  if (slot.mode !== "online") throw new BranchError("This is a class at the centre. Only online classes have a live room.");
  if (slot.isActive === false) throw new BranchError("This class time is switched off.");
  return slot;
}

/** The class's time that day: its own, or the moved / extra meeting's. */
async function meetingOn(slot: any, date: string) {
  const occurrence = await classOn(slot, date);
  if (!occurrence) throw new BranchError("This class doesn't meet that day.", 409);
  return { startTime: occurrence.startTime, endTime: occurrence.endTime };
}

/** The students on that day's register (members, less moves out, plus moves in and guests). */
async function dayRoster(branch: BranchKey, slotId: string, date: string) {
  const register = await getRegister(branch, slotId, date);
  const rows = register.rows.filter((row: any) => !row.left && row.userId);
  return { register, rows, userIds: rows.map((row: any) => row.userId as string) };
}

export type BranchLiveRoom = { classroomId: string; sessionId: string; slotLabel: string; date: string };

/**
 * Finds or creates the live room for one online class on one day, with that
 * day's register as its roster. Safe to call from two people at once: the
 * classroom is an upsert on (branch, branchSlot) and the session is pushed
 * only when no session for the day exists yet.
 */
export async function openBranchLiveRoom(branch: BranchKey, slotId: string, date: string, actor: Opener): Promise<BranchLiveRoom> {
  await dbConnect();
  const slot = await onlineSlot(branch, slotId);
  if (date !== todayKey()) throw new BranchError("The live room opens on the day of the class.");
  const closedFor = await holidayFor(branch, slot._id, date);
  if (closedFor) throw new BranchError(closedFor.startsWith("Class ") ? `${closedFor}.` : `The centre is closed today (${closedFor}).`);
  const meeting = await meetingOn(slot, date);
  const { userIds } = await dayRoster(branch, slotId, date);
  const label = slotLabel(slot);
  const durationMinutes = minutesBetween(meeting.startTime, meeting.endTime);

  const filter = { branch, branchSlot: slot._id };
  const roomFields = {
    title: `${BRANCH_LABELS[branch]} · ${label}`,
    meetingUrl: slot.meetingUrl || "",
    isActive: true,
  };
  let classroom: any;
  try {
    classroom = await Classroom.findOneAndUpdate(
      filter,
      {
        $set: roomFields,
        $setOnInsert: { classroomType: "series", status: "scheduled", useCustomTopic: true, startDate: academyDateTime(date) },
        $addToSet: { students: { $each: userIds } },
      },
      { upsert: true, new: true }
    ).lean();
  } catch (error: any) {
    // Two first openers at once: the loser reads the winner's classroom.
    if (error?.code !== 11000) throw error;
    classroom = await Classroom.findOneAndUpdate(filter, { $set: roomFields, $addToSet: { students: { $each: userIds } } }, { new: true }).lean();
  }

  // The live room names a coach: the class's own coach (Online Classes), else
  // the first staff member to open it. Pay never reads a branch classroom.
  if (slot.coach && String(classroom.coach || "") !== String(slot.coach)) {
    await Classroom.updateOne(filter, { $set: { coach: slot.coach } });
  } else if (!slot.coach && actor.staff && !classroom.coach) {
    await Classroom.updateOne({ ...filter, coach: { $exists: false } }, { $set: { coach: actor.id } });
  }

  const sessions: any[] = classroom.generatedSessions || [];
  let session = sessions.find((item) => item.branchDate === date);
  if (!session) {
    await Classroom.updateOne(
      { ...filter, "generatedSessions.branchDate": { $ne: date } },
      {
        $push: {
          generatedSessions: {
            sessionNumber: sessions.length + 1,
            topicName: label,
            scheduledFor: academyDateTime(date),
            startTime: meeting.startTime,
            durationMinutes,
            status: "scheduled",
            students: userIds,
            branchDate: date,
          },
        },
      }
    );
    const fresh: any = await Classroom.findOne(filter).select("generatedSessions").lean();
    session = (fresh?.generatedSessions || []).find((item: any) => item.branchDate === date);
  } else if (!session.actualEndedAt) {
    // The register changed since (a move or a guest): the room follows it, and
    // the class keeps its time if the slot was edited after it started.
    await Classroom.updateOne(
      { ...filter, "generatedSessions._id": session._id },
      {
        $set: {
          "generatedSessions.$.students": userIds,
          ...(session.actualStartedAt ? {} : { "generatedSessions.$.startTime": meeting.startTime, "generatedSessions.$.durationMinutes": durationMinutes }),
        },
      }
    );
  }
  if (!session) throw new BranchError("The live room could not be opened. Try again.", 500);
  return { classroomId: id(classroom._id), sessionId: id(session._id), slotLabel: label, date };
}

/**
 * The live room a branch student may join now, or why not. Students never
 * create a day's session before it is due: the room opens 15 minutes before
 * the class, like the online academy's.
 */
export async function studentLiveRoom(branch: BranchKey, slotId: string, date: string, student: { id: string; userId: string; name?: string }) {
  await dbConnect();
  const slot = await onlineSlot(branch, slotId);
  const { userIds } = await dayRoster(branch, slotId, date);
  if (!userIds.includes(student.userId)) throw new BranchError("You are not on this class today.", 403);
  const closedFor = await holidayFor(branch, slot._id, date);
  if (closedFor) throw new BranchError(closedFor.startsWith("Class ") ? `${closedFor}.` : `No class today (${closedFor}).`, 409);
  const meeting = await meetingOn(slot, date);
  const durationMinutes = minutesBetween(meeting.startTime, meeting.endTime);
  const probe = { scheduledFor: academyDateTime(date), startTime: meeting.startTime, durationMinutes };
  if (date !== todayKey() || !isJoinWindowOpenOnServer(probe)) {
    throw new BranchError("The live room opens 15 minutes before your class starts.", 409);
  }
  const room = await openBranchLiveRoom(branch, slotId, date, { id: student.userId, name: student.name, staff: false });
  const live: any = await ClassroomSession.findOne({ classroom: room.classroomId, scheduledSessionId: room.sessionId }).select("status").lean();
  if (live?.status === "ended") throw new BranchError("Today's class has ended.", 409);
  return room;
}

/** The branch class behind a live room, checked against the caller's branch. */
async function branchClassroom(branch: BranchKey, classroomId: string) {
  if (!isObjectId(classroomId)) throw new BranchError("Class not found.", 404);
  const classroom: any = await Classroom.findOne({ _id: classroomId, branch }).lean();
  if (!classroom?.branchSlot) throw new BranchError("Class not found.", 404);
  return classroom;
}

const ROOM_STATUSES: Record<string, string> = {
  present: "present",
  late: "late",
  excused: "excused",
};

/**
 * The live room's end-of-class summary, written into the day's register.
 *
 * Statuses come from the room (present, late, absent; anything else the
 * online summary offers - no-show, technical issue - is an absence here).
 * Students already marked on the register by hand keep their topic, note and
 * paper homework. The topic is written only when the coach set one in the
 * room; the register's own topic box stays the place to record it otherwise.
 */
export async function finishBranchLiveClass(branch: BranchKey, input: any, actor: Actor) {
  await dbConnect();
  const classroomId = String(input?.classroomId || "");
  const sessionId = String(input?.sessionId || "");
  const classroom = await branchClassroom(branch, classroomId);
  const session = (classroom.generatedSessions || []).find((item: any) => id(item._id) === sessionId);
  if (!session?.branchDate) throw new BranchError("Class not found.", 404);
  const slotId = id(classroom.branchSlot);
  const date = String(session.branchDate);

  const statusByUser = new Map<string, string>();
  for (const record of Array.isArray(input?.records) ? input.records.slice(0, 60) : []) {
    const userId = String(record?.student || "");
    if (!userId) continue;
    const raw = String(record?.status || "");
    statusByUser.set(userId, ROOM_STATUSES[raw] || "absent");
  }
  const roomTopic = String(input?.topic || "").trim().slice(0, 200);
  const topic = roomTopic && roomTopic !== session.topicName ? roomTopic : "";

  const { register } = await dayRoster(branch, slotId, date);
  const rows = register.rows
    .filter((row: any) => statusByUser.has(row.userId) || row.status)
    .map((row: any) => {
      const fromRoom = statusByUser.get(row.userId);
      const status = fromRoom || row.status;
      return {
        studentId: row.studentId,
        status: isAttendanceStatus(status) ? status : "absent",
        topic: topic && (status === "present" || status === "late") ? topic : row.topic,
        note: row.note,
        homeworkNote: row.homeworkNote,
      };
    });
  if (!rows.length) throw new BranchError("Nobody from today's register was in this class.");
  return saveRegister(branch, slotId, date, { rows }, actor);
}
