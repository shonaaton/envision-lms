/**
 * Pure rules for the offline branch portal: who may do what, month keys, the
 * money on a bill and the seats in a slot. No database here, so all of it is
 * unit tested in rules.test.ts.
 */
import { academyDateKey } from "@/lib/academyTime";
import { BRANCHES, type BranchKey } from "./scope";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Monday first: the centre's week starts on Monday, and Sunday classes close it. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * The Bowbazar timetable as the centre gave it (2026-10-28). Tuesday 5pm is the
 * one online class. Single-hour times were given as start times only and are
 * assumed to run an hour; the manager can change any of them.
 */
export const DEFAULT_SLOTS: { dayOfWeek: number; startTime: string; endTime: string; mode: "online" | "offline" }[] = [
  { dayOfWeek: 2, startTime: "17:00", endTime: "18:00", mode: "online" },
  { dayOfWeek: 2, startTime: "19:00", endTime: "20:30", mode: "offline" },
  { dayOfWeek: 3, startTime: "17:00", endTime: "18:00", mode: "offline" },
  { dayOfWeek: 3, startTime: "18:00", endTime: "19:00", mode: "offline" },
  { dayOfWeek: 4, startTime: "18:00", endTime: "19:00", mode: "offline" },
  { dayOfWeek: 4, startTime: "19:00", endTime: "20:30", mode: "offline" },
  { dayOfWeek: 6, startTime: "10:00", endTime: "11:00", mode: "offline" },
  { dayOfWeek: 6, startTime: "11:00", endTime: "12:00", mode: "offline" },
  { dayOfWeek: 6, startTime: "12:00", endTime: "13:00", mode: "offline" },
  { dayOfWeek: 6, startTime: "15:30", endTime: "17:00", mode: "offline" },
  { dayOfWeek: 0, startTime: "10:00", endTime: "11:00", mode: "offline" },
  { dayOfWeek: 0, startTime: "11:00", endTime: "12:00", mode: "offline" },
  { dayOfWeek: 0, startTime: "12:00", endTime: "13:00", mode: "offline" },
];

export type BranchCapability =
  | "view"
  | "attendance"
  | "students"
  | "slots"
  | "fees"
  | "staff"
  | "messages"
  | "exams"
  | "achievements"
  | "activity"
  | "whatsapp";

/** Every capability, for the admin and for the feature-access screen. */
export const BRANCH_CAPABILITIES: BranchCapability[] = ["view", "attendance", "students", "slots", "fees", "staff", "messages", "exams", "achievements", "activity", "whatsapp"];

/** What a manager and a coach can do until the branch admin changes it (Feature Access). */
export const DEFAULT_ROLE_ACCESS: Record<"manager" | "coach", BranchCapability[]> = {
  manager: ["view", "attendance", "students", "slots", "fees", "messages", "exams", "achievements", "whatsapp"],
  coach: ["view", "attendance", "achievements"],
};

type BranchUser = { role?: string; branch?: string; branchRole?: string; isSuperAdmin?: boolean };
export type RoleAccessOverrides = Partial<Record<"manager" | "coach", BranchCapability[]>> | null | undefined;

/**
 * A branch is run from inside it: its admin does everything, including adding
 * staff; a manager runs it but cannot add staff; a coach can look and take the
 * register. The online academy's admins, sub-admins and coaches get nothing
 * here (the centre asked for that, 2026-10-28), and neither does any student.
 */
export function branchAccess(user: BranchUser | null | undefined, overrides?: RoleAccessOverrides): { branch: BranchKey; can: Set<BranchCapability> } | null {
  if (!user) return null;
  if (!user.branch || user.role !== "instructor" || !(BRANCHES as readonly string[]).includes(user.branch)) return null;
  const branch = user.branch as BranchKey;
  if (user.branchRole === "admin") return { branch, can: new Set(BRANCH_CAPABILITIES) };
  if (user.branchRole === "manager" || user.branchRole === "coach") {
    // "staff" and "activity" stay with the admin whatever the overrides say; "view" is never taken away.
    const chosen = overrides?.[user.branchRole] ?? DEFAULT_ROLE_ACCESS[user.branchRole];
    const can = new Set<BranchCapability>(["view", ...chosen.filter((capability) => BRANCH_CAPABILITIES.includes(capability) && capability !== "staff" && capability !== "activity")]);
    return { branch, can };
  }
  return null;
}

