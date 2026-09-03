import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework, Submission } from "@/models/Homework";
import { Classroom } from "@/models/Classroom";
import { Batch } from "@/models/Batch";
import { User } from "@/models/User";
import { getCoachAssignedStudentIds } from "@/lib/coachStudentAccess";
import { canAccessFeature } from "@/lib/featureAccess";
import Link from "next/link";
import { BarChart3, CheckCircle2, ClipboardList, Filter, Plus, Users } from "lucide-react";
import HomeworkActions from "@/components/homework/HomeworkActions";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function roleLabel(role: string) {
  if (role === "instructor") return "Coach Workspace";
  if (role === "sub-admin") return "Sub Admin Workspace";
  if (role === "admin") return "Admin Workspace";
  return "Student Workspace";
}

function typeLabel(type?: string) {
  const value = String(type || "puzzle_set").replaceAll("_", " ");
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dueDetails(dueAt?: string | Date) {
  if (!dueAt) return { date: "-", note: "No due date", overdue: false };
  const due = new Date(dueAt);
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  const overdue = diffDays < 0;
  const note = overdue
    ? `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago`
    : diffDays === 0
      ? "Due today"
      : `${diffDays} day${diffDays === 1 ? "" : "s"} left`;
  return { date: due.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }), note, overdue };
}

