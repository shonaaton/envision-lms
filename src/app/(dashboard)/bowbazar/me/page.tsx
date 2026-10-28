import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenCheck, CalendarDays, NotebookPen, Trophy, Video } from "lucide-react";
import { ClassLogList, HomeworkLogList } from "@/components/bowbazar/ClassLog";
import { auth } from "@/lib/auth";
import { myClassLog } from "@/lib/branch/attendance";
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
              <span className="font-semibold text-slate-800">{monthLabel(bill.month)}</span>
              <span className="flex items-center gap-3">
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
