import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { resolveScheduledSession } from "@/lib/classroomLiveSession";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { ClassroomSession, LiveQuestion, LiveQuestionResponse } from "@/models/ClassroomLive";
import CsvDownloadButton from "@/components/common/CsvDownloadButton";
import SessionResourceReview from "@/components/classroom/SessionResourceReview";
import JoinScheduledSessionButton from "@/components/classroom/JoinScheduledSessionButton";
import { formatAcademyDateTime } from "@/lib/academyTime";
import { getSessionStart } from "@/lib/classroomSessions";
import { coachCanAccessClassroomSession } from "@/lib/classroomCoachAccess";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function studentsForSession(classroom: any, scheduledSession?: any) {
  return Array.isArray(scheduledSession?.students) && scheduledSession.students.length ? scheduledSession.students : classroom.students || [];
}

function participantHasAccess(classroom: any, role: string, userId: string, scheduledSession?: any) {
  if (role === "admin" || role === "sub-admin") return true;
  if (role === "student") return studentsForSession(classroom, scheduledSession).some((student: any) => String(student) === userId || String(student?._id || "") === userId);
  return coachCanAccessClassroomSession(classroom, userId, String(scheduledSession?._id || ""));
}

function formatDate(value?: string | Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "Not set";
  return formatAcademyDateTime(value);
}

