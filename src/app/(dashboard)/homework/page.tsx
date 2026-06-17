import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework, Submission } from "@/models/Homework";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";
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

function assignedStudentCount(homework: any) {
  const recipients = new Set<string>();
  (homework.assignedStudents || []).forEach((student: any) => {
    const id = String(student?._id || student || "");
    if (id) recipients.add(id);
  });
  (homework.assignedBatches || []).forEach((batch: any) => {
    (batch?.students || []).forEach((student: any) => {
      const id = String(student?._id || student || "");
      if (id) recipients.add(id);
    });
  });
  if (homework.assignAllStudents || (!recipients.size && (!homework.assignedBatches || !homework.assignedBatches.length))) {
    (homework.classroom?.students || []).forEach((student: any) => {
      const id = String(student?._id || student || "");
      if (id) recipients.add(id);
    });
  }
  return recipients.size;
}

export default async function HomeworkListPage() {
  const session = await auth();
  const userId = (session?.user as any).id;
  const role = (session?.user as any).role;
  await dbConnect();

  let filter: any = {};
  if (role === "student") {
    const [my, me] = await Promise.all([
      Classroom.find({ students: userId }, { _id: 1 }).lean(),
      User.findById(userId, { batches: 1 }).lean(),
    ]);
    const classroomIds = my.map((c: any) => c._id);
    const batchIds = ((me as any)?.batches || []).map((id: any) => id.toString());
    filter.$or = [
      { assignedStudents: userId },
      { assignedBatches: { $in: batchIds } },
      { classroom: { $in: classroomIds }, assignAllStudents: true },
      { classroom: { $in: classroomIds }, assignedStudents: { $size: 0 }, assignedBatches: { $size: 0 } },
    ];
  } else if (role === "instructor") {
    filter.instructor = userId;
  }
  const [list, submissions] = await Promise.all([
    Homework.find(filter)
      .populate("instructor", "name")
      .populate("classroom", "students")
      .populate("assignedStudents", "_id")
      .populate("assignedBatches", "students")
      .sort({ createdAt: -1 })
      .lean(),
    Submission.find(role === "student" ? { student: userId } : {}).populate("student", "name").lean(),
  ]);
  const byHomework = new Map(submissions.map((submission: any) => [submission.homework.toString(), submission]));
  const pending = list.filter((item: any) => !byHomework.has(item._id.toString()) && (!item.dueAt || new Date(item.dueAt) >= new Date()));
  const late = list.filter((item: any) => !byHomework.has(item._id.toString()) && item.dueAt && new Date(item.dueAt) < new Date());
  const completed = list.filter((item: any) => byHomework.has(item._id.toString()));

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><FileText size={18} /></span>
          <div><h1 className="text-2xl font-semibold">Homework</h1><p className="text-sm text-slate-500">Pending, completed, late homework and assignment analytics.</p></div>
        </div>
        {(role === "instructor" || role === "admin") && <Link href="/instructor/homework/new" className="rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white">Assign Homework</Link>}
      </div>

      {role !== "student" && (
        <section className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border bg-white p-4 shadow-sm"><Clock className="text-amber-600" size={18} /><div className="mt-2 text-2xl font-semibold">{pending.length}</div><div className="text-xs text-slate-500">Not Started</div></div>
          <div className="rounded-lg border bg-white p-4 shadow-sm"><CheckCircle2 className="text-emerald-600" size={18} /><div className="mt-2 text-2xl font-semibold">{submissions.length}</div><div className="text-xs text-slate-500">Submitted</div></div>
          <div className="rounded-lg border bg-white p-4 shadow-sm"><BarChart3 className="text-purple-600" size={18} /><div className="mt-2 text-2xl font-semibold">{percent(submissions.length, list.length)}</div><div className="text-xs text-slate-500">Completion Rate</div></div>
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
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Homework Tracking</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr className="border-b"><th className="px-3 py-3">Homework</th><th>Type</th><th>Due</th><th>Submissions</th><th>Completion Rate</th><th>Average Score</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{list.map((h: any) => {
                const rows = submissions.filter((s: any) => s.homework.toString() === h._id.toString());
                const recipientCount = assignedStudentCount(h);
                return <tr key={h._id} className="border-b last:border-0"><td className="px-3 py-3 font-medium">{h.title}</td><td>{h.type}</td><td>{h.dueAt ? new Date(h.dueAt).toLocaleDateString("en-IN") : "-"}</td><td>{rows.length}</td><td>{percent(rows.length, recipientCount)}%</td><td>{rows.length ? Math.round(rows.reduce((s: number, x: any) => s + (x.totalScore || 0), 0) / rows.length) : 0}</td><td>{h.dueAt && new Date(h.dueAt) < new Date() ? "Due passed" : "Active"}</td><td><HomeworkActions homework={JSON.parse(JSON.stringify(h))} /></td></tr>;
              })}</tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
