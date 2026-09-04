import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { canAccessFeature } from "@/lib/featureAccess";
import { Attendance } from "@/models/Attendance";
import { ClassroomSession, LiveQuestionResponse } from "@/models/ClassroomLive";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LOOKBACK_DAYS = 120;
const NON_ATTENDING_STATUSES = new Set(["absent", "not_joined", "student_no_show"]);
const ATTENDING_STATUSES = new Set(["present", "late"]);

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanToken(value: string | undefined) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function bearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function canReadDiagnostics(req: Request) {
  const configuredToken = cleanToken(process.env.ATTENDANCE_DIAGNOSTIC_TOKEN);
  if (configuredToken.length >= 24 && bearerToken(req) === configuredToken) return true;

  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !["admin", "sub-admin"].includes(String(role || ""))) return false;
  return canAccessFeature("attendance", session.user as any, "view");
}

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function parseLimit(value: string | null) {
  const parsed = Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(MAX_LIMIT, Math.max(1, Math.round(parsed)));
}

function minutesBetween(start?: Date | string | null, end?: Date | string | null) {
  if (!start || !end) return 0;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0;
  return Math.max(0, Math.round((endTime - startTime) / 60000));
}

function sessionKey(classroomId: string, scheduledSessionId: string) {
  return `${classroomId}:${scheduledSessionId || ""}`;
}

function displayUser(user: any) {
  return {
    id: objectId(user),
    name: user?.name || "Student",
    username: user?.username || "",
    email: user?.email || "",
  };
}

function statusSuggestedFromActivity(minutes: number, submissions: number) {
  if (minutes >= 10 || submissions > 0) return "present";
  if (minutes > 0) return "late";
  return "absent";
}

function issueCodes(input: {
  status: string;
  liveMinutes: number;
  summaryMinutes: number;
  submissions: number;
  hasLiveParticipant: boolean;
  hasSummaryRow: boolean;
}) {
  const codes: string[] = [];
  const activityMinutes = Math.max(input.liveMinutes, input.summaryMinutes);
  const hasActivity = activityMinutes > 0 || input.submissions > 0;
  if (NON_ATTENDING_STATUSES.has(input.status) && hasActivity) codes.push("activity_marked_absent");
  if (input.status === "late" && activityMinutes >= 10) codes.push("long_duration_marked_late");
  if (ATTENDING_STATUSES.has(input.status) && activityMinutes === 0 && input.submissions === 0) codes.push("attending_status_without_activity");
  if (!input.hasLiveParticipant && input.summaryMinutes > 0) codes.push("live_trace_missing_but_summary_has_minutes");
  if (input.hasLiveParticipant && !input.hasSummaryRow) codes.push("summary_row_missing_for_live_participant");
  if (Math.abs(input.liveMinutes - input.summaryMinutes) >= 2 && input.liveMinutes > 0 && input.summaryMinutes > 0) codes.push("live_and_summary_minutes_differ");
  return codes;
}

async function matchingStudentIds(url: URL) {
  const studentId = String(url.searchParams.get("studentId") || "").trim();
  if (studentId && Types.ObjectId.isValid(studentId)) return [new Types.ObjectId(studentId)];

  const studentQuery = String(url.searchParams.get("student") || "").trim().slice(0, 80);
  if (!studentQuery) return null;

  const regex = new RegExp(escapeRegex(studentQuery), "i");
  const users = await User.find({
    role: "student",
    $or: [{ name: regex }, { username: regex }, { email: regex }],
  })
    .select("_id")
    .limit(50)
    .lean();

  return users.map((user: any) => user._id);
}

