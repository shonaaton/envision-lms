/**
 * Fees billed in the portal and not yet paid, per student. Pure.
 *
 * Students who stopped coming are often still active in the portal (the user,
 * 2026-10-07), so their bills keep piling up as "due". They are split out: a
 * deactivated student is "left"; an active one with nothing paid for 60 days
 * and a bill more than 30 days overdue is "probably left". Neither group is
 * counted as money the academy can expect.
 */

export type OpenInvoice = { id: string; invoiceNumber: string; title: string; dueDate: Date | null; total: number; status: string };

export type ReceivableStudent = {
  studentId: string;
  name: string;
  username: string;
  group: "active" | "paused" | "probably_left" | "left";
  invoices: OpenInvoice[];
  total: number;
  oldestDue: Date | null;
  lastPaidAt: Date | null;
  buckets: { notDue: number; upTo30: number; upTo60: number; over60: number };
};

const DAY = 86_400_000;

export function bucketFor(due: Date | null, now: Date): keyof ReceivableStudent["buckets"] {
  if (!due || due.getTime() >= now.getTime()) return "notDue";
  const days = (now.getTime() - due.getTime()) / DAY;
  if (days <= 30) return "upTo30";
  if (days <= 60) return "upTo60";
  return "over60";
}

export function classifyStudent(
  student: { isActive?: boolean; isPaused?: boolean },
  oldestDue: Date | null,
  lastPaidAt: Date | null,
  now: Date
): ReceivableStudent["group"] {
  if (student.isActive === false) return "left";
  if (student.isPaused) return "paused";
  const longOverdue = oldestDue !== null && now.getTime() - oldestDue.getTime() > 30 * DAY;
  const quiet = !lastPaidAt || now.getTime() - lastPaidAt.getTime() > 60 * DAY;
  return longOverdue && quiet ? "probably_left" : "active";
}

export function summarizeReceivables(students: ReceivableStudent[]) {
  const sum = (group: ReceivableStudent["group"][]) => students.filter((row) => group.includes(row.group)).reduce((total, row) => total + row.total, 0);
  return {
    collectable: sum(["active", "paused"]),
    doubtful: sum(["probably_left"]),
    left: sum(["left"]),
    total: sum(["active", "paused", "probably_left", "left"]),
  };
}
