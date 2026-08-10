import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework, Submission } from "@/models/Homework";
import { Classroom } from "@/models/Classroom";
import { Batch } from "@/models/Batch";
import { User } from "@/models/User";
import { getCoachAssignedStudentIds } from "@/lib/coachStudentAccess";
import Link from "next/link";
import { BarChart3, CheckCircle2, Clock, FileText } from "lucide-react";
import HomeworkActions from "@/components/homework/HomeworkActions";

export const dynamic = "force-dynamic";

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
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
  const visibleTracking = list.filter((homework: any) => {
    const state = trackingState(homework);
    if (trackingTab === "pending") return state.incomplete && !state.overdue;
    if (trackingTab === "late") return state.overdue;
    if (trackingTab === "submitted") return state.rows.length > 0;
    return true;
  });
  const expectedSubmissions = list.reduce((sum: number, homework: any) => sum + trackingState(homework).recipientCount, 0);

  return (
    <div className="min-h-screen bg-slate-50 px-2 py-4 text-slate-950 sm:px-6 sm:py-5 lg:px-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><FileText size={18} /></span>
          <div><h1 className="text-2xl font-semibold">Homework</h1><p className="text-sm text-slate-500">Pending, completed, late homework and assignment analytics.</p></div>
        </div>
        {(role === "instructor" || role === "admin") && <Link href="/instructor/homework/new" className="inline-flex min-h-11 items-center justify-center rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white">Assign Homework</Link>}
      </div>

      {role !== "student" && (
        <section className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Link href="/homework?status=pending#homework-tracking" className={`rounded-lg border bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow-md ${trackingTab === "pending" ? "border-amber-400 ring-2 ring-amber-100" : ""}`}><Clock className="text-amber-600" size={18} /><div className="mt-2 text-2xl font-semibold">{pendingTracking.length}</div><div className="text-xs text-slate-500">Pending</div></Link>
          <Link href="/homework?status=submitted#homework-tracking" className={`rounded-lg border bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md ${trackingTab === "submitted" ? "border-emerald-400 ring-2 ring-emerald-100" : ""}`}><CheckCircle2 className="text-emerald-600" size={18} /><div className="mt-2 text-2xl font-semibold">{submissions.length}</div><div className="text-xs text-slate-500">Submitted</div></Link>
          <div className="rounded-lg border bg-white p-4 shadow-sm"><BarChart3 className="text-purple-600" size={18} /><div className="mt-2 text-2xl font-semibold">{percent(submissions.length, expectedSubmissions)}</div><div className="text-xs text-slate-500">Completion Rate</div></div>
          <div className="rounded-lg border bg-white p-4 shadow-sm"><BarChart3 className="text-sky-600" size={18} /><div className="mt-2 text-2xl font-semibold">{submissions.length ? Math.round(submissions.reduce((s: number, x: any) => s + (x.totalScore || 0), 0) / submissions.length) : 0}</div><div className="text-xs text-slate-500">Average Score</div></div>
        </section>
      )}

      {role === "student" ? (
        <div className="space-y-5">
          <section><h2 className="mb-3 font-semibold">Pending Homework</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{pending.map((h: any) => <HomeworkCard key={h._id} item={h} />)}{pending.length === 0 && <div className="rounded-lg border bg-white p-5 text-sm text-slate-500">No pending homework.</div>}</div></section>
          <section><h2 className="mb-3 font-semibold">Late Homework</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{late.map((h: any) => <HomeworkCard key={h._id} item={h} />)}{late.length === 0 && <div className="rounded-lg border bg-white p-5 text-sm text-slate-500">No late homework.</div>}</div></section>
          <section><h2 className="mb-3 font-semibold">Completed Homework</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{completed.map((h: any) => <HomeworkCard key={h._id} item={h} submission={byHomework.get(h._id.toString())} />)}{completed.length === 0 && <div className="rounded-lg border bg-white p-5 text-sm text-slate-500">No completed homework yet.</div>}</div></section>
        </div>
      ) : (
        <section id="homework-tracking" className="min-w-0 scroll-mt-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-4 flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h2 className="font-semibold">Homework Tracking</h2>
              <p className="mt-1 text-xs text-slate-500">Select a section to view its assignments and student statuses.</p>
            </div>
            <nav aria-label="Homework status filters" className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
              {([
                ["all", "All", list.length],
                ["pending", "Pending", pendingTracking.length],
                ["submitted", "Submitted", submittedTracking.length],
                ["late", "Late", lateTracking.length],
              ] as Array<[TrackingTab, string, number]>).map(([key, label, count]) => (
                <Link
                  key={key}
                  href={key === "all" ? "/homework#homework-tracking" : `/homework?status=${key}#homework-tracking`}
                  className={`inline-flex h-9 flex-none items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${trackingTab === key ? "bg-white text-purple-700 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-950"}`}
                  aria-current={trackingTab === key ? "page" : undefined}
                >
                  {label}<span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-700">{count}</span>
                </Link>
              ))}
            </nav>
          </div>
          <div className="grid gap-3 xl:hidden">
            {visibleTracking.map((h: any) => {
              const { rows, recipientCount, incomplete, overdue } = trackingState(h);
              const submittedStudentIds = new Set(rows.map((submission: any) => String(submission.student?._id || submission.student || "")));
              const recipientIds = Array.from(recipientIdsByHomework.get(h._id.toString()) || []);
              return (
                <article key={h._id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-950">{h.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">{h.type} - {h.dueAt ? new Date(h.dueAt).toLocaleDateString("en-IN") : "No due date"}</p>
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
                    <HomeworkActions homework={JSON.parse(JSON.stringify(h))} />
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
              <thead className="text-[11px] uppercase text-slate-500 2xl:text-xs"><tr className="border-b"><th className="px-2 py-3">Homework</th><th className="px-2 py-3">Students</th><th className="px-2 py-3">Type</th><th className="px-2 py-3">Due</th><th className="px-2 py-3">Submissions</th><th className="px-2 py-3">Completion Rate</th><th className="px-2 py-3">Average Score</th><th className="px-2 py-3">Status</th><th className="px-2 py-3 text-right">Actions</th></tr></thead>
              <tbody>{visibleTracking.map((h: any) => {
                const { rows, recipientCount, incomplete, overdue } = trackingState(h);
                const submittedStudentIds = new Set(rows.map((submission: any) => String(submission.student?._id || submission.student || "")));
                const recipientIds = Array.from(recipientIdsByHomework.get(h._id.toString()) || []);
                return <tr key={h._id} className="border-b align-top last:border-0"><td className="px-2 py-3 font-medium"><span className="line-clamp-3 break-words">{h.title}</span></td><td className="px-2 py-3"><StudentStatusList recipientIds={recipientIds} submittedStudentIds={submittedStudentIds} recipientNameById={recipientNameById} overdue={overdue} compact /></td><td className="break-words px-2 py-3">{h.type}</td><td className="px-2 py-3">{h.dueAt ? new Date(h.dueAt).toLocaleDateString("en-IN") : "-"}</td><td className="px-2 py-3">{rows.length}/{recipientCount}</td><td className="px-2 py-3">{percent(rows.length, recipientCount)}%</td><td className="px-2 py-3">{rows.length ? Math.round(rows.reduce((s: number, x: any) => s + (x.totalScore || 0), 0) / rows.length) : 0}</td><td className="px-2 py-3"><span className={`inline-flex max-w-full rounded-full px-2 py-1 text-[11px] font-semibold ${overdue ? "bg-rose-50 text-rose-700" : incomplete ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{overdue ? "Late" : incomplete ? (rows.length ? "Partially submitted" : "Pending") : "Submitted"}</span></td><td className="px-2 py-3"><HomeworkActions homework={JSON.parse(JSON.stringify(h))} compact /></td></tr>;
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
