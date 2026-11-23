import "server-only";

import { rosterForSession } from "@/lib/classroomStudentExits";
import { loadCoachPay } from "@/lib/coachPayData";
import { summarizePayEvents, type PayEvent } from "@/lib/coachPay";
import type { PayPeriod } from "@/lib/payPeriods";
import { Invoice } from "@/models/Fee";
import { User } from "@/models/User";
import { Classroom } from "@/models/Classroom";
import { scheduledStartDate } from "@/lib/teachingStats";

type StudentInvoice = {
  student: unknown;
  type: string;
  totalAmount: number;
  gstAmount?: number;
  lateFee?: number;
  credits?: number;
  dueDate: Date;
  issueDate?: Date;
  coverageMonths?: number;
  coverageSessions?: number;
};

function purchasedSessions(bill: StudentInvoice) {
  const count = Number(bill.coverageSessions || bill.credits || 0);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The longest a single invoice can cover (Invoice.coverageMonths max). */
const MAX_COVERAGE_MONTHS = 36;

function istMonth(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return shifted.getUTCFullYear() * 12 + shifted.getUTCMonth();
}

function istDay(date: Date) {
  return Math.floor((date.getTime() + IST_OFFSET_MS) / DAY_MS);
}

/**
 * The part of a fee invoice that belongs to the months `fromMonth`-`toMonth`,
 * or null when it covers none of them.
 *
 * A monthly invoice belongs to the month it falls due. A custom invoice starts
 * in its invoice month and is spread evenly over `coverageMonths` (one when
 * unset), so a 12-month package counts a twelfth in each month it pays for.
 */
function feeShareInMonths(bill: StudentInvoice, fromMonth: number, toMonth: number): number | null {
  const anchor = bill.type === "manual" ? bill.issueDate || bill.dueDate : bill.dueDate;
  if (!anchor) return null;
  const start = istMonth(new Date(anchor));
  const months = Math.min(MAX_COVERAGE_MONTHS, Math.max(1, Math.floor(Number(bill.coverageMonths) || 1)));
  const first = Math.max(start, fromMonth) - start;
  const last = Math.min(start + months - 1, toMonth) - start;
  if (last < first) return null;
  const net = netTuition(bill);
  return Math.round(net * (last + 1) / months) - Math.round(net * first / months);
}

/** When a credit purchase took effect: its invoice day, or its due day if that is earlier. */
function creditStartDay(bill: StudentInvoice) {
  const dates = [bill.issueDate, bill.dueDate].filter(Boolean).map((value) => new Date(value as Date).getTime());
  return istDay(new Date(Math.min(...dates)));
}

export type ProfitabilityClass = {
  id: string;
  sessionKey: string;
  coachId: string;
  title: string;
  date: Date;
  substitute: boolean;
  fixedSalary: boolean;
  unpriced: boolean;
  revenue: number;
  cost: number;
  students: { id: string; name: string; revenue: number; missingFee: boolean }[];
};

function idOf(value: any): string {
  return String(value?._id || value || "");
}

function netTuition(invoice: StudentInvoice) {
  return Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.gstAmount || 0) - Number(invoice.lateFee || 0));
}

