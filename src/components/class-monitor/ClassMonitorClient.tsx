"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ExternalLink, FileSpreadsheet, MonitorCheck, RefreshCw, RotateCcw, X } from "lucide-react";
import { academyDateKey, formatAcademyDateTime } from "@/lib/academyTime";
import type { ClassMonitorViewer } from "@/lib/classMonitor/classMonitorAccess";
import type { ClassMonitorReportView } from "@/lib/classMonitor/classMonitorService";
import {
  CLASS_END_OPTIONS,
  CLASS_FORMAT_OPTIONS,
  CORRECT_LESSON_OPTIONS,
  STUDENT_VIDEO_OPTIONS,
  TEACHER_VIDEO_OPTIONS,
  addDays,
  dayLabel,
  joinTimeInput,
  lateLabel,
  timeLabel,
  type ClassEnd,
  type ClassFormat,
  type CorrectLesson,
  type StudentVideo,
  type TeacherVideo,
} from "@/lib/classMonitor/classMonitorRules";
import { Choice, ConcernChips, DemoChip, Stat, StatusChip, button, field, secondary, sendJson } from "./classMonitorUi";

type Filter = "all" | "pending" | "submitted" | "cancelled";

const inputLook = "shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100";
const dateField = `w-40 ${inputLook}`;
const timeField = `w-32 ${inputLook}`;

export default function ClassMonitorClient({ viewer, initialDate, initialId }: { viewer: ClassMonitorViewer; initialDate: string; initialId: string }) {
  const [date, setDate] = useState(initialDate || academyDateKey(new Date()));
  const [today, setToday] = useState("");
  const [startKey, setStartKey] = useState("");
  const [reports, setReports] = useState<ClassMonitorReportView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState(initialId);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError("");
    try {
      const result = await sendJson(`/api/class-monitor${target ? `?date=${encodeURIComponent(target)}` : ""}`, "GET");
      setReports(result.reports || []);
      setToday(result.today);
      setStartKey(result.startKey);
      if (result.date !== target) setDate(result.date);
      setLoaded(true);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  // Keep the address shareable: the day, and the open form.
  useEffect(() => {
    if (!date) return;
    const params = new URLSearchParams();
    params.set("date", date);
    if (openId) params.set("id", openId);
    window.history.replaceState(null, "", `/class-monitor?${params.toString()}`);
  }, [date, openId]);

  const counts = useMemo(() => ({
    all: reports.length,
    pending: reports.filter((report) => report.status === "pending").length,
    submitted: reports.filter((report) => report.status === "submitted").length,
    cancelled: reports.filter((report) => report.status === "cancelled").length,
  }), [reports]);
  const visible = filter === "all" ? reports : reports.filter((report) => report.status === filter);
  const open = reports.find((report) => report._id === openId) || null;
  const canGoBack = Boolean(date && startKey && date > startKey);

  function replaceReport(next: ClassMonitorReportView) {
    setReports((current) => current.map((report) => (report._id === next._id ? next : report)));
  }

  return (
    <div className="space-y-5 text-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-brand"><MonitorCheck size={22} /><h1 className="text-2xl font-black">Class Monitor</h1></div>
          <p className="mt-1 text-sm text-slate-500">
            {viewer.canFill
              ? "Check each class and fill its form. The class's task closes itself when you submit, and the reviewers get it by email."
              : "Every class and its monitoring form. Forms are filled by the class monitor."}
          </p>
        </div>
        <Link href={`/class-monitor/reports${date ? `?date=${date}` : ""}`} className={secondary}><FileSpreadsheet size={16} />Reports</Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <button type="button" className={secondary} disabled={!canGoBack || loading} onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft size={16} /></button>
          <input type="date" className={dateField} value={date} min={startKey || undefined} onChange={(event) => event.target.value && setDate(event.target.value)} aria-label="Day" />
          <button type="button" className={secondary} disabled={!date || loading} onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight size={16} /></button>
        </div>
        {today && date !== today && <button type="button" className={secondary} onClick={() => setDate(today)}>Today</button>}
        <button type="button" className={secondary} disabled={loading} onClick={() => void load(date)}><RefreshCw size={15} className={loading ? "animate-spin" : ""} />Refresh</button>
        {date && <p className="text-sm font-semibold text-slate-700">{dayLabel(date)}</p>}
      </div>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error} <button onClick={() => void load(date)} className="underline">Retry</button></p>}

      {loaded && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Classes" value={counts.all - counts.cancelled} />
          <Stat label="Filled" value={counts.submitted} tone="good" />
          <Stat label="Not filled" value={counts.pending} tone={counts.pending ? "warn" : "default"} />
          <Stat label="Not held" value={counts.cancelled} />
        </div>
      )}

      {loaded && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter classes">
          {([["all", "All"], ["pending", "Not filled"], ["submitted", "Filled"], ["cancelled", "Not held"]] as [Filter, string][]).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? button : secondary} onClick={() => setFilter(id)}>
              {label}<span className="text-xs opacity-70">{counts[id]}</span>
            </button>
          ))}
        </div>
      )}

      {!loaded ? (
        <p className="p-8 text-center text-sm text-slate-500">Loading classes…</p>
      ) : startKey && date < startKey ? (
        <Empty title="Monitoring started later" text={`Class Monitor covers classes from ${dayLabel(startKey)}.`} />
      ) : !visible.length ? (
        <Empty title={reports.length ? "No classes in this view" : "No classes on this day"} text={reports.length ? "Choose another filter." : "Classes appear here as soon as they are on the schedule."} />
      ) : (
        <div className="space-y-2">
          {visible.map((report) => (
            <ClassRow key={report._id} report={report} canFill={viewer.canFill} onOpen={() => setOpenId(report._id)} />
          ))}
        </div>
      )}

      <FormDrawer
        key={open?._id || "none"}
        report={open}
        viewer={viewer}
        onClose={() => setOpenId("")}
        onSaved={(next) => replaceReport(next)}
        onRefreshed={(next) => replaceReport(next)}
      />
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-brand/20 bg-white p-10 text-center">
      <MonitorCheck className="mx-auto text-purple-300" size={30} />
      <p className="mt-3 font-bold">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}

