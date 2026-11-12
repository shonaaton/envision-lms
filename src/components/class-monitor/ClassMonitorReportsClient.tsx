"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, MonitorCheck, RefreshCw } from "lucide-react";
import { academyDateKey } from "@/lib/academyTime";
import type { ClassMonitorViewer } from "@/lib/classMonitor/classMonitorAccess";
import type { ClassMonitorReportView } from "@/lib/classMonitor/classMonitorService";
import {
  classEndLabel,
  classFormatLabel,
  correctLessonLabel,
  dayLabel,
  studentVideoLabel,
  teacherVideoLabel,
  timeLabel,
  lateLabel,
} from "@/lib/classMonitor/classMonitorRules";
import { ConcernChips, Stat, StatusChip, button, field, secondary, sendJson } from "./classMonitorUi";

type Mode = "day" | "month" | "range";

type Counts = {
  classes: number;
  demos: number;
  filled: number;
  notFilled: number;
  notHeld: number;
  group: number;
  individual: number;
  studentVideoOff: number;
  teacherVideo30Plus: number;
  teacherVideoUnder30: number;
  teacherVideoNever: number;
  wrongLesson: number;
  endedOnTime: number;
  endedEarly: number;
  endedLate: number;
  teacherLate: number;
};

type Summary = {
  from: string;
  to: string;
  totals: Counts;
  days: (Counts & { dateKey: string; weekday: string })[];
  coaches: (Counts & { coachName: string })[];
  reports: ClassMonitorReportView[];
};