export function buildCoachProfitability(
  period: PayPeriod,
  events: PayEvent[],
  classrooms: any[],
  invoices: StudentInvoice[],
  people: { _id: unknown; name?: string; role?: string }[],
  historyClassrooms: any[] = classrooms,
) {
  // Staff salary plans alone do not establish that someone teaches.
  const teachingIds = new Set(people.filter((person) => person.role === "instructor").map(idOf));
  for (const classroom of classrooms) {
    [classroom.coach, classroom.instructor, ...(classroom.generatedSessions || []).flatMap((session: any) =>
      [session.assignedCoach, session.substituteCoach])].filter(Boolean).forEach((coach) => teachingIds.add(idOf(coach)));
  }
  const teachingEvents = events.filter((event) => teachingIds.has(event.coachId));
  const summary = summarizePayEvents(teachingEvents);
  const names = new Map(people.map((person) => [idOf(person), person.name || "Student"]));
  const classroomsById = new Map(classrooms.map((classroom) => [idOf(classroom), classroom]));
  const classes: ProfitabilityClass[] = [];

  for (const event of teachingEvents) {
    if (event.isDemoClass || event.sessionStatus !== "completed" || !event.sessionId ||
      !["regular", "substitute"].includes(event.kind)) continue;
    const classroom = classroomsById.get(event.classroomId);
    const session = classroom?.generatedSessions?.find((item: any) => idOf(item) === event.sessionId);
    if (!session) continue;
    classes.push({
      id: event.id,
      sessionKey: `${event.classroomId}:${event.sessionId}`,
      coachId: event.coachId,
      title: event.classroomTitle,
      date: event.date,
      substitute: event.isSubstitution,
      fixedSalary: event.coveredByMonthly,
      unpriced: event.status === "unpriced",
      revenue: 0,
      cost: event.amount,
      students: [...new Set(rosterForSession(classroom, session).map(idOf))].map((id) => ({
        id, name: names.get(id) || "Student", revenue: 0, missingFee: false,
      })),
    });
  }
  classes.sort((left, right) => left.date.getTime() - right.date.getTime() || left.id.localeCompare(right.id));

  const classesByStudent = new Map<string, ProfitabilityClass[]>();
  for (const item of classes) {
    for (const student of item.students) {
      const enrolled = classesByStudent.get(student.id) || [];
      enrolled.push(item);
      classesByStudent.set(student.id, enrolled);
    }
  }
  const invoicesByStudent = new Map<string, StudentInvoice[]>();
  for (const invoice of invoices) {
    const id = idOf(invoice.student);
    const bills = invoicesByStudent.get(id) || [];
    bills.push(invoice);
    invoicesByStudent.set(id, bills);
  }

  // Include earlier months and previous classrooms so a package cannot restart
  // at every report boundary or after a student changes batch.
  const historyByStudent = new Map<string, { key: string; date: Date }[]>();
  for (const room of historyClassrooms) {
    if (room.classroomType === "demo") continue;
    for (const session of room.generatedSessions || []) {
      if (session.status !== "completed") continue;
      const date = scheduledStartDate(session, room);
      if (date > period.to) continue;
      const key = `${idOf(room)}:${idOf(session)}`;
      for (const studentId of new Set(rosterForSession(room, session).map(idOf))) {
        const history = historyByStudent.get(studentId) || [];
        history.push({ key, date });
        historyByStudent.set(studentId, history);
      }
    }
  }

  let unallocatedRevenue = 0;
  const missingStudents = new Set<string>();
  const fromMonth = istMonth(period.from);
  const toMonth = istMonth(period.to);
  for (const [studentId, bills] of invoicesByStudent) {
    const shares = bills.filter((bill) => (bill.type === "monthly" || bill.type === "manual") && !purchasedSessions(bill))
      .map((bill) => feeShareInMonths(bill, fromMonth, toMonth))
      .filter((share): share is number => share !== null);
    const enrolled = classesByStudent.get(studentId) || [];
    const monthlyFee = shares.reduce((sum, share) => sum + share, 0);
    if (!enrolled.length) {
      unallocatedRevenue += monthlyFee;
      continue;
    }
    const packages = bills.filter((bill) => purchasedSessions(bill) > 0)
      .sort((a, b) => creditStartDay(a) - creditStartDay(b) || new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .map((bill) => ({ bill, used: 0 }));
    const sessionRevenue = new Map<string, number>();
    const history = [...(historyByStudent.get(studentId) || [])]
      .sort((a, b) => a.date.getTime() - b.date.getTime() || a.key.localeCompare(b.key));
    for (const session of history) {
      if (sessionRevenue.has(session.key)) continue;
      const month = istMonth(session.date);
      if (bills.some((bill) => !purchasedSessions(bill) && ["monthly", "manual"].includes(bill.type) &&
        feeShareInMonths(bill, month, month) !== null)) continue;
      const pack = packages.find(({ bill, used }) => used < purchasedSessions(bill) && creditStartDay(bill) <= istDay(session.date));
      if (!pack) continue;
      const count = purchasedSessions(pack.bill);
      const net = netTuition(pack.bill);
      // Cumulative rounding keeps the recognised package total exact to a paise.
      sessionRevenue.set(session.key, Math.round(net * (pack.used + 1) / count) - Math.round(net * pack.used / count));
      pack.used += 1;
    }
    enrolled.forEach((item, index) => {
      const student = item.students.find((entry) => entry.id === studentId)!;
      if (shares.length) {
        student.revenue = Math.round(monthlyFee * (index + 1) / enrolled.length) -
          Math.round(monthlyFee * index / enrolled.length);
      } else {
        const revenue = sessionRevenue.get(item.sessionKey);
        if (revenue !== undefined) student.revenue = revenue;
        else student.missingFee = true;
      }
    });
  }
  for (const item of classes) {
    for (const student of item.students) {
      if (!invoicesByStudent.has(student.id)) student.missingFee = true;
      if (student.missingFee) missingStudents.add(student.id);
      item.revenue += student.revenue;
    }
  }

  const rows = summary.rows.map((row) => {
    const taught = classes.filter((item) => item.coachId === row.coachId);
    return {
      coachId: row.coachId,
      name: row.coachName,
      revenue: taught.reduce((sum, item) => sum + item.revenue, 0),
      cost: row.totalAmount,
      monthlyCost: row.monthlyAmount,
      pendingReview: row.pendingReview,
      unpriced: row.unpriced,
      classes: taught,
      substitutions: taught.filter((item) => item.substitute).length,
    };
  }).sort((left, right) => right.revenue - left.revenue || left.name.localeCompare(right.name));
  return {
    rows,
    revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
    cost: summary.totalAmount,
    unallocatedRevenue,
    missingFees: missingStudents.size,
    missingFeeStudents: [...missingStudents].map((id) => ({ id, name: names.get(id) || "Student" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    pendingReview: summary.pendingReview,
    unpriced: summary.unpriced,
  };
}

export async function loadCoachProfitability(period: PayPeriod) {
  const { events, classrooms } = await loadCoachPay(period);
  // A multi-month invoice raised up to MAX_COVERAGE_MONTHS earlier can still cover this period.
  const lookback = new Date(Math.max(period.from.getTime() - (MAX_COVERAGE_MONTHS + 1) * 31 * DAY_MS, -8.64e15));
  const [invoices, people] = await Promise.all([
    Invoice.find({
      status: { $in: ["paid", "unpaid", "overdue"] },
      $or: [
        { type: "monthly", dueDate: { $gte: lookback, $lte: period.to } },
        { type: "manual", issueDate: { $gte: lookback, $lte: period.to } },
        { type: "credits", $or: [{ dueDate: { $lte: period.to } }, { issueDate: { $lte: period.to } }] },
        { coverageSessions: { $gt: 0 }, issueDate: { $lte: period.to } },
        { type: "manual", credits: { $gt: 0 }, issueDate: { $lte: period.to } },
      ],
    }).select("student type totalAmount gstAmount lateFee credits dueDate issueDate coverageMonths coverageSessions").lean<StudentInvoice[]>(),
    User.find({ $or: [{ role: "instructor" }, { _id: { $in: classrooms.flatMap((classroom) =>
      [...(classroom.students || []), ...(classroom.generatedSessions || []).flatMap((session: any) => session.students || [])]) } }] })
      .select("name role").lean<{ _id: unknown; name?: string; role?: string }[]>(),
  ]);
  const packageStudentIds = [...new Set(invoices.filter((bill) => purchasedSessions(bill) > 0).map((bill) => idOf(bill.student)))];
  const historyClassrooms = packageStudentIds.length ? await Classroom.find({
    isSessionInstance: { $ne: true }, isTestClassroom: { $ne: true }, classroomType: { $ne: "demo" },
    $or: [{ students: { $in: packageStudentIds } }, { "generatedSessions.students": { $in: packageStudentIds } }],
    "generatedSessions.status": "completed",
  }).select("students studentExits generatedSessions classroomType classDate startDate startTime").lean() : [];
  return buildCoachProfitability(period, events, classrooms, invoices, people, historyClassrooms);
}