export function monthKey(value: Date | string = new Date()) {
  return academyDateKey(value).slice(0, 7);
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, by: number) {
  const [year, mon] = month.split("-").map(Number);
  const index = year * 12 + (mon - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Whole months from `from` to `to`, both included; empty when `from` is later. */
export function monthsBetween(from: string, to: string) {
  const months: string[] = [];
  for (let month = from; month <= to && months.length < 240; month = shiftMonth(month, 1)) months.push(month);
  return months;
}

export function monthLabel(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon - 1, 15)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

type BillMoney = {
  amount: number;
  discount?: number | null;
  planDiscount?: number | null;
  lateFee?: number | null;
  admissionFee?: number | null;
  charges?: { amount?: number | null }[] | null;
  paidAmount?: number | null;
  status?: string | null;
};

/** One-off charges on a bill: a tournament entry, a book, a chess set. */
export function chargesTotal(bill: Pick<BillMoney, "charges">) {
  return (bill.charges || []).reduce((sum, charge) => sum + (charge?.amount || 0), 0);
}

/**
 * The month's fee less its discounts (the student's own and a fee plan's),
 * plus a late fee, the admission fee on the first bill, and any one-off charges.
 */
export function billDue(bill: BillMoney) {
  const fee = Math.max(0, bill.amount - (bill.discount || 0) - (bill.planDiscount || 0));
  return fee + (bill.lateFee || 0) + (bill.admissionFee || 0) + chargesTotal(bill);
}

/** What the family still owes on this bill; a waived bill owes nothing. */
export function billBalance(bill: BillMoney) {
  if (bill.status === "waived") return 0;
  return Math.max(0, billDue(bill) - (bill.paidAmount || 0));
}

export function billStatus(bill: BillMoney): "unpaid" | "partial" | "paid" | "waived" {
  if (bill.status === "waived") return "waived";
  const paid = bill.paidAmount || 0;
  if (paid >= billDue(bill)) return "paid";
  return paid > 0 ? "partial" : "unpaid";
}

/** Rupees typed into a form, to paise. Rejects anything that is not a plain amount. */
export function rupeesToPaise(value: unknown) {
  const text = String(value ?? "").replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

export function timeLabel(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, "0")}${suffix}` : `${hour12}${suffix}`;
}

export function slotLabel(slot: { dayOfWeek: number; startTime: string; endTime: string }) {
  return `${DAY_NAMES[slot.dayOfWeek].slice(0, 3)} ${timeLabel(slot.startTime)}–${timeLabel(slot.endTime)}`;
}

export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Slots that cannot take every student in `adding`. `occupied` counts active
 * students already seated, keyed by slot id; a student already in a slot is
 * not counted twice when their record is saved again.
 */
export function overfullSlots(
  slots: { id: string; capacity: number }[],
  occupied: Map<string, string[]>,
  studentId: string | null
) {
  return slots.filter((slot) => {
    const seated = (occupied.get(slot.id) || []).filter((id) => id !== studentId);
    return seated.length + 1 > slot.capacity;
  });
}

// ---------------------------------------------------------------------------
// Attendance register
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

/** "YYYY-MM-DD" that names a real calendar day. */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Weekday of a date key, 0 = Sunday, read off the calendar rather than any clock. */
export function dayOfDateKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function shiftDateKey(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Today in the academy's time zone. */
export function todayKey(now: Date = new Date()) {
  return academyDateKey(now);
}

/**
 * Who belongs on a slot's register for a day. Anyone already written on it
 * stays, in their saved order, even if they have since left the slot or the
 * centre: the register is a record of that day. Current members not yet
 * written on it follow, alphabetically and unmarked.
 */
export function buildRoster<M extends { id: string; name: string }, R extends { student: string }>(
  members: M[],
  records: R[],
) {
  const written = new Set(records.map((record) => record.student));
  return {
    recorded: records,
    unmarked: members.filter((member) => !written.has(member.id)).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Counts on a saved register. */
export function registerCounts(records: { status?: string }[]) {
  const counts = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const record of records) if (isAttendanceStatus(record.status)) counts[record.status] += 1;
  return { ...counts, attended: counts.present + counts.late, marked: records.length };
}

// ---------------------------------------------------------------------------
// Fee settings: discounts, first-month pro rata, late fees, receipts
// ---------------------------------------------------------------------------

export type StudentDiscount = { kind?: "percent" | "flat" | null; value?: number | null } | null | undefined;

/** A standing discount on a monthly fee: a percentage (whole rupees) or a flat amount, never more than the fee. */
export function discountFor(amount: number, discount: StudentDiscount) {
  if (!discount?.value || discount.value <= 0) return 0;
  if (discount.kind === "percent") return Math.min(amount, Math.round((amount * Math.min(discount.value, 100)) / 100 / 100) * 100);
  return Math.min(amount, Math.round(discount.value));
}

/**
 * The first month's fee for a student who joins part-way through it: the share
 * of the month left from the admission day, rounded to the nearest ten rupees.
 * Joining on the 1st pays the whole month.
 */
export function proRataFee(monthlyFee: number, admissionDate: string) {
  const [year, month, day] = admissionDate.split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day <= 1) return monthlyFee;
  return Math.round((monthlyFee * (days - day + 1)) / days / 1000) * 1000;
}

/** A month's bill takes the late fee once its own month is past the given day. */
export function lateFeeApplies(today: string, billMonth: string, afterDay: number) {
  return afterDay > 0 && today.slice(0, 7) === billMonth && Number(today.slice(8, 10)) > afterDay;
}

/** India's financial year, April to March, as "26-27". */
export function financialYear(date: string) {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? year : year - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

export function receiptNumber(prefix: string, year: string, seq: number) {
  return `${prefix}/${year}/${String(seq).padStart(4, "0")}`;
}

/** How many of the most recent classes in a row were missed (statuses newest first). */
export function absenceStreak(statuses: string[]) {
  let streak = 0;
  for (const status of statuses) {
    if (status !== "absent") break;
    streak += 1;
  }
  return streak;
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function underHundred(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ""}`;
}

function underThousand(n: number) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} hundred` : "", rest ? underHundred(rest) : ""].filter(Boolean).join(" ");
}

/** An amount in words the Indian way (lakh, crore), as written on a receipt: "One thousand five hundred rupees only". */
export function rupeesInWords(paise: number) {
  const rupees = Math.floor(Math.max(0, paise) / 100);
  const coins = Math.round(Math.max(0, paise) % 100);
  if (!rupees && !coins) return "Zero rupees only";
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1000);
  const rest = rupees % 1000;
  if (crore) parts.push(`${underThousand(crore)} crore`);
  if (lakh) parts.push(`${underHundred(lakh)} lakh`);
  if (thousand) parts.push(`${underHundred(thousand)} thousand`);
  if (rest) parts.push(underThousand(rest));
  let words = rupees ? `${parts.join(" ")} rupee${rupees === 1 ? "" : "s"}` : "";
  if (coins) words = `${words}${words ? " and " : ""}${underHundred(coins)} paise`;
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} only`;
}

