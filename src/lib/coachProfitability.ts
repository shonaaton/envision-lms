import "server-only";

import { rosterForSession } from "@/lib/classroomStudentExits";
import { loadCoachPay } from "@/lib/coachPayData";
import { summarizePayEvents, type PayEvent } from "@/lib/coachPay";
import type { PayPeriod } from "@/lib/payPeriods";
import { Invoice } from "@/models/Fee";
import { User } from "@/models/User";

type StudentInvoice = {
  student: unknown;
  type: string;
  totalAmount: number;
  gstAmount?: number;
  lateFee?: number;
  credits?: number;
  dueDate: Date;
};

export type ProfitabilityClass = {
  id: string;
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

  let unallocatedRevenue = 0;
  const missingStudents = new Set<string>();
  for (const [studentId, bills] of invoicesByStudent) {
    const monthBills = bills.filter((bill) => bill.type === "monthly" &&
      new Date(bill.dueDate) >= period.from && new Date(bill.dueDate) <= period.to);
    const enrolled = classesByStudent.get(studentId) || [];
    const monthlyFee = monthBills.reduce((sum, bill) => sum + netTuition(bill), 0);
    if (!enrolled.length) {
      unallocatedRevenue += monthlyFee;
      continue;
    }
    enrolled.forEach((item, index) => {
      const student = item.students.find((entry) => entry.id === studentId)!;
      if (monthBills.length) {
        student.revenue = Math.round(monthlyFee * (index + 1) / enrolled.length) -
          Math.round(monthlyFee * index / enrolled.length);
      } else {
        // Credit invoices retain the purchased package price across later plan changes.
        const creditBill = bills.filter((bill) => bill.type === "credits" && Number(bill.credits) > 0 &&
          new Date(bill.dueDate) <= item.date)
          .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())[0];
        if (creditBill) student.revenue = Math.round(netTuition(creditBill) / Number(creditBill.credits));
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
    pendingReview: summary.pendingReview,
    unpriced: summary.unpriced,
  };
}

export async function loadCoachProfitability(period: PayPeriod) {
  const { events, classrooms } = await loadCoachPay(period);
  const [invoices, people] = await Promise.all([
    Invoice.find({
      status: { $in: ["paid", "unpaid", "overdue"] },
      $or: [
        { type: "monthly", dueDate: { $gte: period.from, $lte: period.to } },
        { type: "credits", dueDate: { $lte: period.to } },
      ],
    }).select("student type totalAmount gstAmount lateFee credits dueDate").lean<StudentInvoice[]>(),
    User.find({ $or: [{ role: "instructor" }, { _id: { $in: classrooms.flatMap((classroom) =>
      [...(classroom.students || []), ...(classroom.generatedSessions || []).flatMap((session: any) => session.students || [])]) } }] })
      .select("name role").lean<{ _id: unknown; name?: string; role?: string }[]>(),
  ]);
  return buildCoachProfitability(period, events, classrooms, invoices, people);
}
