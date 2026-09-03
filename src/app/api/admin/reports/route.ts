import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { deriveScheduledSessionStatus, isSessionUpcomingLike } from "@/lib/classroomSessions";
import { effectiveSessionCoachId, summarizeCoachSessions } from "@/lib/teachingStats";

export const dynamic = "force-dynamic";

type RangeLike = { from?: Date; to?: Date };

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function workbook(title: string, headers: string[], rows: unknown[][]) {
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><h2>${escapeHtml(title)}</h2><table border="1"><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></body></html>`;
}

function csv(headers: string[], rows: unknown[][]) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
}

function buildRange(url: URL): RangeLike {
  const fromValue = url.searchParams.get("from");
  const toValue = url.searchParams.get("to");
  return {
    from: fromValue ? new Date(fromValue) : undefined,
    to: toValue ? new Date(`${toValue}T23:59:59.999`) : undefined,
  };
}

function inRange(value?: Date | string | null, range?: RangeLike) {
  if (!value) return !range?.from && !range?.to;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  if (range?.from && time < range.from.getTime()) return false;
  if (range?.to && time > range.to.getTime()) return false;
  return true;
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value?: Date | string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDuration(minutes?: number | null) {
  const total = Math.max(0, Number(minutes || 0));
  if (!total) return "0 min";
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function tournamentAccessState(status: string) {
  const value = String(status || "").toLowerCase();
  if (value === "live") return "Joinable";
  if (value === "upcoming") return "Scheduled";
  return "Closed";
}

function plainSessionRows(classrooms: any[], range: RangeLike) {
  return classrooms.flatMap((classroom: any) => {
    const sessions = Array.isArray(classroom.generatedSessions) && classroom.generatedSessions.length
      ? classroom.generatedSessions
      : classroom.classDate
        ? [{
            _id: `${classroom._id}-default`,
            scheduledFor: classroom.classDate,
            startTime: classroom.startTime,
            durationMinutes: classroom.durationMinutes,
            topicName: classroom.topicName,
            status: classroom.status || "scheduled",
            teachingMinutes: classroom.durationMinutes,
          }]
        : [];

    return sessions
      .filter((session: any) => inRange(session.actualStartedAt || session.scheduledFor, range))
      .map((session: any) => {
        const derivedStatus = deriveScheduledSessionStatus(session, new Date());
        return {
          classroomId: String(classroom._id),
          sessionId: String(session._id || ""),
          title: classroom.title || "Classroom",
          classType: classroom.classroomType === "demo" ? "Demo" : "Regular",
          courseName: classroom.courseName || "",
          levelName: classroom.levelName || "",
          topicName: session.topicName || classroom.topicName || "",
          coachName: classroom.coach?.name || classroom.instructor?.name || "Not assigned",
          batchNames: (classroom.batches || []).map((batch: any) => batch.name).join(", "),
          scheduledFor: session.actualStartedAt || session.scheduledFor,
          startTime: session.startTime || classroom.startTime || "",
          durationMinutes: Number(session.durationMinutes || classroom.durationMinutes || 0),
          teachingMinutes: Number(session.durationMinutes || classroom.durationMinutes || session.teachingMinutes || 0),
          status: derivedStatus,
          joinAccess: isSessionUpcomingLike(derivedStatus) ? "Joinable" : "Closed",
          studentCount: Number((classroom.students || []).length),
          meetingConfigured: classroom.meetingUrl ? "Yes" : "No",
        };
      });
  });
}

export async function GET(req: Request) {
  const session = await requireAdminApiAccess(req, "export");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();

  const url = new URL(req.url);
  const type = String(url.searchParams.get("type") || "classrooms");
  const format = String(url.searchParams.get("format") || "csv");
  const studentId = String(url.searchParams.get("studentId") || "");
  const coachId = String(url.searchParams.get("coachId") || "");
  const range = buildRange(url);

  let title = "Admin Report";
  let headers: string[] = [];
  let rows: unknown[][] = [];

  if (type === "classrooms") {
    const classrooms = await Classroom.find({})
      .populate("coach instructor students batches", "name")
      .sort({ updatedAt: -1 })
      .lean();
    const selectedClassrooms = coachId
      ? classrooms.filter((classroom: any) => [classroom.coach, classroom.instructor].map(objectId).includes(coachId))
      : classrooms;
    const sessionRows = plainSessionRows(selectedClassrooms, range);

    title = "Classroom Sessions Report";
    headers = ["Classroom", "Class Type", "Course", "Level", "Topic", "Coach", "Batches", "Date", "Start Time", "Lifecycle", "Join Access", "Planned Duration", "Teaching Time", "Students", "Meeting"];
    rows = sessionRows.map((row) => [
      row.title,
      row.classType,
      row.courseName,
      row.levelName,
      row.topicName,
      row.coachName,
      row.batchNames || "-",
      formatDate(row.scheduledFor),
      row.startTime || "-",
      row.status,
      row.joinAccess,
      formatDuration(row.durationMinutes),
      formatDuration(row.teachingMinutes),
      row.studentCount,
      row.meetingConfigured,
    ]);
  } else if (type === "attendance") {
    const attendanceDocs = await Attendance.find({
      ...(studentId ? { "records.student": studentId } : {}),
    })
      .populate("classroom", "title classroomType courseName levelName topicName coach instructor")
      .populate("records.student coach", "name username email")
      .sort({ sessionDate: -1, createdAt: -1 })
      .lean();

    const filteredDocs = attendanceDocs
      .filter((doc: any) => inRange(doc.sessionDate || doc.createdAt, range))
      .filter((doc: any) => !coachId || [doc.coach, doc.classroom?.coach, doc.classroom?.instructor].map(objectId).includes(coachId));
    title = "Attendance Report";
    headers = ["Classroom", "Class Type", "Course", "Level", "Topic", "Session Date", "Coach", "Student", "Student ID", "Status", "Coach Status", "Teaching Time", "Note"];
    rows = filteredDocs.flatMap((doc: any) =>
      (doc.records || [])
        .filter((record: any) => !studentId || objectId(record.student) === studentId)
        .map((record: any) => [
        doc.classroom?.title || "Classroom",
        doc.classroom?.classroomType === "demo" ? "Demo" : "Regular",
        doc.classroom?.courseName || "",
        doc.classroom?.levelName || "",
        doc.classroom?.topicName || "",
        formatDate(doc.sessionDate),
        doc.coach?.name || "Not assigned",
        record.student?.name || "Student",
        record.student?.username || record.student?.email || "",
        record.status || "pending",
        doc.coachStatus || "pending",
        formatDuration(doc.teachingMinutes),
        record.note || "",
      ])
    );
  } else if (type === "tournaments") {
    const tournaments = await Tournament.find({}).sort({ startAt: -1 }).lean();
    const filteredTournaments = tournaments.filter((tournament: any) => inRange(tournament.startAt || tournament.createdAt, range));
    const games = await TournamentGame.find({ tournament: { $in: filteredTournaments.map((item: any) => item._id) } }).lean();
    const gameMap = new Map<string, any[]>();
    games.forEach((game: any) => {
      const key = String(game.tournament);
      gameMap.set(key, [...(gameMap.get(key) || []), game]);
    });

    title = "Tournament Report";
    headers = ["Tournament", "Type", "Lifecycle", "Play Access", "Start", "Participants", "Current Round", "Configured Rounds", "Live Games", "Completed Games", "Leader", "Top Score"];
    rows = filteredTournaments.map((tournament: any) => {
      const tournamentGames = gameMap.get(String(tournament._id)) || [];
      const liveGames = tournamentGames.filter((game: any) => game.status === "active").length;
      const completedGames = tournamentGames.filter((game: any) => game.status === "completed").length;
      const leader = (tournament.standings || [])[0] || null;
      return [
        tournament.name,
        tournament.type === "arena" ? "Arena" : "Swiss",
        tournament.status,
        tournamentAccessState(tournament.status),
        formatDateTime(tournament.startAt),
        Number((tournament.participants || []).length) + Number((tournament.externalParticipants || []).length),
        Number(tournament.currentRound || 0),
        tournament.type === "swiss" ? Number(tournament.rounds || 0) : Number(tournament.arenaDurationMinutes || 0),
        liveGames,
        completedGames,
        leader?.displayName || "-",
        leader?.points ?? 0,
      ];
    });
  } else if (type === "coaching-hours") {
    const classrooms = await Classroom.find({})
      .populate("coach instructor students batches", "name")
      .populate("generatedSessions.substituteCoach generatedSessions.conductedBy", "name")
      .sort({ updatedAt: -1 })
      .lean();

    const coachGroups = new Map<string, { coachName: string; classrooms: any[] }>();
    const addCoachGroup = (coach: any, classroom: any) => {
      const key = objectId(coach);
      if (!key || (coachId && key !== coachId)) return;
      const current = coachGroups.get(key) || { coachName: coach?.name || "Coach", classrooms: [] as any[] };
      if (!current.classrooms.some((item) => objectId(item._id) === objectId(classroom._id))) {
        current.classrooms.push(classroom);
      }
      coachGroups.set(key, current);
    };

    classrooms.forEach((classroom: any) => {
      addCoachGroup(classroom.coach || classroom.instructor, classroom);
      (classroom.generatedSessions || []).forEach((session: any) => {
        const effectiveCoachId = effectiveSessionCoachId(session, classroom);
        const effectiveCoach = [session.conductedBy, session.substituteCoach, classroom.coach, classroom.instructor]
          .find((candidate: any) => objectId(candidate) === effectiveCoachId);
        addCoachGroup(effectiveCoach, classroom);
      });
    });

    title = "Coaching Hours Report";
    headers = [
      "Coach",
      "Batch",
      "Classes Conducted",
      "Paid Scheduled Hours",
      "Actual Classroom Hours",
      "Demo Classes",
      "Demo Scheduled Hours",
      "Demo Actual Hours",
      "Average Paid Duration",
      "Average Actual Duration",
      "Punctuality Score",
      "Attendance %",
      "Students Taught",
      "Cancelled",
      "Rescheduled",
    ];
    rows = Array.from(coachGroups.entries()).flatMap(([groupCoachId, group]) => {
      const summary = summarizeCoachSessions(group.classrooms, {
        from: range.from || new Date("2000-01-01"),
        to: range.to || new Date("2100-12-31"),
      }, { coachId: groupCoachId });
      if (!summary.batchRows.length) {
        return [[
          group.coachName,
          "Unassigned",
          summary.classesConducted,
          summary.totalHoursConducted.toFixed(2),
          summary.actualHoursConducted.toFixed(2),
          summary.demoClassesConducted,
          summary.demoHoursConducted.toFixed(2),
          summary.demoActualHoursConducted.toFixed(2),
          summary.averageClassDuration,
          summary.averageActualDuration,
          `${summary.punctualityScore}%`,
          summary.attendancePercentage,
          summary.totalStudentsTaught,
          summary.classesCancelled,
          summary.classesRescheduled,
        ]];
      }
      return summary.batchRows.map((batchRow: any) => [
        group.coachName,
        batchRow.batchName,
        batchRow.classesConducted,
        batchRow.hoursConducted.toFixed(2),
        (batchRow.actualHours || 0).toFixed(2),
        summary.demoClassesConducted,
        summary.demoHoursConducted.toFixed(2),
        summary.demoActualHoursConducted.toFixed(2),
        summary.averageClassDuration,
        summary.averageActualDuration,
        `${summary.punctualityScore}%`,
        summary.attendancePercentage,
        summary.totalStudentsTaught,
        summary.classesCancelled,
        summary.classesRescheduled,
      ]);
    });
  } else {
    return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  }

  if (format === "xls") {
    return new NextResponse(workbook(title, headers, rows), {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}-report.xls"`,
      },
    });
  }

  return new NextResponse(csv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-report.csv"`,
    },
  });
}