export default function ClassMonitorReportsClient({ viewer, initialDate, initialMonth }: { viewer: ClassMonitorViewer; initialDate: string; initialMonth: string }) {
  const today = academyDateKey(new Date());
  const [mode, setMode] = useState<Mode>(initialMonth ? "month" : "day");
  const [day, setDay] = useState(initialDate || today);
  const [month, setMonth] = useState(initialMonth || today.slice(0, 7));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (mode === "day") params.set("date", day);
    else if (mode === "month") params.set("month", month);
    else {
      params.set("from", from);
      params.set("to", to);
    }
    return params.toString();
  }, [mode, day, month, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSummary(await sendJson(`/api/class-monitor/summary?${query}`, "GET"));
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = summary?.totals;
  const multiDay = Boolean(summary && summary.from !== summary.to);

  return (
    <div className="space-y-5 text-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-brand"><FileSpreadsheet size={22} /><h1 className="text-2xl font-black">Class Monitor Reports</h1></div>
          <p className="mt-1 text-sm text-slate-500">Day-by-day or monthly totals of every monitored class, with Excel and CSV downloads.</p>
        </div>
        <Link href={`/class-monitor${mode === "day" ? `?date=${day}` : ""}`} className={secondary}><MonitorCheck size={16} />Class Monitor</Link>
      </div>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Report period">
          {([["day", "Day"], ["month", "Month"], ["range", "Date range"]] as [Mode, string][]).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={mode === id} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${mode === id ? "bg-white text-brand shadow-sm" : "text-slate-600"}`} onClick={() => setMode(id)}>{label}</button>
          ))}
        </div>
        {mode === "day" && <label className="text-sm font-semibold">Day<input type="date" className={field} value={day} onChange={(event) => event.target.value && setDay(event.target.value)} /></label>}
        {mode === "month" && <label className="text-sm font-semibold">Month<input type="month" className={field} value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} /></label>}
        {mode === "range" && (
          <>
            <label className="text-sm font-semibold">From<input type="date" className={field} value={from} onChange={(event) => event.target.value && setFrom(event.target.value)} /></label>
            <label className="text-sm font-semibold">To<input type="date" className={field} value={to} onChange={(event) => event.target.value && setTo(event.target.value)} /></label>
          </>
        )}
        <button type="button" className={secondary} disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? "animate-spin" : ""} />Refresh</button>
        {viewer.canExport && (
          <div className="ml-auto flex flex-wrap gap-2">
            <a className={button} href={`/api/class-monitor/export?${query}&format=xlsx`}><Download size={15} />Download Excel</a>
            <a className={secondary} href={`/api/class-monitor/export?${query}&format=csv`}><Download size={15} />Download CSV</a>
          </div>
        )}
      </section>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}

      {summary && totals && (
        <>
          <p className="text-sm font-semibold text-slate-700">
            {summary.from === summary.to ? dayLabel(summary.from) : `${dayLabel(summary.from)} – ${dayLabel(summary.to)}`}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={totals.demos ? `Classes held (${totals.demos} demo)` : "Classes held"} value={totals.classes} />
            <Stat label="Forms filled" value={totals.filled} tone="good" />
            <Stat label="Not filled" value={totals.notFilled} tone={totals.notFilled ? "warn" : "default"} />
            <Stat label="Cancelled or moved" value={totals.notHeld} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Teacher video 30+ min" value={totals.teacherVideo30Plus} tone="good" />
            <Stat label="Teacher video < 30 min" value={totals.teacherVideoUnder30} tone={totals.teacherVideoUnder30 ? "warn" : "default"} />
            <Stat label="Teacher video never" value={totals.teacherVideoNever} tone={totals.teacherVideoNever ? "bad" : "default"} />
            <Stat label="Student video off" value={totals.studentVideoOff} tone={totals.studentVideoOff ? "warn" : "default"} />
            <Stat label="Wrong lesson" value={totals.wrongLesson} tone={totals.wrongLesson ? "bad" : "default"} />
            <Stat label="Ended early / late" value={`${totals.endedEarly} / ${totals.endedLate}`} tone={totals.endedEarly + totals.endedLate ? "warn" : "default"} />
          </div>

          {multiDay && summary.days.length > 0 && (
            <Table
              title="Day by day"
              head={["Day", "Classes", "Demos", "Filled", "Not filled", "Teacher video never", "Teacher video < 30", "Student video off", "Wrong lesson", "Ended early", "Ended late"]}
              rows={summary.days.map((row) => [dayLabel(row.dateKey), row.classes, row.demos, row.filled, row.notFilled, row.teacherVideoNever, row.teacherVideoUnder30, row.studentVideoOff, row.wrongLesson, row.endedEarly, row.endedLate])}
            />
          )}

          {summary.coaches.length > 0 && (
            <Table
              title="By coach"
              head={["Coach", "Classes", "Demos", "Filled", "Teacher joined 5+ min late", "Teacher video never", "Teacher video < 30", "Wrong lesson", "Ended early", "Ended late"]}
              rows={summary.coaches.map((row) => [row.coachName, row.classes, row.demos, row.filled, row.teacherLate, row.teacherVideoNever, row.teacherVideoUnder30, row.wrongLesson, row.endedEarly, row.endedLate])}
            />
          )}

          <section className="space-y-2">
            <h2 className="text-lg font-black text-brand">Every class</h2>
            {!summary.reports.length ? (
              <p className="rounded-xl border border-dashed border-brand/20 bg-white p-8 text-center text-sm text-slate-500">No classes in this period.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="min-w-[1100px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>{["Date", "Time", "Class", "Coach", "Type", "Student video", "Teacher video", "Correct lesson", "Class ends", "Teacher joined", "Students joined", "Status"].map((label) => <th key={label} className="px-3 py-2 font-bold">{label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.reports.map((report) => (
                      <tr key={report._id} className="align-top">
                        <td className="whitespace-nowrap px-3 py-2">{report.dateKey}<div className="text-xs text-slate-500">{report.weekday}</div></td>
                        <td className="whitespace-nowrap px-3 py-2">{report.timing}</td>
                        <td className="px-3 py-2"><Link className="font-semibold text-brand hover:underline" href={`/class-monitor?date=${report.dateKey}&id=${report._id}`}>{report.className}</Link>{report.isDemo && <span className="ml-1.5 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">Demo</span>}<div className="text-xs text-slate-500">{report.lessonPlanned}</div></td>
                        <td className="px-3 py-2">{report.coachName || "—"}</td>
                        <td className="px-3 py-2">{classFormatLabel(report.classFormat) || "—"}</td>
                        <td className="px-3 py-2">{studentVideoLabel(report.studentVideo) || "—"}</td>
                        <td className="px-3 py-2">{teacherVideoLabel(report.teacherVideo) || "—"}</td>
                        <td className="px-3 py-2">{correctLessonLabel(report.correctLesson) || "—"}</td>
                        <td className="px-3 py-2">{classEndLabel(report.classEnd) || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {report.status === "cancelled" ? "—" : report.teacherJoin.at ? timeLabel(report.teacherJoin.at) : report.status === "submitted" ? "Did not join" : "Not seen yet"}
                          {report.teacherJoin.at && <div className="text-xs text-slate-500">{lateLabel(report.teacherJoin.minutesLate)}{report.teacherJoin.edited ? " · changed" : ""}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {report.studentJoins.map((join) => <div key={join.student}>{join.name}: {join.at ? timeLabel(join.at) : report.status === "submitted" ? "did not join" : "not seen yet"}{join.edited ? " (changed)" : ""}</div>)}
                        </td>
                        <td className="px-3 py-2"><div className="flex flex-col items-start gap-1"><StatusChip status={report.status} /><ConcernChips concerns={report.concerns} /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {!summary && !error && <p className="p-8 text-center text-sm text-slate-500">Loading report…</p>}
    </div>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-black text-brand">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{head.map((label) => <th key={label} className="px-3 py-2 font-bold">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className={`px-3 py-2 ${cellIndex === 0 ? "font-semibold" : ""}`}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
