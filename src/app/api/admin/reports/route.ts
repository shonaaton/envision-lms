import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { deriveScheduledSessionStatus, isSessionUpcomingLike } from "@/lib/classroomSessions";
import { summarizeCoachSessions } from "@/lib/teachingStats";

export const dynamic = "force-dynamic";

type RangeLike = { from?: Date; to?: Date };

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
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await dbConnect();

  const url = new URL(req.url);
  const type = String(url.searchParams.get("type") || "classrooms");
  const format = String(url.searchParams.get("format") || "csv");
  const range = buildRange(url);

  let title = "Admin Report";
  let headers: string[] = [];
  let rows: unknown[][] = [];

  if (type === "classrooms") {
    const classrooms = await Classroom.find({})
      .populate("coach instructor students batches", "name")
      .sort({ updatedAt: -1 })
      .lean();
    const sessionRows = plainSessionRows(classrooms, range);

    title = "Classroom Sessions Report";
    headers = ["Classroom", "Course", "Level", "Topic", "Coach", "Batches", "Date", "Start Time", "Lifecycle", "Join Access", "Planned Duration", "Teaching Time", "Students", "Meeting"];
    rows = sessionRows.map((row) => [
      row.title,
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
    const attendanceDocs = await Attendance.find({})
      .populate("classroom", "title courseName levelName topicName")
      .populate("records.student coach", "name username")
      .sort({ sessionDate: -1, createdAt: -1 })
      .lean();

    const filteredDocs = attendanceDocs.filter((doc: any) => inRange(doc.sessionDate || doc.createdAt, range));
    title = "Attendance Report";
    headers = ["Classroom", "Course", "Level", "Topic", "Session Date", "Student", "Status", "Coach Status", "Teaching Time", "Note"];
    rows = filteredDocs.flatMap((doc: any) =>
      (doc.records || []).map((record: any) => [
        doc.classroom?.title || "Classroom",
        doc.classroom?.courseName || "",
        doc.classroom?.levelName || "",
        doc.classroom?.topicName || "",
        formatDate(doc.sessionDate),
        record.student?.name || "Student",
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
      .sort({ updatedAt: -1 })
      .lean();

    const coachGroups = new Map<string, { coachName: string; classrooms: any[] }>();
    classrooms.forEach((classroom: any) => {
      const coach = classroom.coach || classroom.instructor || null;
      if (!coach?._id) return;
      const key = String(coach._id);
      const current = coachGroups.get(key) || { coachName: coach.name || "Coach", classrooms: [] as any[] };
      current.classrooms.push(classroom);
      coachGroups.set(key, current);
    });

    title = "Coaching Hours Report";
    headers = [
      "Coach",
      "Batch",
      "Classes Conducted",
      "Paid Scheduled Hours",
      "Actual Classroom Hours",
      "Average Paid Duration",
      "Average Actual Duration",
      "Punctuality Score",
      "Attendance %",
      "Students Taught",
      "Cancelled",
      "Rescheduled",
    ];
    rows = Array.from(coachGroups.values()).flatMap((group) => {
      const summary = summarizeCoachSessions(group.classrooms, {
        from: range.from || new Date("2000-01-01"),
        to: range.to || new Date("2100-12-31"),
      });
      if (!summary.batchRows.length) {
        return [[
          group.coachName,
          "Unassigned",
          summary.classesConducted,
          summary.totalHoursConducted,
          summary.actualHoursConducted,
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
        Number(batchRow.hoursConducted.toFixed(1)),
        Number((batchRow.actualHours || 0).toFixed(1)),
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