function HomeworkCard({ item, submission }: { item: any; submission?: any }) {
  const overdue = item.dueAt && new Date(item.dueAt) < new Date() && !submission;
  return (
    <Link href={`/homework/${item._id}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-purple-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-950">{item.title}</div>
          <div className="mt-1 text-xs text-slate-500">{item.type?.replaceAll("_", " ") || "puzzle set"} - Coach: {item.instructor?.name || "Coach"}</div>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs ${submission ? "bg-emerald-50 text-emerald-700" : overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{submission ? "Completed" : overdue ? "Late" : "Pending"}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
        <div>Due Date</div><b>{item.dueAt ? new Date(item.dueAt).toLocaleDateString("en-IN") : "No due date"}</b>
        <div>Status</div><b>{submission?.status || (overdue ? "Late" : "Not Started")}</b>
        {submission && <><div>Score</div><b>{submission.totalScore}</b><div>Accuracy</div><b>{submission.accuracy || 0}%</b></>}
      </div>
    </Link>
  );
}

function assignedStudentIds(homework: any, allowedStudentIds?: Set<string>) {
  const recipients = new Set<string>();
  function addRecipient(value: any) {
    const id = String(value?._id || value || "");
    if (id && (!allowedStudentIds || allowedStudentIds.has(id))) recipients.add(id);
  }
  (homework.assignedStudents || []).forEach((student: any) => {
    addRecipient(student);
  });
  (homework.assignedBatches || []).forEach((batch: any) => {
    (batch?.students || []).forEach((student: any) => {
      addRecipient(student);
    });
  });
  const hasSpecificRecipients = Boolean((homework.assignedStudents || []).length || (homework.assignedBatches || []).length);
  if (homework.assignAllStudents || !hasSpecificRecipients) {
    (homework.classroom?.students || []).forEach((student: any) => {
      addRecipient(student);
    });
  }
  return recipients;
}

type TrackingTab = "all" | "pending" | "submitted" | "late";

export default async function HomeworkListPage({ searchParams }: { searchParams?: { status?: string } }) {
  const session = await auth();
  const userId = (session?.user as any).id;
  const role = (session?.user as any).role;
  await dbConnect();

  let filter: any = {};
  if (role === "student") {
    const [my, me, batchMemberships] = await Promise.all([
      Classroom.find({ students: userId }, { _id: 1 }).lean(),
      User.findById(userId, { batches: 1 }).lean(),
      Batch.find({ students: userId }, { _id: 1 }).lean(),
    ]);
    const classroomIds = my.map((c: any) => c._id);
    const batchIds = Array.from(new Set([
      ...((me as any)?.batches || []).map((id: any) => id.toString()),
      ...batchMemberships.map((batch: any) => batch._id.toString()),
    ]));
    filter.$or = [
      { assignedStudents: userId },
      { assignedBatches: { $in: batchIds } },
      { classroom: { $in: classroomIds }, assignAllStudents: true },
      { classroom: { $in: classroomIds }, assignedStudents: { $size: 0 }, assignedBatches: { $size: 0 } },
    ];
  } else if (role === "instructor") {
    filter.instructor = userId;
  }
  const [list, coachStudentIds] = await Promise.all([
    Homework.find(filter)
      .populate("instructor", "name")
      .populate("classroom", "students")
      .populate("assignedStudents", "_id")
      .populate("assignedBatches", "students")
      .sort({ createdAt: -1 })
      .lean(),
    role === "instructor" ? getCoachAssignedStudentIds(userId) : Promise.resolve([]),
  ]);
  const homeworkIds = list.map((item: any) => item._id);
  const submissionFilter = role === "student"
    ? { student: userId, homework: { $in: homeworkIds } }
    : role === "instructor"
      ? { student: { $in: coachStudentIds }, homework: { $in: homeworkIds } }
      : { homework: { $in: homeworkIds } };
  const submissions = homeworkIds.length
    ? await Submission.find(submissionFilter).populate("student", "name username email").lean()
    : [];
  const visibleStudentIds = role === "instructor" ? new Set(coachStudentIds.map(String)) : undefined;
  const byHomework = new Map(submissions.map((submission: any) => [submission.homework.toString(), submission]));
  const pending = list.filter((item: any) => !byHomework.has(item._id.toString()) && (!item.dueAt || new Date(item.dueAt) >= new Date()));
  const late = list.filter((item: any) => !byHomework.has(item._id.toString()) && item.dueAt && new Date(item.dueAt) < new Date());
  const completed = list.filter((item: any) => byHomework.has(item._id.toString()));
  const recipientIdsByHomework = new Map(list.map((item: any) => [item._id.toString(), assignedStudentIds(item, visibleStudentIds)]));
  const allRecipientIds = Array.from(new Set(Array.from(recipientIdsByHomework.values()).flatMap((ids) => Array.from(ids))));
  const recipientUsers = allRecipientIds.length
    ? await User.find({ _id: { $in: allRecipientIds } }, { name: 1, username: 1, email: 1 }).lean()
    : [];
  const recipientNameById = new Map(recipientUsers.map((student: any) => [
    student._id.toString(),
    student.name || student.username || student.email || "Student",
  ]));
  const submissionsByHomework = new Map<string, any[]>();
  submissions.forEach((submission: any) => {
    const homeworkId = submission.homework.toString();
    submissionsByHomework.set(homeworkId, [...(submissionsByHomework.get(homeworkId) || []), submission]);
  });
  const requestedTab = String(searchParams?.status || "all").toLowerCase();
  const trackingTab: TrackingTab = (["pending", "submitted", "late"].includes(requestedTab) ? requestedTab : "all") as TrackingTab;
  const trackingState = (homework: any) => {
    const homeworkId = homework._id.toString();
    const rows = submissionsByHomework.get(homeworkId) || [];
    const recipientCount = recipientIdsByHomework.get(homeworkId)?.size || 0;
    const incomplete = recipientCount > 0 ? rows.length < recipientCount : rows.length === 0;
    const overdue = Boolean(incomplete && homework.dueAt && new Date(homework.dueAt) < new Date());
    return { rows, recipientCount, incomplete, overdue };
  };
  const pendingTracking = list.filter((homework: any) => {
    const state = trackingState(homework);
    return state.incomplete && !state.overdue;
  });
  const lateTracking = list.filter((homework: any) => trackingState(homework).overdue);
  const submittedTracking = list.filter((homework: any) => trackingState(homework).rows.length > 0);
  const completedTracking = list.filter((homework: any) => !trackingState(homework).incomplete);
  const visibleTracking = list.filter((homework: any) => {
    const state = trackingState(homework);
    if (trackingTab === "pending") return state.incomplete && !state.overdue;
    if (trackingTab === "late") return state.overdue;
    if (trackingTab === "submitted") return state.rows.length > 0;
    return true;
  });
  const expectedSubmissions = list.reduce((sum: number, homework: any) => sum + trackingState(homework).recipientCount, 0);
  const averageAccuracy = average(submissions.map((submission: any) => Number(submission.accuracy || 0)));
  const canCreateHomework = role === "instructor" || (await canAccessFeature("homework", session?.user as any, "create"));
  const canAssignHomework = role === "instructor" || (await canAccessFeature("homework", session?.user as any, "assign"));
  const canEditHomework = role === "instructor" || (await canAccessFeature("homework", session?.user as any, "edit"));
  const canDeleteHomework = await canAccessFeature("homework", session?.user as any, "delete");
  const canSendReminders = canAssignHomework || canEditHomework;
  const staffActions = { canEdit: canEditHomework, canDelete: canDeleteHomework, canRemind: canSendReminders };
  const canUseAssignmentFlow = canCreateHomework && canAssignHomework;

  return (
    <div className="min-h-screen px-2 py-4 text-slate-950 sm:px-4 sm:py-5 lg:px-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 text-xs font-black uppercase text-brand/70">{roleLabel(role)}</div>
          <h1 className="text-2xl font-black tracking-normal text-[#17104f]">Homework</h1>
          <p className="mt-1 text-sm text-slate-500">Monitor homework submissions, due dates, reviews, and student performance.</p>
        </div>
        {canUseAssignmentFlow && (
          <Link href="/instructor/homework/new" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-black text-white shadow-sm shadow-brand/20 hover:bg-brand-700">
            <Plus size={16} /> Assign Homework
          </Link>
        )}
      </div>

      {role !== "student" && (
        <section className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard href="/homework?status=pending#homework-tracking" active={trackingTab === "pending"} icon={<ClipboardList size={22} />} tone="amber" label="Pending" value={pendingTracking.length} detail="Awaiting submission" />
          <MetricCard href="/homework?status=submitted#homework-tracking" active={trackingTab === "submitted"} icon={<CheckCircle2 size={22} />} tone="emerald" label="Submitted" value={submissions.length} detail="Attempts received" />
          <MetricCard href="/homework#homework-tracking" active={trackingTab === "all"} icon={<BarChart3 size={22} />} tone="purple" label="Completed" value={completedTracking.length} detail={`${percent(submissions.length, expectedSubmissions)}% completion rate`} />
          <MetricCard icon={<Users size={22} />} tone="sky" label="Average Score" value={`${averageAccuracy}%`} detail="Across submissions" />
        </section>
      )}

      {role === "student" ? (
        <div className="space-y-5">
          <section><h2 className="mb-3 font-semibold">Pending Homework</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{pending.map((h: any) => <HomeworkCard key={h._id} item={h} />)}{pending.length === 0 && <div className="rounded-lg border bg-white p-5 text-sm text-slate-500">No pending homework.</div>}</div></section>
          <section><h2 className="mb-3 font-semibold">Late Homework</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{late.map((h: any) => <HomeworkCard key={h._id} item={h} />)}{late.length === 0 && <div className="rounded-lg border bg-white p-5 text-sm text-slate-500">No late homework.</div>}</div></section>
          <section><h2 className="mb-3 font-semibold">Completed Homework</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{completed.map((h: any) => <HomeworkCard key={h._id} item={h} submission={byHomework.get(h._id.toString())} />)}{completed.length === 0 && <div className="rounded-lg border bg-white p-5 text-sm text-slate-500">No completed homework yet.</div>}</div></section>
        </div>
      ) : (
        <section id="homework-tracking" className="min-w-0 scroll-mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-brand-900/5">
          <div className="flex min-w-0 flex-col gap-3 border-b border-slate-200 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h2 className="font-black text-[#17104f]">Homework Tracking</h2>
              <p className="mt-1 text-xs text-slate-500">View and manage homework assignments and student submissions.</p>
            </div>
            <div className="flex max-w-full flex-col gap-2 sm:flex-row sm:items-center">
              <nav aria-label="Homework status filters" className="flex max-w-full gap-2 overflow-x-auto">
                {([
                  ["all", "All", list.length, "bg-brand-50 text-brand border-brand/20"],
                  ["pending", "Pending", pendingTracking.length, "bg-amber-50 text-amber-700 border-amber-200"],
                  ["submitted", "Submitted", submittedTracking.length, "bg-emerald-50 text-emerald-700 border-emerald-200"],
                  ["late", "Late", lateTracking.length, "bg-rose-50 text-rose-700 border-rose-200"],
                ] as Array<[TrackingTab, string, number, string]>).map(([key, label, count, tone]) => (
                  <Link
                    key={key}
                    href={key === "all" ? "/homework#homework-tracking" : `/homework?status=${key}#homework-tracking`}
                    className={`inline-flex h-9 flex-none items-center gap-2 rounded-md border px-3 text-xs font-black transition ${trackingTab === key ? tone : "border-slate-200 bg-white text-slate-700 hover:border-brand/30 hover:text-brand"}`}
                    aria-current={trackingTab === key ? "page" : undefined}
                  >
                    {label}<span className="h-1.5 w-1.5 rounded-full bg-current" /><span className="tabular-nums">{count}</span>
                  </Link>
                ))}
              </nav>
              <details className="relative">
                <summary className="inline-flex h-9 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-brand/20 bg-white px-3 text-xs font-black text-brand shadow-sm marker:hidden">
                  <Filter size={14} /> Filter
                </summary>
                <div className="absolute right-0 z-10 mt-2 w-44 rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold shadow-xl shadow-brand-900/10">
                  {([
                    ["all", "All Homework"],
                    ["pending", "Pending"],
                    ["submitted", "Submitted"],
                    ["late", "Late"],
                  ] as Array<[TrackingTab, string]>).map(([key, label]) => (
                    <Link key={key} href={key === "all" ? "/homework#homework-tracking" : `/homework?status=${key}#homework-tracking`} className={`block rounded-md px-3 py-2 ${trackingTab === key ? "bg-brand-50 text-brand" : "text-slate-600 hover:bg-slate-50"}`}>
                      {label}
                    </Link>
                  ))}
                </div>
              </details>
            </div>
          </div>
          <div className="grid gap-3 p-3 xl:hidden">
            {visibleTracking.map((h: any) => {
              const { rows, recipientCount, incomplete, overdue } = trackingState(h);
              const submittedStudentIds = new Set(rows.map((submission: any) => String(submission.student?._id || submission.student || "")));
              const recipientIds = Array.from(recipientIdsByHomework.get(h._id.toString()) || []);
              const due = dueDetails(h.dueAt);
              return (
                <article key={h._id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-950">{h.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">{typeLabel(h.type)} - {due.date}</p>
                      <p className={`mt-1 text-[11px] font-bold ${due.overdue ? "text-rose-600" : "text-slate-500"}`}>{due.note}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm ${overdue ? "bg-rose-50 text-rose-700" : incomplete ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{overdue ? "Late" : incomplete ? (rows.length ? "Partially submitted" : "Pending") : "Submitted"}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <InfoTile label="Submissions" value={String(rows.length)} />
                    <InfoTile label="Completion" value={`${percent(rows.length, recipientCount)}%`} />
                    <InfoTile label="Avg Score" value={String(rows.length ? Math.round(rows.reduce((s: number, x: any) => s + (x.totalScore || 0), 0) / rows.length) : 0)} />
                    <InfoTile label="Recipients" value={String(recipientCount)} />
                  </div>
                  <StudentStatusList recipientIds={recipientIds} submittedStudentIds={submittedStudentIds} recipientNameById={recipientNameById} overdue={overdue} />
                  <div className="mt-3">
                    <HomeworkActions homework={JSON.parse(JSON.stringify(h))} permissions={staffActions} />
                  </div>
                </article>
              );
            })}
            {visibleTracking.length === 0 && <EmptyTrackingState tab={trackingTab} />}
          </div>
          <div className="hidden min-w-0 xl:block">
            <table className="w-full table-fixed text-left text-xs 2xl:text-sm">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead className="text-[11px] uppercase text-[#17104f]/70 2xl:text-xs"><tr className="border-b"><th className="px-4 py-3">Homework</th><th className="px-3 py-3">Students</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Due Date</th><th className="px-3 py-3">Submissions</th><th className="px-3 py-3">Completion Rate</th><th className="px-3 py-3">Average Score</th><th className="px-3 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody>{visibleTracking.map((h: any) => {
                const { rows, recipientCount, incomplete, overdue } = trackingState(h);
                const submittedStudentIds = new Set(rows.map((submission: any) => String(submission.student?._id || submission.student || "")));
                const recipientIds = Array.from(recipientIdsByHomework.get(h._id.toString()) || []);
                const completion = percent(rows.length, recipientCount);
                const rowAverageAccuracy = average(rows.map((submission: any) => Number(submission.accuracy || 0)));
                const due = dueDetails(h.dueAt);
                return <tr key={h._id} className="border-b align-top last:border-0 hover:bg-brand-50/30"><td className="px-4 py-4 font-medium"><span className="line-clamp-2 break-words font-black text-[#17104f]">{h.title}</span><span className="mt-1 inline-flex rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-black text-brand">HW</span></td><td className="px-3 py-4"><StudentStatusList recipientIds={recipientIds} submittedStudentIds={submittedStudentIds} recipientNameById={recipientNameById} overdue={overdue} compact /></td><td className="px-3 py-4"><span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700 ring-1 ring-amber-100">{typeLabel(h.type)}</span></td><td className="px-3 py-4"><div className="font-semibold text-[#17104f]">{due.date}</div><div className={`mt-1 text-[11px] font-bold ${due.overdue ? "text-rose-600" : "text-slate-500"}`}>{due.note}</div></td><td className="px-3 py-4 font-black text-[#17104f]">{rows.length} / {recipientCount}</td><td className="px-3 py-4"><div className="font-black text-[#17104f]">{completion}%</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${completion >= 70 ? "bg-emerald-500" : completion > 0 ? "bg-amber-500" : "bg-slate-300"}`} style={{ width: `${completion}%` }} /></div></td><td className="px-3 py-4 font-black text-[#17104f]">{rows.length ? `${rowAverageAccuracy}%` : "-"}</td><td className="px-3 py-4"><span className={`inline-flex max-w-full rounded-md px-2 py-1 text-[11px] font-black ${overdue ? "bg-rose-50 text-rose-700" : incomplete ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{overdue ? "Late" : incomplete ? (rows.length ? "Needs review" : "Pending") : "Completed"}</span></td><td className="px-4 py-4"><HomeworkActions homework={JSON.parse(JSON.stringify(h))} compact permissions={staffActions} /></td></tr>;
              })}</tbody>
            </table>
            {visibleTracking.length === 0 && <EmptyTrackingState tab={trackingTab} />}
          </div>
        </section>
      )}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function MetricCard({
  href,
  active,
  icon,
  tone,
  label,
  value,
  detail,
}: {
  href?: string;
  active?: boolean;
  icon: ReactNode;
  tone: "amber" | "emerald" | "purple" | "sky";
  label: string;
  value: string | number;
  detail: string;
}) {
  const toneClasses = {
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    purple: "bg-brand-50 text-brand ring-brand/10",
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
  }[tone];
  const content = (
    <>
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ring-1 ${toneClasses}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-bold text-slate-500">{label}</div>
        <div className="mt-1 text-2xl font-black leading-none text-[#17104f]">{value}</div>
        <div className="mt-2 text-xs font-semibold text-slate-500">{detail}</div>
      </div>
    </>
  );
  const className = `flex min-h-28 items-center gap-4 rounded-lg border bg-white p-4 shadow-sm shadow-brand-900/5 transition ${active ? "border-brand/40 ring-2 ring-brand/10" : "border-slate-200 hover:border-brand/20"}`;

  if (href) {
    return <Link href={href} className={className}>{content}</Link>;
  }
  return <div className={className}>{content}</div>;
}