export async function GET(req: Request) {
  if (!(await canReadDiagnostics(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await dbConnect();

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const to = parseDate(url.searchParams.get("to"), new Date());
  const from = parseDate(
    url.searchParams.get("from"),
    new Date(to.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  );
  const mismatchesOnly = url.searchParams.get("mismatchesOnly") !== "false";
  const classroomId = String(url.searchParams.get("classroomId") || "").trim();
  const scheduledSessionId = String(url.searchParams.get("sessionId") || "").trim();
  const studentIds = await matchingStudentIds(url);

  if (studentIds && !studentIds.length) {
    return NextResponse.json({
      filters: { from, to, classroomId, sessionId: scheduledSessionId, mismatchesOnly },
      count: 0,
      rows: [],
    });
  }

  const attendanceFilter: Record<string, any> = { sessionDate: { $gte: from, $lte: to } };
  if (classroomId && Types.ObjectId.isValid(classroomId)) attendanceFilter.classroom = classroomId;
  if (scheduledSessionId) attendanceFilter.scheduledSessionId = scheduledSessionId;
  if (studentIds) attendanceFilter["records.student"] = { $in: studentIds };

  const attendanceDocs: any[] = await Attendance.find(attendanceFilter)
    .populate("records.student", "name username email")
    .sort({ sessionDate: -1, updatedAt: -1 })
    .limit(limit)
    .lean();

  const keys = attendanceDocs.map((doc) => sessionKey(objectId(doc.classroom), String(doc.scheduledSessionId || "")));
  const classroomIds = [...new Set(attendanceDocs.map((doc) => objectId(doc.classroom)).filter(Boolean))];
  const sessionIds = [...new Set(attendanceDocs.map((doc) => String(doc.scheduledSessionId || "")).filter(Boolean))];

  const [classrooms, liveSessions, responseCounts] = await Promise.all([
    classroomIds.length
      ? Classroom.find({ _id: { $in: classroomIds } })
          .select("title courseName levelName generatedSessions")
          .lean()
      : [],
    keys.length
      ? ClassroomSession.find({
          classroom: { $in: classroomIds },
          scheduledSessionId: { $in: sessionIds },
        })
          .populate("participants.user", "name username email")
          .lean()
      : [],
    keys.length
      ? LiveQuestionResponse.aggregate([
          {
            $match: {
              classroom: { $in: classroomIds.map((id) => new Types.ObjectId(id)) },
              scheduledSessionId: { $in: sessionIds },
              ...(studentIds ? { student: { $in: studentIds } } : {}),
            },
          },
          { $group: { _id: { classroom: "$classroom", scheduledSessionId: "$scheduledSessionId", student: "$student" }, submissions: { $sum: 1 } } },
        ])
      : [],
  ]);

  const classroomById = new Map(classrooms.map((classroom: any) => [objectId(classroom), classroom]));
  const liveBySession = new Map(liveSessions.map((live: any) => [sessionKey(objectId(live.classroom), String(live.scheduledSessionId || "")), live]));
  const submissionsByStudentSession = new Map(
    responseCounts.map((row: any) => [
      `${sessionKey(objectId(row._id.classroom), String(row._id.scheduledSessionId || ""))}:${objectId(row._id.student)}`,
      Number(row.submissions || 0),
    ])
  );
  const selectedStudentIds = studentIds ? new Set(studentIds.map((id) => objectId(id))) : null;

  const rows = attendanceDocs.flatMap((attendance: any) => {
    const classroom = classroomById.get(objectId(attendance.classroom));
    const live = liveBySession.get(sessionKey(objectId(attendance.classroom), String(attendance.scheduledSessionId || "")));
    const scheduledSession = (classroom?.generatedSessions || []).find((item: any) => String(item._id || "") === String(attendance.scheduledSessionId || ""));
    const summaryRows = Array.isArray(attendance.metadata?.summary?.rows) ? attendance.metadata.summary.rows : [];

    return (attendance.records || [])
      .filter((record: any) => !selectedStudentIds || selectedStudentIds.has(objectId(record.student)))
      .map((record: any) => {
        const studentId = objectId(record.student);
        const participant = (live?.participants || []).find((item: any) => objectId(item.user) === studentId);
        const summaryRow = summaryRows.find((item: any) => objectId(item.student?._id || item.student) === studentId);
        const liveMinutes = participant ? minutesBetween(participant.firstSeenAt, participant.lastSeenAt || live?.endedAt) : 0;
        const summaryMinutes = Math.max(0, Number(summaryRow?.timeMinutes || 0));
        const submissions = submissionsByStudentSession.get(`${sessionKey(objectId(attendance.classroom), String(attendance.scheduledSessionId || ""))}:${studentId}`) || Number(summaryRow?.submissions || 0);
        const status = String(record.status || "absent");
        const issues = issueCodes({
          status,
          liveMinutes,
          summaryMinutes,
          submissions,
          hasLiveParticipant: Boolean(participant),
          hasSummaryRow: Boolean(summaryRow),
        });

        return {
          issues,
          savedStatus: status,
          suggestedStatus: statusSuggestedFromActivity(Math.max(liveMinutes, summaryMinutes), submissions),
          student: displayUser(record.student),
          classroom: {
            id: objectId(attendance.classroom),
            title: classroom?.title || "Classroom",
            courseName: classroom?.courseName || "",
            levelName: classroom?.levelName || "",
          },
          session: {
            id: String(attendance.scheduledSessionId || ""),
            date: attendance.sessionDate,
            topicName: scheduledSession?.topicName || classroom?.topicName || classroom?.title || "",
            status: scheduledSession?.status || "",
            classOutcome: attendance.metadata?.classOutcome || attendance.metadata?.summary?.classOutcome || "",
          },
          minutes: {
            live: liveMinutes,
            savedSummary: summaryMinutes,
            effective: Math.max(liveMinutes, summaryMinutes),
          },
          submissions,
          liveParticipant: participant
            ? {
                firstSeenAt: participant.firstSeenAt || null,
                lastSeenAt: participant.lastSeenAt || null,
                leftAt: participant.leftAt || null,
                presenceStatus: participant.presenceStatus || "active",
              }
            : null,
          attendanceId: objectId(attendance),
          markedAt: attendance.updatedAt || attendance.createdAt || null,
        };
      });
  });

  const filteredRows = mismatchesOnly ? rows.filter((row) => row.issues.length > 0) : rows;

  return NextResponse.json({
    filters: {
      from,
      to,
      classroomId: classroomId || null,
      sessionId: scheduledSessionId || null,
      student: url.searchParams.get("student") || null,
      studentId: url.searchParams.get("studentId") || null,
      mismatchesOnly,
      limit,
    },
    count: filteredRows.length,
    issueLegend: {
      activity_marked_absent: "Saved attendance says absent/not joined/no-show, but minutes or quiz submissions exist.",
      long_duration_marked_late: "Saved attendance says late, but the recorded activity is 10 minutes or more.",
      attending_status_without_activity: "Saved attendance says present/late, but no join minutes or submissions were found.",
      live_trace_missing_but_summary_has_minutes: "The durable summary has minutes, but the live participant row is no longer present.",
      summary_row_missing_for_live_participant: "The live participant row exists, but the saved closeout summary is missing that student row.",
      live_and_summary_minutes_differ: "Live participant minutes and saved closeout summary minutes differ by at least 2 minutes.",
    },
    rows: filteredRows,
  });
}