/** The fee reminder families get, by email or pasted into WhatsApp. */
export function reminderText(input: { studentName: string; balance: number; months: string[]; branchLabel: string }) {
  const amount = `₹${Math.round((input.balance || 0) / 100).toLocaleString("en-IN")}`;
  const months = [...input.months].sort().map(monthLabel).join(", ");
  return `${input.studentName}'s chess class fees of ${amount} are due (${months}). Please pay at the ${input.branchLabel} centre by cash or UPI. If you have already paid, please ignore this message.`;
}

// ---------------------------------------------------------------------------
// Fee plans: paying for several months at a time
// ---------------------------------------------------------------------------

export const FEE_PLANS = ["monthly", "quarterly", "half_yearly", "yearly"] as const;
export type FeePlan = (typeof FEE_PLANS)[number];
export const FEE_PLAN_MONTHS: Record<FeePlan, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
export const FEE_PLAN_LABEL: Record<FeePlan, string> = { monthly: "Monthly", quarterly: "Quarterly (3 months)", half_yearly: "Half-yearly (6 months)", yearly: "Yearly (12 months)" };

export function isFeePlan(value: unknown): value is FeePlan {
  return typeof value === "string" && (FEE_PLANS as readonly string[]).includes(value);
}

/**
 * The last month of the plan period that holds `month`. Periods run from the
 * student's first billed month: a quarterly plan starting in October covers
 * Oct-Dec, then Jan-Mar. All of a period's bills are raised at its start.
 */
export function planPeriodEnd(startMonth: string, month: string, plan: FeePlan) {
  const length = FEE_PLAN_MONTHS[plan] || 1;
  const offset = Math.max(0, monthsBetween(startMonth, month).length - 1);
  return shiftMonth(startMonth, Math.floor(offset / length) * length + length - 1);
}

/** A plan's discount on one month's fee, in whole rupees. */
export function planDiscountFor(amount: number, percent: number) {
  if (!percent || percent <= 0) return 0;
  return Math.min(amount, Math.round((amount * Math.min(percent, 100)) / 100 / 100) * 100);
}