function dateParam(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(minutes?: number | null) {
  const total = Math.max(0, Number(minutes || 0));
  if (!total) return "0 min";
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function minutesBetween(start?: string | Date | null, end?: string | Date | null) {
  if (!start || !end) return 0;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0;
  return Math.max(0, Math.round((endTime - startTime) / 60000));
}

function resolveAttendanceStatus(savedStatus: string, timePresentMinutes: number, submissions: number) {
  if (!["absent", "not_joined", "student_no_show"].includes(savedStatus)) return savedStatus;
  if (timePresentMinutes >= 10 || submissions > 0) return "present";
  if (timePresentMinutes > 0) return "late";
  return savedStatus;
}

function cleanMoveList(value: any) {
  return Array.isArray(value) ? value.map((move) => String(move || "").trim()).filter(Boolean) : [];
}

function buildSessionReviewResources(liveSession: any) {
  const usedResources = Array.isArray(liveSession?.usedResources) ? liveSession.usedResources.filter(Boolean) : [];
  const loadedCollection = Array.isArray(liveSession?.challenge?.pgnCollection) ? liveSession.challenge.pgnCollection.filter(Boolean) : [];
  const enrichResource = (resource: any) => {
    if (!resource || resource.pgn || cleanMoveList(resource.moves).length || cleanMoveList(resource.liveMoves).length) return resource;
    const match = loadedCollection.find((item: any) =>
      (resource.id && String(item.id || item._id || "") === String(resource.id))
      || (resource.title && item.title === resource.title)
    );
    if (!match) return resource;
    return {
      ...resource,
      pgn: match.pgn || resource.pgn,
      startFen: resource.startFen || match.startFen || match.fen,
      moves: cleanMoveList(match.moves || match.moveHistory),
      moveCount: resource.moveCount || match.moveCount,
    };
  };
  const fallbackResources = liveSession?.pgn || liveSession?.fen
    ? [{ type: liveSession?.pgn ? "pgn" : "position", title: liveSession?.pgnTitle || "Classroom board", pgn: liveSession?.pgn, fen: liveSession?.fen }]
    : [];
  const resources = usedResources.length ? usedResources.map(enrichResource) : fallbackResources.map(enrichResource);
  const finalMoves = cleanMoveList(liveSession?.pgnMoves).length ? cleanMoveList(liveSession?.pgnMoves) : cleanMoveList(liveSession?.moveHistory);
  // Sessions saved after the closeout snapshot already carry these moves on the last used resource.
  const lastResourceMoves = cleanMoveList(resources[resources.length - 1]?.liveMoves);
  const alreadyCaptured = lastResourceMoves.length > 0 && lastResourceMoves.join(" ") === finalMoves.join(" ");
  if (finalMoves.length && !alreadyCaptured) {
    const loadedStartFen = [...usedResources].reverse().find((resource: any) => resource?.fen)?.fen;
    resources.push({
      type: "moves",
      title: "Final classroom board",
      fen: liveSession?.fen,
      startFen: liveSession?.navigationStartFen || loadedStartFen || "start",
      moves: finalMoves,
      moveCount: finalMoves.length,
      loadedAt: liveSession?.endedAt || liveSession?.updatedAt || liveSession?.createdAt || "final-board",
    });
  }
  return resources;
}

function attemptText(result: any) {
  const attempts = cleanMoveList(result?.attempts);
  if (attempts.length) return attempts.join(", ");
  const single = String(result?.submittedMove || result?.answer || "").trim();
  return single;
}

function responseAnswerText(response: any) {
  const sequence = cleanMoveList(response?.submittedSequence);
  if (sequence.length) return sequence.join(" ");
  return String(response?.submittedMove || "").trim();
}

function buildQuizReview(questions: any[], responses: any[], studentRows: any[]) {
  const responsesByQuestion = new Map<string, any[]>();
  responses.forEach((response: any) => {
    const key = response?.question?._id?.toString?.() ?? response?.question?.toString?.() ?? "";
    if (!key) return;
    responsesByQuestion.set(key, [...(responsesByQuestion.get(key) || []), response]);
  });

  return questions.map((question: any) => {
    const questionId = question?._id?.toString?.() ?? "";
    const questionResponses = responsesByQuestion.get(questionId) || [];
    const responseByStudentId = new Map<string, any>();
    questionResponses.forEach((response: any) => {
      const key = response?.student?._id?.toString?.() ?? response?.student?.toString?.() ?? "";
      if (key && !responseByStudentId.has(key)) responseByStudentId.set(key, response);
    });
    const items = Array.isArray(question?.items) && question.items.length ? question.items : [];
    const answers = studentRows
      .map((row: any) => {
        const response = responseByStudentId.get(row.id);
        if (!response) return { student: row.name, answered: false, answer: "", correct: false, items: [] as any[] };
        return {
          student: row.name,
          answered: true,
          answer: responseAnswerText(response),
          correct: Boolean(response?.correct),
          score: Number(response?.score || 0),
          items: items.map((item: any) => {
            const result = response?.itemResults?.[item.id] || {};
            return {
              id: item.id,
              title: item.pgnTitle || item.title || "Position",
              solution: cleanMoveList(item.solution).join(" "),
              answer: attemptText(result),
              solved: Boolean(result?.solved),
              skipped: Boolean(result?.skipped),
            };
          }),
        };
      })
      .filter((answer: any) => answer.answered || items.length === 0);
    return {
      id: questionId,
      title: question?.title || "Question",
      type: String(question?.type || "ask_everyone").replace(/_/g, " "),
      startFen: question?.fen || "",
      solution: cleanMoveList(question?.solution).join(" "),
      itemCount: items.length,
      answeredCount: responseByStudentId.size,
      correctCount: questionResponses.filter((response: any) => response?.correct).length,
      answers,
    };
  });
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
  const role = (session.user as any).role as "student" | "instructor" | "admin" | "sub-admin";
  if (!(await canAccessFeature("classrooms", session.user as any, "view"))) redirect("/dashboard");

  await dbConnect();

  const classroom: any = await Classroom.findById(params.id)
    .populate("coach instructor students batches", "name username email")
    .populate("generatedSessions.students", "name username email")
    .lean();
  if (!classroom) notFound();

  const allSessions = Array.isArray(classroom.generatedSessions) && classroom.generatedSessions.length
    ? classroom.generatedSessions
    : classroom.classDate
      ? [resolveScheduledSession(classroom)]
      : [];
  const sessions = role === "instructor"
    ? allSessions.filter((item: any) => coachCanAccessClassroomSession(classroom, userId, String(item?._id || "")))
    : allSessions;
  if (!sessions.length) notFound();

  const selectedSession =
    (searchParams.session
      ? sessions.find((item: any) => String(item?._id || "") === String(searchParams.session))
      : null) ||
    sessions
      .slice()
      .sort((a: any, b: any) => new Date(b.actualEndedAt || b.scheduledFor || 0).getTime() - new Date(a.actualEndedAt || a.scheduledFor || 0).getTime())[0];

  if (!selectedSession) notFound();
  if (!participantHasAccess(classroom, role, userId, selectedSession)) redirect("/dashboard");

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
  const summaryRows = Array.isArray(attendance?.metadata?.summary?.rows)
    ? attendance.metadata.summary.rows
    : Array.isArray(selectedSession?.summary?.rows)
      ? selectedSession.summary.rows
      : [];
  const responseByStudent = new Map<string, any[]>();
  responses.forEach((response: any) => {
    const key = objectId(response.student);
    responseByStudent.set(key, [...(responseByStudent.get(key) || []), response]);
  });

  const assignedStudents = studentsForSession(classroom, selectedSession);
  const studentRows = assignedStudents.map((student: any) => {
    const studentId = objectId(student);
    const attendanceRecord = attendanceRecords.find((record: any) => objectId(record.student) === studentId);
    const studentResponses = responseByStudent.get(studentId) || [];
    const responseSummary = aggregateStudentResponses(studentResponses);
    const summaryRow = summaryRows.find((row: any) => objectId(row.student?._id || row.student) === studentId);
    const liveParticipant = liveSession?.participants?.find((participant: any) => objectId(participant.user) === studentId);
    const liveTimePresentMinutes = liveParticipant
      ? minutesBetween(liveParticipant.firstSeenAt, liveParticipant.lastSeenAt || liveSession?.endedAt)
      : 0;
    const timePresentMinutes = Math.max(Number(summaryRow?.timeMinutes || 0), liveTimePresentMinutes);
    const accuracy = responseSummary.totalItems > 0
      ? Math.round((responseSummary.completedItems / Math.max(1, responseSummary.totalItems)) * 100)
      : studentResponses.length
        ? Math.round((responseSummary.correctResponses / Math.max(1, studentResponses.length)) * 100)
        : 0;
    return {
      id: studentId,
      name: student.name,
      username: student.username || student.email || "",
      attendance: resolveAttendanceStatus(attendanceRecord?.status || "pending", timePresentMinutes, studentResponses.length),
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
  const presentCount = studentRows.filter((row: any) => row.attendance === "present").length;
  const absentCount = studentRows.filter((row: any) => row.attendance === "absent").length;
  const lateCount = studentRows.filter((row: any) => row.attendance === "late").length;

  const quizReview = buildQuizReview(questions as any[], responses as any[], studentRows);

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
            {["admin", "sub-admin", "instructor"].includes(role) ? (
              <Link
                href={`/attendance?date=${encodeURIComponent(dateParam(selectedSession.scheduledFor || classroom.classDate))}&session=${encodeURIComponent(`${params.id}:${scheduledSessionId}`)}`}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
              >
                Edit Attendance
              </Link>
            ) : null}
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
              <JoinScheduledSessionButton
                classroomId={params.id}
                sessionId={scheduledSessionId}
                meetingUrl={classroom.meetingUrl}
                className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-bold text-white"
                unavailableClassName="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
                label="Open Scheduled Classroom"
                scheduledFor={selectedSession.scheduledFor || classroom.classDate || classroom.startDate}
                startTime={selectedSession.startTime || classroom.startTime}
                durationMinutes={selectedSession.durationMinutes || classroom.durationMinutes || 60}
              />
            ) : null}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Status" value={String(selectedSession.status || classroom.status || "scheduled")} />
          <StatCard label="Coach" value={classroom.coach?.name || classroom.instructor?.name || "Not assigned"} />
          <StatCard label="Students Assigned" value={String(assignedStudents.length)} />
          <StatCard label="Scheduled" value={formatDateTime(getSessionStart(selectedSession))} />
          <StatCard label="Actual Start" value={formatDateTime(selectedSession.actualStartedAt || liveSession?.startedAt)} />
          <StatCard label="End" value={formatDateTime(selectedSession.actualEndedAt || liveSession?.endedAt)} />
        </div>
      </section>

      <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
        <h2 className="text-lg font-black text-slate-950">PGNs and Boards Used</h2>
        <p className="mt-1 text-sm text-slate-500">Review the positions and material that were loaded during this class.</p>
        <div className="mt-4">
          <SessionResourceReview
            resources={buildSessionReviewResources(liveSession)}
          />
        </div>
      </section>

      {quizReview.length ? (
        <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <h2 className="text-lg font-black text-slate-950">Quiz Questions and Saved Answers</h2>
          <p className="mt-1 text-sm text-slate-500">Every question launched in this class, its solution, and the moves each student saved.</p>
          <div className="mt-4 space-y-4">
            {quizReview.map((question: any) => (
              <div key={question.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-950">{question.title}</div>
                    <div className="mt-1 text-xs capitalize text-slate-500">
                      {question.type}
                      {question.itemCount ? ` · ${question.itemCount} positions` : ""}
                      {` · ${question.answeredCount} answered · ${question.correctCount} correct`}
                    </div>
                  </div>
                  {question.solution ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Solution: {question.solution}</span>
                  ) : null}
                </div>
                {question.startFen ? (
                  <div className="mt-2 truncate font-mono text-[11px] text-slate-400">{question.startFen}</div>
                ) : null}
                {question.answers.length ? (
                  <div className="mt-3 space-y-2">
                    {question.answers.map((answer: any, answerIndex: number) => (
                      <div key={`${question.id}-${answerIndex}`} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-black text-slate-900">{answer.student}</div>
                          {answer.answered ? (
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${answer.correct ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                              {answer.correct ? "Correct" : "Attempted"}
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">No answer saved</span>
                          )}
                        </div>
                        {answer.items.length ? (
                          <div className="mt-2 space-y-1.5">
                            {answer.items.map((item: any, itemIndex: number) => (
                              <div key={`${question.id}-${answerIndex}-${item.id || itemIndex}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-slate-600">
                                <span className="font-bold text-slate-800">{item.title}</span>
                                <span className={item.solved ? "text-emerald-700" : item.skipped ? "text-slate-400" : "text-amber-700"}>
                                  {item.answer || (item.skipped ? "Skipped" : "Nothing saved")}
                                </span>
                                {item.solution ? <span className="text-slate-400">· expected {item.solution}</span> : null}
                              </div>
                            ))}
                          </div>
                        ) : answer.answer ? (
                          <div className="mt-2 font-mono text-[11px] text-slate-700">{answer.answer}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white p-3 text-xs text-slate-500">No student answers were saved for this question.</div>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <h2 className="text-lg font-black text-slate-950">Session Details</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoTile label="Course" value={classroom.courseName || "General"} />
            <InfoTile label="Level" value={classroom.levelName || "Not set"} />
            <InfoTile label="Topic" value={selectedSession.topicName || classroom.topicName || "Not set"} />
            <InfoTile label="Scheduled Duration" value={formatDuration(selectedSession.durationMinutes || classroom.durationMinutes)} />
            <InfoTile label="Paid Teaching Hours" value={formatDuration(selectedSession.teachingMinutes || attendance?.teachingMinutes || selectedSession.durationMinutes || classroom.durationMinutes)} />
            <InfoTile label="Actual Class Time" value={formatDuration(selectedSession.actualTeachingMinutes || attendance?.actualTeachingMinutes || summary?.actualTeachingMinutes || 0)} />
            <InfoTile label="Coach Punctuality" value={selectedSession.punctualityScore || attendance?.punctualityScore || summary?.punctualityScore ? `${selectedSession.punctualityScore || attendance?.punctualityScore || summary?.punctualityScore}%` : "Pending"} />
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
