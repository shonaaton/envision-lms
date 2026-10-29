import { dbConnect } from "@/lib/db";
import { academyDateKey, academyDateTime } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { Notification } from "@/models/Fee";
import { Homework, Submission } from "@/models/Homework";
import { User } from "@/models/User";
import { BranchAttendance, BranchMonthlyReport, BranchStudent } from "@/models/Branch";
import { BRANCHES, BRANCH_LABELS, type BranchKey } from "./scope";
import { getBranchSettings } from "./settings";
import { monthKey, monthLabel, shiftMonth } from "./rules";

/**
 * The monthly report each branch family gets on the 1st: classes attended,
 * topics covered, homework done. Reached from instrumentation.ts, so no Node
 * built-ins here and nothing from lib/branch/service.ts.
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");

export type MonthlyReportData = {
  month: string;
  monthLabel: string;
  attended: number;
  marked: number;
  topics: string[];
  homeworkAssigned: number;
  homeworkDone: number;
};

/** What one student did in a month, from the registers and the homework. */
export async function monthlyReportData(branch: BranchKey, student: any, month: string): Promise<MonthlyReportData> {
  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;
  const registers: any[] = await BranchAttendance.find({ branch, "records.student": student._id, date: { $gte: from, $lt: to } })
    .select("date records")
    .sort({ date: 1 })
    .lean();
  let attended = 0;
  const topics: string[] = [];
  for (const register of registers) {
    const record = (register.records || []).find((entry: any) => id(entry.student) === id(student));
    if (!record) continue;
    if (record.status === "present" || record.status === "late") {
      attended += 1;
      const topic = String(record.topic || "").trim();
      if (topic && !topics.some((seen) => seen.toLowerCase() === topic.toLowerCase())) topics.push(topic);
    }
  }
  const homework: any[] = student.user
    ? await Homework.find({ branch, assignedStudents: student.user, createdAt: { $gte: academyDateTime(from), $lt: academyDateTime(to) } }).select("_id").lean()
    : [];
  const homeworkDone = homework.length
    ? await Submission.countDocuments({ student: student.user, homework: { $in: homework.map((item) => item._id) } })
    : 0;
  return { month, monthLabel: monthLabel(month), attended, marked: registers.length, topics, homeworkAssigned: homework.length, homeworkDone };
}

export function reportText(name: string, data: MonthlyReportData) {
  return [
    `Classes attended: ${data.attended} of ${data.marked}`,
    `Topics covered: ${data.topics.length ? data.topics.join(", ") : "none written down this month"}`,
    `Homework done: ${data.homeworkAssigned ? `${data.homeworkDone} of ${data.homeworkAssigned}` : "none set on the portal"}`,
  ].join("\n");
}

/**
 * Sends `month`'s report to every active student who had a class or homework
 * in it. Each report is claimed before it goes, so a re-run skips it.
 */
export async function sendMonthlyReports(branch: BranchKey, month = shiftMonth(monthKey(), -1), request?: Request) {
  await dbConnect();
  const students: any[] = await BranchStudent.find({ branch, status: "active" }).select("name parentName user").lean();
  const base = resolvePublicAppUrl(request);
  const link = base ? `${base}/bowbazar/me` : "";
  let sent = 0;
  let skipped = 0;
  for (const student of students) {
    if (await BranchMonthlyReport.exists({ student: student._id, month })) {
      skipped += 1;
      continue;
    }
    const data = await monthlyReportData(branch, student, month);
    if (!data.marked && !data.homeworkAssigned) continue;
    try {
      await BranchMonthlyReport.create({ branch, student: student._id, month, data });
    } catch (error: any) {
      if (error?.code === 11000) {
        skipped += 1;
        continue;
      }
      throw error;
    }
    const user: any = await User.findById(student.user).select("name email phone countryCode").lean();
    const channels: string[] = [];
    const body = reportText(student.name, data);
    if (user) {
      await Notification.create({
        user: user._id,
        type: "branch_monthly_report",
        title: `${data.monthLabel} at the ${BRANCH_LABELS[branch]} centre`,
        message: body.replace(/\n/g, " · "),
        metadata: { href: "/bowbazar/me", month },
      });
      channels.push("portal");
      if (user.email && !/\.invalid$/i.test(user.email)) {
        const email = await sendAutomationEmail({
          to: user.email,
          subject: `${student.name}'s ${data.monthLabel} at Envision Chess Academy ${BRANCH_LABELS[branch]}`,
          message: [`Hello${student.parentName ? ` ${student.parentName}` : ""},`, "", `Here is how ${student.name} did in ${data.monthLabel}:`, "", body, "", link ? `Every class and homework is on the portal: ${link}` : ""].join("\n"),
          actionUrl: link || undefined,
          actionLabel: link ? "Open the portal" : undefined,
          metadata: { kind: "branch_monthly_report", studentId: id(student), month },
        }).catch(() => null);
        if (email?.delivered) channels.push("email");
      }
      const whatsapp = await sendWhatsAppAutomationTemplate({
        user,
        templateName: "bowbazar_monthly_report",
        bodyParameters: [
          student.parentName || "Parent",
          student.name,
          data.monthLabel,
          `${data.attended} of ${data.marked}`,
          data.topics.length ? data.topics.slice(0, 6).join(", ") : "none written down",
          data.homeworkAssigned ? `${data.homeworkDone} of ${data.homeworkAssigned}` : "none set",
          link || "the academy portal",
        ],
        metadata: { kind: "branch_monthly_report", studentId: id(student), dedupKey: `branch-monthly-report:${id(student)}:${month}` },
      }).catch(() => null);
      if (whatsapp?.delivered) channels.push("whatsapp");
    }
    await BranchMonthlyReport.updateOne({ student: student._id, month }, { $set: { sentAt: new Date(), channels } });
    sent += 1;
  }
  return { sent, skipped, month };
}

/** Hourly: from 10am on the 1st (to the 3rd, in case the server was down), last month's reports. */
export async function processBranchMonthlyReports(now = new Date()) {
  const today = academyDateKey(now);
  const day = Number(today.slice(8, 10));
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(now)) % 24;
  if (day > 3 || (day === 1 && hour < 10)) return;
  await dbConnect();
  for (const branch of BRANCHES) {
    const settings = await getBranchSettings(branch);
    if (settings.parentReportEnabled) await sendMonthlyReports(branch, shiftMonth(today.slice(0, 7), -1));
  }
}

/** A student's past reports, newest first, for their page. */
export async function myMonthlyReports(studentId: unknown) {
  await dbConnect();
  const reports: any[] = await BranchMonthlyReport.find({ student: studentId }).sort({ month: -1 }).limit(6).lean();
  return reports.map((report) => report.data as MonthlyReportData).filter(Boolean);
}
