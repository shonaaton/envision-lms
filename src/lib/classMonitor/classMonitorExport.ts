import "server-only";

import { academyDateKey } from "@/lib/academyTime";
import type { Sheet } from "@/lib/spreadsheet";
import {
  REPORT_STATUS_LABELS,
  classEndLabel,
  classFormatLabel,
  correctLessonLabel,
  lateLabel,
  minutesAfterStart,
  reportConcerns,
  studentVideoLabel,
  teacherVideoLabel,
  timeLabel,
  weekdayName,
} from "./classMonitorRules";
import { loadReportsInRange } from "./classMonitorService";

/**
 * The Class Monitor download. Times are written as IST text ("5:02 pm"):
 * a spreadsheet date has no timezone, and the server's own clock is UTC.
 * Kept out of the service so the sweep never pulls in the workbook writer.
 */
export async function classMonitorSheets(from: string, to: string): Promise<Sheet[]> {
  const reports: any[] = await loadReportsInRange(from, to);

  const classes: Sheet = {
    name: "Class Monitor",
    columns: [
      { label: "Date", type: "text" },
      { label: "Day", type: "text" },
      { label: "Class timing (IST)", type: "text" },
      { label: "Class name", type: "text" },
      { label: "Class type", type: "text" },
      { label: "Course", type: "text" },
      { label: "Lesson planned", type: "text" },
      { label: "Coach", type: "text" },
      { label: "Group / Individual", type: "text" },
      { label: "Students on roster", type: "number" },
      { label: "Student video", type: "text" },
      { label: "Teacher video", type: "text" },
      { label: "Correct lesson taught", type: "text" },
      { label: "Class ends", type: "text" },
      { label: "Teacher joined (IST)", type: "text" },
      { label: "Teacher join vs start", type: "text" },
      { label: "Teacher time changed by hand", type: "text" },
      { label: "Students joined", type: "text" },
      { label: "Needs attention", type: "text" },
      { label: "Remarks", type: "text" },
      { label: "Form status", type: "text" },
      { label: "Filled by", type: "text" },
      { label: "Filled at (IST)", type: "text" },
      { label: "Last changed by", type: "text" },
    ],
    rows: reports.map((report) => {
      const start = new Date(report.startAt);
      const filled = report.status === "submitted";
      const teacherAt = report.teacherJoin?.at;
      const students = (report.studentJoins || [])
        .map((join: any) => `${join.name || "Student"}: ${join.at ? timeLabel(join.at) : filled ? "did not join" : "not seen yet"}${join.edited ? " (changed)" : ""}`)
        .join("; ");
      return [
        report.dateKey,
        weekdayName(report.dateKey),
        `${timeLabel(report.startAt)} – ${timeLabel(report.endAt)}`,
        report.className,
        report.isDemo ? "Demo" : "Regular",
        report.courseName,
        report.lessonPlanned,
        report.coachName,
        filled ? classFormatLabel(report.classFormat) : "",
        (report.studentJoins || []).length,
        filled ? studentVideoLabel(report.studentVideo) : "",
        filled ? teacherVideoLabel(report.teacherVideo) : "",
        filled ? correctLessonLabel(report.correctLesson) : "",
        filled ? classEndLabel(report.classEnd) : "",
        teacherAt ? timeLabel(teacherAt) : filled ? "Did not join" : report.status === "cancelled" ? "" : "Not seen yet",
        lateLabel(minutesAfterStart(teacherAt, start)),
        report.teacherJoin?.edited ? "Yes" : "",
        students,
        filled ? reportConcerns(report).join(", ") : "",
        report.remarks || (report.status === "cancelled" ? report.cancelReason : ""),
        REPORT_STATUS_LABELS[report.status] || report.status,
        report.submittedByName || "",
        report.submittedAt ? `${academyDateKey(report.submittedAt)} ${timeLabel(report.submittedAt)}` : "",
        report.lastEditedByName || "",
      ];
    }),
  };

  const joins: Sheet = {
    name: "Student joins",
    columns: [
      { label: "Date", type: "text" },
      { label: "Class timing (IST)", type: "text" },
      { label: "Class name", type: "text" },
      { label: "Class type", type: "text" },
      { label: "Coach", type: "text" },
      { label: "Student", type: "text" },
      { label: "Joined at (IST)", type: "text" },
      { label: "Join vs start", type: "text" },
      { label: "Recorded by live room (IST)", type: "text" },
      { label: "Changed by hand", type: "text" },
      { label: "Form status", type: "text" },
    ],
    rows: reports
      .filter((report) => report.status !== "cancelled")
      .flatMap((report) => (report.studentJoins || []).map((join: any) => [
        report.dateKey,
        `${timeLabel(report.startAt)} – ${timeLabel(report.endAt)}`,
        report.className,
        report.isDemo ? "Demo" : "Regular",
        report.coachName,
        join.name || "Student",
        join.at ? timeLabel(join.at) : report.status === "submitted" ? "Did not join" : "Not seen yet",
        lateLabel(minutesAfterStart(join.at, report.startAt)),
        join.autoAt ? timeLabel(join.autoAt) : "Not seen",
        join.edited ? "Yes" : "",
        REPORT_STATUS_LABELS[report.status] || report.status,
      ])),
  };

  return [classes, joins];
}
