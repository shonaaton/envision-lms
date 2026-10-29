import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenCheck, CalendarDays, NotebookPen, Repeat, Trophy, Video } from "lucide-react";
import { ClassLogList, HomeworkLogList } from "@/components/bowbazar/ClassLog";
import { auth } from "@/lib/auth";
import { myClassLog } from "@/lib/branch/attendance";
import { describeChange } from "@/lib/branch/changes";
import { myMonthlyReports } from "@/lib/branch/reports";
import { myAnnouncements, upcomingHolidaysFor } from "@/lib/branch/comms";
import { myAchievements } from "@/lib/branch/records";
import { todayKey } from "@/lib/branch/rules";
import { BranchSlot, BranchSlotChange, BranchStudent } from "@/models/Branch";
import { myBranchView } from "@/lib/branch/service";
import { monthLabel } from "@/lib/branch/rules";
import { formatINR } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { paid: "Paid", partial: "Part paid", unpaid: "Due", waived: "Waived" };
const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-900",
  unpaid: "bg-red-100 text-red-800",
  waived: "bg-slate-200 text-slate-700",
};

/** A Bowbazar student's home: their class times, fees, and the way to homework and tournaments. */
export default async function BowbazarMyClassPage() {
  const session = await auth();
  const user = session?.user as any;
  if (!user) redirect("/login");
  if (!user.branch || user.role !== "student") redirect(user.branch ? "/bowbazar" : "/dashboard");
  const [view, log] = await Promise.all([myBranchView(String(user.id)), myClassLog(String(user.id))]);
  const homeworkToDo = (log?.homework || []).filter((item) => !item.submitted).length;
  // One-week moves still to come, and anything waiting for the centre.
  const record: any = view ? await BranchStudent.findOne({ user: user.id }).select("_id").lean() : null;
  const changes: any[] = record
    ? await BranchSlotChange.find({
        student: record._id,
        $or: [{ status: "pending" }, { status: "approved", type: "week", toDate: { $gte: todayKey() } }],
      })
        .sort({ toDate: 1, createdAt: -1 })
        .lean()
    : [];
  const changeSlots: any[] = changes.length ? await BranchSlot.find({ _id: { $in: changes.map((change) => change.toSlot) } }).select("mode meetingUrl").lean() : [];
  const reports = record ? await myMonthlyReports(record._id) : [];
  const medals = record ? await myAchievements(record._id) : [];
  const [news, holidays] = view
    ? await Promise.all([
        // Holiday notices show as the banner below, not twice.
        myAnnouncements(user.id).then((items) => items.filter((item) => item.kind !== "holiday")),
        upcomingHolidaysFor(view.branch, view.slots.map((slot) => slot.id)),
      ])
    : [[], []];
  const meetingFor = new Map(changeSlots.map((slot) => [String(slot._id), slot.mode === "online" ? slot.meetingUrl || "" : ""]));

  if (!view) {
    return (
      <div className="rounded-lg border border-brand/10 bg-white p-6 text-sm text-slate-600">
        Your Bowbazar record is not set up yet. Please contact the centre.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-brand/10 bg-white p-5 shadow-sm">
        <div className="text-xs font-black uppercase tracking-wide text-brand">Bowbazar centre</div>
        <h1 className="text-2xl font-black text-slate-950">Hi {view.name.split(" ")[0]}</h1>
        {view.status === "inactive" && (
          <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            Your classes are on hold. Contact the centre to start again.
          </p>
        )}
      </section>

      {(holidays.length > 0 || news.length > 0) && (
        <section className="space-y-2">
          {holidays.map((holiday) => (
            <div key={holiday.id} className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <span className="font-black">No class on {new Date(`${holiday.date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</span> · {holiday.reason}
            </div>
          ))}
          {news.map((item) => (
            <div key={item.id} className="rounded-lg border border-brand/10 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-slate-950">{item.title}</span>
                <span className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.message}</p>
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-brand/10 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-black text-slate-950">
            <CalendarDays size={18} className="text-brand" /> My class times
          </h2>
          <ul className="mt-3 space-y-2">
            {!view.slots.length && <li className="text-sm text-slate-500">No class time assigned yet.</li>}
            {view.slots.map((slot) => (
              <li key={slot.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="font-bold text-slate-900">{slot.label}</span>
                {slot.mode === "online" ? (
                  slot.meetingUrl ? (
                    <a href={slot.meetingUrl} target="_blank" rel="noreferrer" className="btn-primary h-8 px-3 text-xs">
                      <Video size={14} /> Join online
                    </a>
                  ) : (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">Online</span>
                  )
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">At the centre</span>
                )}
              </li>
            ))}
          </ul>
          {changes.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {changes.map((change) => (
                <li key={String(change._id)} className={`rounded-lg px-3 py-2 text-sm ${change.status === "pending" ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
                  <span className="font-bold">{change.status === "pending" ? "Waiting for the centre: " : "Confirmed: "}</span>
                  {describeChange(change)}
                  {change.status === "approved" && meetingFor.get(String(change.toSlot)) && (
                    <a href={meetingFor.get(String(change.toSlot))} target="_blank" rel="noreferrer" className="ml-2 font-bold underline">
                      Join online
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {view.status === "active" && (
            <Link href="/bowbazar/me/change" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-brand hover:underline">
              <Repeat size={15} /> Change my class time
            </Link>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <Link href="/homework" className="flex flex-col justify-between rounded-lg border border-brand/10 bg-white p-5 shadow-sm transition hover:border-brand/40">
            <BookOpenCheck size={22} className="text-brand" />
            <div>
              <div className="mt-3 text-base font-black text-slate-950">Homework</div>
              <div className="text-sm text-slate-500">
                {homeworkToDo ? `${homeworkToDo} to do` : "What your coach set after class"}
              </div>
            </div>
          </Link>
          <Link href="/tournaments" className="flex flex-col justify-between rounded-lg border border-brand/10 bg-white p-5 shadow-sm transition hover:border-brand/40">
            <Trophy size={22} className="text-brand" />
            <div>
              <div className="mt-3 text-base font-black text-slate-950">Tournaments</div>
              <div className="text-sm text-slate-500">Play the academy&apos;s online tournaments</div>
            </div>
          </Link>
        </section>
      </div>

      {log && (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <section className="rounded-lg border border-brand/10 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-black text-slate-950">
              <NotebookPen size={18} className="text-brand" /> My recent classes
            </h2>
            {log.lastMonth.marked > 0 && (
              <p className="text-xs text-slate-500">
                Came to {log.lastMonth.attended} of {log.lastMonth.marked} classes in the last 30 days
              </p>
            )}
            <div className="mt-2">
              <ClassLogList classes={log.classes} empty="Your coach writes what you learnt after each class. It will show here." />
            </div>
          </section>
          <section className="rounded-lg border border-brand/10 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-black text-slate-950">
              <BookOpenCheck size={18} className="text-brand" /> Homework on the portal
            </h2>
            <div className="mt-3">
              <HomeworkLogList homework={log.homework.slice(0, 8)} linkTo={(id) => `/homework/${id}`} />
            </div>
          </section>
        </div>
      )}

      {medals.length > 0 && (
        <section className="rounded-lg border border-brand/10 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black text-slate-950">My achievements</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {medals.map((medal) => (
              <li key={medal.id} className="py-2 text-sm">
                <span className="font-bold text-brand">{medal.result}</span> · {medal.title}
                <span className="ml-2 text-xs text-slate-400">{[medal.level, medal.date].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reports.length > 0 && (
        <section className="rounded-lg border border-brand/10 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black text-slate-950">Monthly reports</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map((report) => (
              <div key={report.month} className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="font-black text-slate-900">{report.monthLabel}</div>
                <div className="mt-1 text-slate-700">
                  Came to {report.attended} of {report.marked} classes
                  {report.homeworkAssigned > 0 && ` · homework ${report.homeworkDone} of ${report.homeworkAssigned}`}
                </div>
                {report.topics.length > 0 && <div className="mt-1 text-xs text-slate-500">{report.topics.join(", ")}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-brand/10 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-black text-slate-950">Fees</h2>
          <div className={cn("text-sm font-black", view.pending ? "text-red-700" : "text-emerald-700")}>
            {view.pending ? `${formatINR(view.pending)} due` : "All paid"}
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {!view.bills.length && <div className="px-5 py-4 text-sm text-slate-500">No fees yet.</div>}
          {view.bills.map((bill) => (
            <div key={bill.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
              <span>
                <span className="font-semibold text-slate-800">{monthLabel(bill.month)}</span>
                {bill.charges.length > 0 && (
                  <span className="block text-xs text-slate-500">
                    {bill.charges.map((charge: { label: string; amount: number }) => `${charge.label} ${formatINR(charge.amount)}`).join(" · ")}
                  </span>
                )}
              </span>
              <span className="flex flex-wrap items-center justify-end gap-3">
                {bill.payments
                  .filter((payment: { receiptNo: string }) => payment.receiptNo)
                  .map((payment: { id: string; receiptNo: string }) => (
                    <Link key={payment.id} href={`/bowbazar/me/receipts/${payment.id}`} className="font-mono text-xs font-bold text-brand hover:underline">
                      {payment.receiptNo}
                    </Link>
                  ))}
                <span className="text-slate-700">{formatINR(bill.due)}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_STYLE[bill.status])}>
                  {bill.status === "partial" ? `${formatINR(bill.balance)} left` : STATUS_LABEL[bill.status]}
                </span>
              </span>
            </div>
          ))}
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Pay at the centre by cash or UPI; the centre marks it paid here.</p>
      </section>
    </div>
  );
}
