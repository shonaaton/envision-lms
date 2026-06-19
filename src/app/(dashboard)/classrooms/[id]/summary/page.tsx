import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { resolveScheduledSession } from "@/lib/classroomLiveSession";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { ClassroomSession, LiveQuestion, LiveQuestionResponse } from "@/models/ClassroomLive";
import CsvDownloadButton from "@/components/common/CsvDownloadButton";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function participantHasAccess(classroom: any, role: string, userId: string) {
  if (role === "admin") return true;
  if (role === "student") return (classroom.students || []).some((student: any) => String(student) === userId || String(student?._id || "") === userId);
  return [classroom.coach, classroom.instructor].some((coach: any) => String(coach) === userId || String(coach?._id || "") === userId);
}

function formatDate(value?: string | Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDuration(minutes?: number | null) {
  const total = Math.max(0, Number(minutes || 0));
  if (!total) return "0 min";
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function initials(name?: string) {
  return (name || "Student").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function aggregateStudentResponses(studentResponses: any[]) {
  return studentResponses.reduce(
    (acc, response: any) => {
      acc.score += Number(response?.score || 0);
      acc.completedItems += Number(response?.completedItems || 0);
      acc.totalItems += Number(response?.totalItems || 0);
      acc.hintsUsed += Number(response?.hintsUsed || 0);
      acc.attemptsUsed += Number(response?.attemptsUsed || 0);
      acc.timeTakenSeconds += Number(response?.timeTakenSeconds || 0);
      if (response?.submittedAt && (!acc.submittedAt || new Date(response.submittedAt).getTime() > new Date(acc.submittedAt).getTime())) {
        acc.submittedAt = response.submittedAt;
      }
      if (response?.feedback) acc.feedback = response.feedback;
      if (response?.correct) acc.correctResponses += 1;
      return acc;
    },
    {
      score: 0,
      completedItems: 0,
      totalItems: 0,
      hintsUsed: 0,
      attemptsUsed: 0,
      timeTakenSeconds: 0,
      submittedAt: null as string | Date | null,
      feedback: "",
      correctResponses: 0,
    }
  );
}

export default async function ClassroomSummaryPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { session?: string };
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const userId = (session.user as any).id;
  const role = (session.user as any).role as "student" | "instructor" | "admin";

  await dbConnect();

  const classroom: any = await Classroom.findById(params.id)
    .populate("coach instructor students batches", "name username email")
    .lean();
  if (!classroom) notFound();
  if (!participantHasAccess(classroom, role, userId)) redirect("/dashboard");

  const sessions = Array.isArray(classroom.generatedSessions) && classroom.generatedSessions.length
    ? classroom.generatedSessions
    : classroom.classDate
      ? [resolveScheduledSession(classroom)]
      : [];
  if (!sessions.length) notFound();

  const selectedSession =
    (searchParams.session
      ? sessions.find((item: any) => String(item?._id || "") === String(searchParams.session))
      : null) ||
    sessions
      .slice()
      .sort((a: any, b: any) => new Date(b.actualEndedAt || b.scheduledFor || 0).getTime() - new Date(a.actualEndedAt || a.scheduledFor || 0).getTime())[0];

  if (!selectedSession) notFound();

  const scheduledSessionId = String(selectedSession._id || "");
  const [attendance, liveSession, questions, responses] = await Promise.all([
    Attendance.findOne({ classroom: params.id, scheduledSessionId }).populate("records.student coach", "name username email").lean<any>(),
    ClassroomSession.findOne({ classroom: params.id, scheduledSessionId }).populate("participants.user coach", "name username email").lean<any>(),
    LiveQuestion.find({ classroom: params.id, scheduledSessionId }).sort({ createdAt: 1 }).lean(),
    LiveQuestionResponse.find({ classroom: params.id, scheduledSessionId })
      .populate("student question", "name username email title")
      .sort({ submittedAt: -1 })
      .lean(),
  ]);

  const attendanceRecords = attendance?.records || [];
  const presentCount = attendanceRecords.filter((record: any) => record.status === "present").length;
  const absentCount = attendanceRecords.filter((record: any) => record.status === "absent").length;
  const lateCount = attendanceRecords.filter((record: any) => record.status === "late").length;
  const responseByStudent = new Map<string, any[]>();
  responses.forEach((response: any) => {
    const key = objectId(response.student);
    responseByStudent.set(key, [...(responseByStudent.get(key) || []), response]);
  });

  const studentRows = (classroom.students || []).map((student: any) => {
    const studentId = objectId(student);
    const attendanceRecord = attendanceRecords.find((record: any) => objectId(record.student) === studentId);
    const studentResponses = responseByStudent.get(studentId) || [];
    const responseSummary = aggregateStudentResponses(studentResponses);
    const timePresentMinutes = liveSession?.participants?.find((participant: any) => objectId(participant.user) === studentId)
      ? Math.max(
          0,
          Math.round(
            (new Date(
              liveSession.participants.find((participant: any) => objectId(participant.user) === studentId)?.lastSeenAt || 0
            ).getTime() -
              new Date(
                liveSession.participants.find((participant: any) => objectId(participant.user) === studentId)?.firstSeenAt || 0
              ).getTime()) /
              60000
          )
        )
      : 0;
    const accuracy = responseSummary.totalItems > 0
      ? Math.round((responseSummary.completedItems / Math.max(1, responseSummary.totalItems)) * 100)
      : studentResponses.length
        ? Math.round((responseSummary.correctResponses / Math.max(1, studentResponses.length)) * 100)
        : 0;
    return {
      id: studentId,
      name: student.name,
      username: student.username || student.email || "",
      attendance: attendanceRecord?.status || "pending",
      note: attendanceRecord?.note || "",
      timePresentMinutes,
      score: responseSummary.score,
      completedItems: responseSummary.completedItems,
      totalItems: responseSummary.totalItems,
      hintsUsed: responseSummary.hintsUsed,
      attemptsUsed: responseSummary.attemptsUsed,
      timeTakenSeconds: responseSummary.timeTakenSeconds,
      accuracy,
      submittedAt: responseSummary.submittedAt,
      feedback: responseSummary.feedback,
    };
  });

  const totalQuizPoints = responses.reduce((sum: number, response: any) => sum + Number(response.score || 0), 0);
  const summary = selectedSession.summary || attendance?.metadata?.summary || {};
  const totalQuestionItems = questions.reduce((sum: number, question: any) => sum + Math.max(1, question.items?.length || 1), 0);
  const averageAccuracy = studentRows.length ? Math.round(studentRows.reduce((sum: number, row: any) => sum + Number(row.accuracy || 0), 0) / Math.max(1, studentRows.length)) : 0;
  const topScorer = studentRows.slice().sort((a: any, b: any) => b.score - a.score)[0] || null;
  const studentExportRows = studentRows.map((row: any) => [
    row.name,
    row.username || "",
    row.attendance,
    row.timePresentMinutes,
    row.score,
    `${row.accuracy}%`,
    row.attemptsUsed,
    row.hintsUsed,
    `${row.completedItems}/${row.totalItems || totalQuestionItems}`,
    row.submittedAt ? formatDateTime(row.submittedAt) : "Not submitted",
    row.feedback || "",
  ]);
  const responseExportRows = responses.map((response: any) => [
    response.student?.name || "Student",
    response.question?.title || "Classroom quiz",
    Number(response.score || 0),
    response.correct ? "Yes" : "No",
    Number(response.timeTakenSeconds || 0),
    Number(response.attemptsUsed || 0),
    Number(response.hintsUsed || 0),
    response.submittedAt ? formatDateTime(response.submittedAt) : "",
  ]);

  return (
    <div className="space-y-5 text-slate-950">
      <section className="rounded-[28px] border border-brand/10 bg-white px-5 py-5 shadow-[0_24px_60px_rgba(90,19,114,0.12)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-brand/70">Class Summary</div>
            <h1 className="mt-1 text-3xl font-black text-brand">{classroom.title}</h1>
            <p className="mt-2 text-sm text-slate-600">
              {classroom.courseName || "General course"} - {classroom.levelName || "Level not set"} - {selectedSession.topicName || classroom.topicName || "Topic not set"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/classrooms" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">Back to Classes</Link>
            {role === "admin" ? (
              <>
                <CsvDownloadButton
                  filename={`class-summary-${params.id}-${scheduledSessionId}.csv`}
                  headers={["Student", "Username / Email", "Attendance", "Time Present (min)", "Quiz Score", "Accuracy", "Attempts", "Hints", "Completed Items", "Submitted At", "Feedback"]}
                  rows={studentExportRows}
                  label="Export Student Report"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
                />
                <CsvDownloadButton
                  filename={`class-quiz-records-${params.id}-${scheduledSessionId}.csv`}
                  headers={["Student", "Quiz", "Score", "Correct", "Time (sec)", "Attempts", "Hints", "Submitted At"]}
                  rows={responseExportRows}
                  label="Export Quiz Records"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
                />
              </>
            ) : null}
            {["admin", "instructor"].includes(role) && !["completed", "cancelled", "rescheduled", "missed"].includes(String(selectedSession.status || "").toLowerCase()) ? (
              <Link href={`/classrooms/${params.id}/live?session=${scheduledSessionId}`} className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-bold text-white">Open Scheduled Classroom</Link>
            ) : null}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Status" value={String(selectedSession.status || classroom.status || "scheduled")} />
          <StatCard label="Coach" value={classroom.coach?.name || classroom.instructor?.name || "Not assigned"} />
          <StatCard label="Students Assigned" value={String((classroom.students || []).length)} />
          <StatCard label="Start" value={formatDateTime(selectedSession.actualStartedAt || selectedSession.scheduledFor)} />
          <StatCard label="End" value={formatDateTime(selectedSession.actualEndedAt || liveSession?.endedAt)} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <h2 className="text-lg font-black text-slate-950">Session Details</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoTile label="Course" value={classroom.courseName || "General"} />
            <InfoTile label="Level" value={classroom.levelName || "Not set"} />
            <InfoTile label="Topic" value={selectedSession.topicName || classroom.topicName || "Not set"} />
            <InfoTile label="Duration" value={formatDuration(selectedSession.teachingMinutes || attendance?.teachingMinutes || selectedSession.durationMinutes || classroom.durationMinutes)} />
            <InfoTile label="Meeting Link" value={classroom.meetingUrl ? "Configured" : "Not added"} />
            <InfoTile label="Meeting Status" value={liveSession?.status || "No live record"} />
            <InfoTile label="Students Present" value={String(presentCount)} />
            <InfoTile label="Students Absent" value={String(absentCount)} />
            <InfoTile label="Students Late" value={String(lateCount)} />
            <InfoTile label="Quiz Points Earned" value={String(totalQuizPoints)} />
            <InfoTile label="Question Items" value={String(totalQuestionItems)} />
            <InfoTile label="Average Accuracy" value={`${averageAccuracy}%`} />
            <InfoTile label="Top Scorer" value={topScorer ? `${topScorer.name} (${topScorer.score})` : "No submissions"} />
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-bold text-slate-900">Session Summary</div>
            <div className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
              {summary?.notes || summary?.summaryText || selectedSession.notes || "No session summary has been saved yet."}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <h2 className="text-lg font-black text-slate-950">Scheduled Sessions</h2>
          <div className="mt-4 space-y-2">
            {sessions.map((sessionItem: any) => (
              <Link
                key={String(sessionItem._id)}
                href={`/classrooms/${params.id}/summary?session=${sessionItem._id}`}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${String(sessionItem._id) === scheduledSessionId ? "border-purple-200 bg-purple-50" : "border-slate-200 bg-slate-50"}`}
              >
                <div>
                  <div className="font-bold text-slate-900">{sessionItem.topicName || `Session ${sessionItem.sessionNumber || ""}`}</div>
                  <div className="text-xs text-slate-500">{formatDate(sessionItem.scheduledFor)} - {sessionItem.startTime || "--"}</div>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700">{String(sessionItem.status || "scheduled")}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
        <h2 className="text-lg font-black text-slate-950">Attendance, Quiz Results, and Participation</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-3">Student</th>
                <th className="px-3 py-3">Attendance</th>
                <th className="px-3 py-3">Time Present</th>
                <th className="px-3 py-3">Quiz Score</th>
                <th className="px-3 py-3">Accuracy</th>
                <th className="px-3 py-3">Attempts</th>
                <th className="px-3 py-3">Hints</th>
                <th className="px-3 py-3">Completed Items</th>
                <th className="px-3 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {studentRows.map((row: any) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-purple-100 text-xs font-bold text-purple-800">{initials(row.name)}</div>
                      <div>
                        <div className="font-semibold text-slate-950">{row.name}</div>
                        <div className="text-xs text-slate-500">{row.username || "-"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 capitalize">{row.attendance}</td>
                  <td className="px-3 py-3">{formatDuration(row.timePresentMinutes)}</td>
                  <td className="px-3 py-3">{row.score}</td>
                  <td className="px-3 py-3">{row.accuracy}%</td>
                  <td className="px-3 py-3">{row.attemptsUsed}</td>
                  <td className="px-3 py-3">{row.hintsUsed}</td>
                  <td className="px-3 py-3">{row.completedItems}/{row.totalItems || totalQuestionItems}</td>
                  <td className="px-3 py-3">{row.submittedAt ? formatDateTime(row.submittedAt) : "Not submitted"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <h2 className="text-lg font-black text-slate-950">Quiz Records</h2>
          <div className="mt-4 space-y-3">
            {responses.length ? responses.map((response: any) => (
              <div key={objectId(response._id)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">{response.student?.name || "Student"}</div>
                    <div className="text-xs text-slate-500">{response.question?.title || "Classroom quiz"}</div>
                  </div>
                  <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">{Number(response.score || 0)} pts</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <InfoTile label="Correct" value={response.correct ? "Yes" : "No"} />
                  <InfoTile label="Time" value={`${Number(response.timeTakenSeconds || 0)} sec`} />
                  <InfoTile label="Attempts" value={Number(response.attemptsUsed || 0)} />
                  <InfoTile label="Hints" value={Number(response.hintsUsed || 0)} />
                </div>
              </div>
            )) : <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No quiz submissions were recorded for this session.</div>}
          </div>
        </div>

        <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <h2 className="text-lg font-black text-slate-950">Session Notes & Linked Data</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoTile label="Homework Linked" value={String(summary?.homeworkLinked || 0)} />
            <InfoTile label="Class Notes" value={summary?.notes ? "Available" : "Not saved"} />
            <InfoTile label="Quiz Count" value={String(questions.length)} />
            <InfoTile label="Attendance Saved" value={attendance ? "Yes" : "No"} />
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            {summary?.coachComment || summary?.notes || "No additional class notes were stored for this session."}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}