function ClassRow({ report, canFill, onOpen }: { report: ClassMonitorReportView; canFill: boolean; onOpen: () => void }) {
  const action = report.status === "pending" ? (canFill ? "Fill form" : "View") : report.status === "submitted" ? (canFill ? "View / edit" : "View") : "Details";
  return (
    <article className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-nowrap">
      <div className="w-24 shrink-0 sm:w-28">
        <p className="text-sm font-black text-brand">{timeLabel(report.startAt)}</p>
        <p className="text-xs text-slate-500">to {timeLabel(report.endAt)}</p>
      </div>
      <div className="min-w-[11rem] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate font-bold">{report.className || "Class"}</h2>
          {report.isDemo && <DemoChip />}
          <StatusChip status={report.status} />
          <ConcernChips concerns={report.concerns} />
        </div>
        <p className="mt-0.5 text-sm text-slate-600">
          {report.coachName || "No coach"} · {report.studentJoins.length} student{report.studentJoins.length === 1 ? "" : "s"}
          {report.lessonPlanned ? ` · ${report.lessonPlanned}` : ""}
        </p>
        {report.status === "cancelled" && report.cancelReason && <p className="text-xs text-slate-500">{report.cancelReason}</p>}
        {report.status === "submitted" && report.submittedByName && <p className="text-xs text-slate-500">Filled by {report.submittedByName}</p>}
      </div>
      <div className="flex w-full shrink-0 justify-end gap-2 sm:w-auto">
        {report.meetingUrl && report.status !== "cancelled" && (
          <a href={report.meetingUrl} target="_blank" rel="noreferrer" className={secondary}><ExternalLink size={14} />Meet</a>
        )}
        <button type="button" className={report.status === "pending" && canFill ? button : secondary} onClick={onOpen}>{action}</button>
      </div>
    </article>
  );
}

type JoinDraft = { student: string; name: string; autoAt: string | null; value: string };