function StudentStatusList({
  recipientIds,
  submittedStudentIds,
  recipientNameById,
  overdue,
  compact = false,
}: {
  recipientIds: string[];
  submittedStudentIds: Set<string>;
  recipientNameById: Map<string, string>;
  overdue: boolean;
  compact?: boolean;
}) {
  if (!recipientIds.length) {
    return <div className={`${compact ? "" : "mt-3"} text-xs text-slate-500`}>No assigned students.</div>;
  }

  return (
    <div className={`${compact ? "max-h-28" : "mt-3 max-h-36 rounded-lg border border-slate-200 bg-white p-2"} space-y-1 overflow-y-auto pr-1`}>
      {recipientIds.map((studentId) => {
        const submitted = submittedStudentIds.has(studentId);
        const label = submitted ? "Submitted" : overdue ? "Late" : "Pending";
        return (
          <div key={studentId} className="flex min-w-0 items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate font-medium text-slate-800" title={recipientNameById.get(studentId) || "Student"}>{recipientNameById.get(studentId) || "Student"}</span>
            <span className={`flex-none rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${submitted ? "bg-emerald-50 text-emerald-700" : overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyTrackingState({ tab }: { tab: TrackingTab }) {
  const label = tab === "all" ? "homework" : `${tab} homework`;
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No {label} found.</div>;
}
