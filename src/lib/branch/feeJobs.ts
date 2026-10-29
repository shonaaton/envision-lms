import { dbConnect } from "@/lib/db";
import { academyDateKey } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { BranchFeeBill, BranchReminderLog, BranchStudent } from "@/models/Branch";
import { ensureBranchBills } from "./bills";
import { BRANCHES, BRANCH_LABELS, type BranchKey } from "./scope";
import { getBranchSettings } from "./settings";
import { billBalance, lateFeeApplies, monthKey, monthLabel, reminderText } from "./rules";

/**
 * The branch fee jobs: the late fee and the fee reminders. Reached from
 * instrumentation.ts, so nothing here (or below it) may import a Node
 * built-in statically - which is why it never touches lib/branch/service.ts.
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const rupees = (paise: number) => `₹${Math.round((paise || 0) / 100).toLocaleString("en-IN")}`;
const REMINDER_HOUR = 10; // academy time

function academyHour(now: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(now)) % 24;
}

/** Adds the branch's late fee, once, to this month's bills still owing after the set day. */
export async function applyLateFees(branch: BranchKey, today = academyDateKey(new Date())) {
  const settings = await getBranchSettings(branch);
  const month = today.slice(0, 7);
  if (!settings.lateFee || !lateFeeApplies(today, month, settings.lateFeeAfterDay)) return 0;
  const result = await BranchFeeBill.updateMany(
    { branch, month, status: { $in: ["unpaid", "partial"] }, lateFeeAppliedAt: { $exists: false }, lateFee: { $in: [0, null] } },
    { $set: { lateFee: settings.lateFee, lateFeeAppliedAt: new Date() } }
  );
  return result.modifiedCount || 0;
}

/** Who owes what, per active student: balance and the months it covers. */
async function owing(branch: BranchKey) {
  const bills: any[] = await BranchFeeBill.find({ branch, status: { $in: ["unpaid", "partial"] } }).select("student month amount discount planDiscount lateFee admissionFee charges paidAmount status").lean();
  const byStudent = new Map<string, { balance: number; months: string[] }>();
  for (const bill of bills) {
    const balance = billBalance(bill);
    if (balance <= 0) continue;
    const entry = byStudent.get(id(bill.student)) || { balance: 0, months: [] };
    entry.balance += balance;
    entry.months.push(bill.month);
    byStudent.set(id(bill.student), entry);
  }
  return byStudent;
}


/**
 * Sends one reminder to every active student who owes, at most once a day each:
 * in the portal, by email (real addresses only) and on WhatsApp.
 */
export async function sendFeeReminders(branch: BranchKey, { manual = false, request }: { manual?: boolean; request?: Request } = {}) {
  await dbConnect();
  await ensureBranchBills(branch);
  const today = academyDateKey(new Date());
  const [dues, students]: [Map<string, { balance: number; months: string[] }>, any[]] = await Promise.all([
    owing(branch),
    BranchStudent.find({ branch, status: "active" }).select("name parentName user").lean(),
  ]);
  const branchLabel = BRANCH_LABELS[branch];
  const base = resolvePublicAppUrl(request);
  let sent = 0;
  let skipped = 0;
  for (const student of students) {
    const due = dues.get(id(student));
    if (!due) continue;
    try {
      // Claimed first: a second run the same day (a restart, a manual send) finds the row and stops.
      await BranchReminderLog.create({ branch, student: student._id, date: today, amount: due.balance, manual });
    } catch (error: any) {
      if (error?.code === 11000) {
        skipped += 1;
        continue;
      }
      throw error;
    }
    const user: any = await User.findById(student.user).select("name email phone countryCode").lean();
    const message = reminderText({ studentName: student.name, balance: due.balance, months: due.months, branchLabel });
    const channels: string[] = [];
    if (user) {
      await Notification.create({ user: user._id, type: "branch_fee_reminder", title: "Fees due", message, metadata: { href: "/bowbazar/me" } });
      channels.push("portal");
      if (user.email && !/\.invalid$/i.test(user.email)) {
        const email = await sendAutomationEmail({
          to: user.email,
          subject: `Fees due: ${student.name} - Envision Chess Academy ${branchLabel}`,
          message: [`Hello${student.parentName ? ` ${student.parentName}` : ""},`, "", message, "", base ? `See the fees on the portal: ${base}/bowbazar/me` : ""].join("\n"),
          metadata: { kind: "branch_fee_reminder", studentId: id(student), date: today },
        }).catch(() => null);
        if (email?.delivered) channels.push("email");
      }
      const whatsapp = await sendWhatsAppAutomationTemplate({
        user,
        templateName: "bowbazar_fee_reminder",
        bodyParameters: [student.parentName || "Parent", student.name, rupees(due.balance), due.months.sort().map(monthLabel).join(", ")],
        metadata: { kind: "branch_fee_reminder", studentId: id(student), dedupKey: `branch-fee-reminder:${id(student)}:${today}` },
      }).catch(() => null);
      if (whatsapp?.delivered) channels.push("whatsapp");
    }
    await BranchReminderLog.updateOne({ student: student._id, date: today }, { $set: { channels } });
    sent += 1;
  }
  return { sent, skipped };
}

/** Hourly: late fees once the set day passes, reminders at 10am on the chosen days. */
export async function processBranchFeeJobs(now = new Date()) {
  await dbConnect();
  const today = academyDateKey(now);
  for (const branch of BRANCHES) {
    const settings = await getBranchSettings(branch);
    if (settings.lateFee) {
      await ensureBranchBills(branch, monthKey(now));
      await applyLateFees(branch, today);
    }
    if (settings.remindersEnabled && settings.reminderDays.includes(Number(today.slice(8, 10))) && academyHour(now) >= REMINDER_HOUR) {
      await sendFeeReminders(branch);
    }
  }
}