function FormDrawer({
  report,
  viewer,
  onClose,
  onSaved,
  onRefreshed,
}: {
  report: ClassMonitorReportView | null;
  viewer: ClassMonitorViewer;
  onClose: () => void;
  onSaved: (report: ClassMonitorReportView) => void;
  onRefreshed: (report: ClassMonitorReportView) => void;
}) {
  const pending = report?.status === "pending";
  const [classFormat, setClassFormat] = useState<ClassFormat | null>(report?.classFormat || (pending && report ? (report.studentJoins.length > 1 ? "group" : "individual") : null));
  const [studentVideo, setStudentVideo] = useState<StudentVideo | null>(report?.studentVideo || null);
  const [teacherVideo, setTeacherVideo] = useState<TeacherVideo | null>(report?.teacherVideo || null);
  const [correctLesson, setCorrectLesson] = useState<CorrectLesson | null>(report?.correctLesson || null);
  const [classEnd, setClassEnd] = useState<ClassEnd | null>(report?.classEnd || null);
  const [teacherJoin, setTeacherJoin] = useState(joinTimeInput(report?.teacherJoin.at));
  const [joins, setJoins] = useState<JoinDraft[]>(() => (report?.studentJoins || []).map((join) => ({ student: join.student, name: join.name, autoAt: join.autoAt, value: joinTimeInput(join.at) })));
  const [remarks, setRemarks] = useState(report?.remarks || "");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(pending);

  // An unfilled form picks up the live room's latest join times when opened.
  useEffect(() => {
    if (!report || report.status !== "pending") return;
    let cancelled = false;
    sendJson(`/api/class-monitor/${report._id}`, "GET")
      .then((result) => {
        if (cancelled || !result.report) return;
        const fresh: ClassMonitorReportView = result.report;
        onRefreshed(fresh);
        setTeacherJoin((current) => (current === joinTimeInput(report.teacherJoin.at) ? joinTimeInput(fresh.teacherJoin.at) : current));
        setJoins((current) => fresh.studentJoins.map((join) => {
          const draft = current.find((item) => item.student === join.student);
          const untouched = !draft || draft.value === joinTimeInput(draft.autoAt);
          return { student: join.student, name: join.name, autoAt: join.autoAt, value: untouched ? joinTimeInput(join.at) : draft!.value };
        }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Only when a different form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?._id]);

  if (!report) return null;
  const readOnly = !viewer.canFill || report.status === "cancelled" || !editing;
  const start = new Date(report.startAt);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!report) return;
    setFormError("");
    if (!classFormat || !studentVideo || !teacherVideo || !correctLesson || !classEnd) {
      setFormError("Answer every question before submitting.");
      return;
    }
    setBusy(true);
    try {
      const result = await sendJson(`/api/class-monitor/${report._id}`, "PUT", {
        classFormat,
        studentVideo,
        teacherVideo,
        correctLesson,
        classEnd,
        teacherJoinedAt: teacherJoin,
        studentJoins: joins.map((join) => ({ student: join.student, joinedAt: join.value })),
        remarks,
      });
      onSaved(result.report);
      setSaved(true);
      setEditing(false);
    } catch (submitError) {
      setFormError((submitError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function minutesHint(value: string) {
    if (!value) return "Did not join";
    const [hours, minutes] = value.split(":").map(Number);
    const startText = joinTimeInput(start);
    const [startHours, startMinutes] = startText.split(":").map(Number);
    let diff = hours * 60 + minutes - (startHours * 60 + startMinutes);
    if (diff < -12 * 60) diff += 24 * 60;
    return lateLabel(diff);
  }

  return (
    <Dialog.Root open onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-xl font-black text-brand">{report.className || "Class"}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500">{dayLabel(report.dateKey)} · {report.timing} IST</Dialog.Description>
            </div>
            <Dialog.Close disabled={busy} aria-label="Close" className="rounded-lg p-1 hover:bg-slate-100"><X size={20} /></Dialog.Close>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-purple-50/60 p-4 text-sm">
            <Detail label="Class name" value={report.className} />
            <Detail label="Coach" value={report.coachName || "—"} />
            <Detail label="Class day" value={report.weekday} />
            <Detail label="Class timing" value={`${report.timing} IST`} />
            <Detail label="Course" value={report.courseName || "—"} />
            <Detail label="Lesson planned" value={report.lessonPlanned ? `${report.sessionNumber ? `#${report.sessionNumber} ` : ""}${report.lessonPlanned}` : "—"} />
          </dl>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {report.isDemo && <DemoChip />}
            <StatusChip status={report.status} />
            <ConcernChips concerns={report.concerns} />
            {report.meetingUrl && report.status !== "cancelled" && <a href={report.meetingUrl} target="_blank" rel="noreferrer" className={`${secondary} py-1 text-xs`}><ExternalLink size={13} />Open Meet</a>}
          </div>

          {report.status === "cancelled" ? (
            <p className="mt-5 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">{report.cancelReason || "This class was not held."} There is no form to fill.</p>
          ) : (
            <form className="mt-5 space-y-5" onSubmit={submit}>
              {saved && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Saved. The task is closed and the reviewers have been emailed.</p>}

              <Choice label="Group / Individual" name="classFormat" options={CLASS_FORMAT_OPTIONS} value={classFormat} onChange={setClassFormat} disabled={readOnly}
                hint={`${report.studentJoins.length} student${report.studentJoins.length === 1 ? "" : "s"} on this class's list.`} />
              <Choice label="Student video" name="studentVideo" options={STUDENT_VIDEO_OPTIONS} value={studentVideo} onChange={setStudentVideo} disabled={readOnly} />
              <Choice label="Teacher video" name="teacherVideo" options={TEACHER_VIDEO_OPTIONS} value={teacherVideo} onChange={setTeacherVideo} disabled={readOnly} />
              <Choice label="Correct lesson taught" name="correctLesson" options={CORRECT_LESSON_OPTIONS} value={correctLesson} onChange={setCorrectLesson} disabled={readOnly}
                hint={report.lessonPlanned ? `Planned: ${report.lessonPlanned}` : "No lesson is set on the schedule for this class."} />
              <Choice label="Class ends" name="classEnd" options={CLASS_END_OPTIONS} value={classEnd} onChange={setClassEnd} disabled={readOnly}
                hint={`Due to end at ${timeLabel(report.endAt)}.${report.actualEndedAt ? ` The live room was closed at ${timeLabel(report.actualEndedAt)}.` : ""}`} />

              <fieldset className="space-y-2" disabled={readOnly}>
                <legend className="text-sm font-semibold">Join times <span className="font-normal text-slate-500">(recorded automatically from the live room; change one if it is wrong, clear it if the person never joined)</span></legend>
                <JoinRow
                  label={`Teacher · ${report.coachName || "Coach"}`}
                  autoAt={report.teacherJoin.autoAt}
                  value={teacherJoin}
                  onChange={setTeacherJoin}
                  hint={minutesHint(teacherJoin)}
                  readOnly={readOnly}
                  edited={!editing && report.teacherJoin.edited}
                />
                {joins.length ? joins.map((join) => (
                  <JoinRow
                    key={join.student}
                    label={join.name}
                    autoAt={join.autoAt}
                    value={join.value}
                    onChange={(value) => setJoins((current) => current.map((item) => (item.student === join.student ? { ...item, value } : item)))}
                    hint={minutesHint(join.value)}
                    readOnly={readOnly}
                    edited={!editing && Boolean(report.studentJoins.find((item) => item.student === join.student)?.edited)}
                  />
                )) : <p className="text-sm text-slate-500">No students on this class&apos;s list.</p>}
              </fieldset>

              <label className="block text-sm font-semibold">Remarks <span className="font-normal text-slate-500">(optional)</span>
                <textarea className={field} rows={3} maxLength={1000} value={remarks} onChange={(event) => setRemarks(event.target.value)} disabled={readOnly} />
              </label>

              {report.submittedAt && (
                <p className="text-xs text-slate-500">
                  Filled by {report.submittedByName || "—"} on {formatAcademyDateTime(report.submittedAt)}
                  {report.lastEditedAt ? ` · last changed by ${report.lastEditedByName || "—"} at ${timeLabel(report.lastEditedAt)}` : ""}
                </p>
              )}

              {formError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{formError}</p>}

              {viewer.canFill && (
                <div className="flex flex-wrap gap-2">
                  {editing ? (
                    <>
                      <button type="submit" className={button} disabled={busy}>{busy ? "Saving…" : pending ? "Submit form" : "Save changes"}</button>
                      {!pending && <button type="button" className={secondary} disabled={busy} onClick={() => setEditing(false)}>Stop editing</button>}
                    </>
                  ) : (
                    <button type="button" className={secondary} onClick={() => { setSaved(false); setEditing(true); }}>Edit this form</button>
                  )}
                </div>
              )}
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-brand/70">{label}</dt>
      <dd className="truncate font-semibold text-slate-900" title={value}>{value}</dd>
    </div>
  );
}

function JoinRow({ label, autoAt, value, onChange, hint, readOnly, edited }: {
  label: string;
  autoAt: string | null;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  readOnly: boolean;
  edited: boolean;
}) {
  const recorded = joinTimeInput(autoAt);
  const changed = value !== recorded;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{label}</p>
        <p className="text-xs text-slate-500">
          {autoAt ? `Recorded ${timeLabel(autoAt)}` : "Not seen in the live room"}
          {edited ? " · changed by hand" : ""}
        </p>
      </div>
      <input type="time" className={timeField} value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} aria-label={`${label} joined at`} />
      <span className={`w-24 text-xs font-semibold ${!value ? "text-rose-700" : /late/.test(hint) ? "text-amber-700" : "text-emerald-700"}`}>{hint}</span>
      {!readOnly && (
        <span className="flex gap-1">
          {value && <button type="button" className="rounded p-1 text-xs text-slate-500 underline hover:text-rose-700" onClick={() => onChange("")}>Not joined</button>}
          {changed && <button type="button" className="rounded p-1 text-slate-500 hover:text-brand" title="Back to the recorded time" aria-label="Back to the recorded time" onClick={() => onChange(recorded)}><RotateCcw size={14} /></button>}
        </span>
      )}
    </div>
  );
}
