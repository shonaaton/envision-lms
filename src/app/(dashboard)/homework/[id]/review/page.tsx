import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework, Submission } from "@/models/Homework";
import { User } from "@/models/User";
import { getCoachAssignedStudentIds } from "@/lib/coachStudentAccess";
import { ChevronLeft, Clock, FileText, Trophy, User2 } from "lucide-react";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

type TraceEntry = {
  moveNumber: number;
  by: string;
  san?: string;
  from?: string;
  to?: string;
  note?: string;
};

export default async function HomeworkReviewPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!session || (role !== "instructor" && role !== "admin")) {
    return <div className="rounded-2xl border bg-white p-6 text-sm text-slate-600">Forbidden</div>;
  }

  await dbConnect();
  const homework: any = await Homework.findById(params.id).lean();
  if (!homework) return <div className="rounded-2xl border bg-white p-6 text-sm text-slate-600">Homework not found.</div>;
  if (role === "instructor" && objectId(homework.instructor) !== userId) {
    return <div className="rounded-2xl border bg-white p-6 text-sm text-slate-600">Forbidden</div>;
  }

  const coachStudentIds = role === "instructor" ? await getCoachAssignedStudentIds(userId) : [];
  const submissionFilter = role === "instructor"
    ? { homework: homework._id, student: { $in: coachStudentIds } }
    : { homework: homework._id };
  const submissions: any[] = await Submission.find(submissionFilter).populate("student", "name email username").sort({ submittedAt: -1 }).lean();
  const studentIds = submissions.map((item: any) => objectId(item.student)).filter(Boolean);
  const students: any[] = studentIds.length ? await User.find({ _id: { $in: studentIds } }).populate("batches", "name").lean() : [];
  const batchByStudent = new Map(students.map((student: any) => [objectId(student._id), (student.batches || []).map((batch: any) => batch.name).join(", ")]));

  return (
    <div className="space-y-5 text-slate-950">
      <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_24px_60px_rgba(90,19,114,0.10)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-brand/70">Homework Review</div>
            <h1 className="mt-1 text-3xl font-black text-brand">{homework.title}</h1>
            <p className="mt-1 text-sm text-slate-600">Track each student attempt, scores, and full move history for board-based homework.</p>
          </div>
          <Link href="/homework" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900">
            <ChevronLeft size={16} />
            Back to Homework
          </Link>
        </div>
      </section>

      <div className="space-y-4">
        {submissions.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{role === "instructor" ? "No submissions from your assigned students yet." : "No submissions yet."}</div>}
        {submissions.map((submission: any) => (
          <section key={objectId(submission._id)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-lg font-black text-slate-950"><User2 size={18} className="text-brand" /> {submission.student?.name || "Student"}</div>
                <div className="mt-1 text-sm text-slate-500">{submission.student?.username || submission.student?.email || ""}</div>
                <div className="mt-1 text-sm text-slate-500">Batch: {batchByStudent.get(objectId(submission.student)) || "Not assigned"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <MiniStat icon={<Trophy size={14} />} label="Score" value={submission.totalScore || 0} />
                <MiniStat icon={<FileText size={14} />} label="Accuracy" value={`${submission.accuracy || 0}%`} />
                <MiniStat icon={<Clock size={14} />} label="Time" value={`${submission.timeTakenSeconds || 0}s`} />
                <MiniStat icon={<Clock size={14} />} label="Attempt" value={submission.attemptsUsed || 1} />
              </div>
            </div>

            <div className="space-y-4">
              {(submission.answers || []).filter((answer: any) => answer.kind === "written_answer").map((answer: any, answerIndex: number) => (
                <div key={`${answer.activityId || "written"}-${answer.itemId || answerIndex}`} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <div className="font-semibold text-slate-950">Written answer {answerIndex + 1}</div>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-amber-700">Needs review</span>
                  </div>
                  {answer.question && <div className="mb-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800">{answer.question}</div>}
                  <div className="rounded-lg bg-white px-3 py-3 text-sm">
                    <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Student answer</div>
                    <div className="whitespace-pre-wrap text-slate-900">{answer.textAnswer || "Not answered"}</div>
                  </div>
                  {answer.expectedAnswer && (
                    <div className="mt-3 rounded-lg bg-white/70 px-3 py-3 text-sm text-slate-700">
                      <b>Model answer:</b> {answer.expectedAnswer}
                    </div>
                  )}
                </div>
              ))}
              {Object.entries(submission.activityResults || {}).map(([resultKey, resultValue]: [string, any]) => (
                <div key={resultKey} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-950">{resultKey}</div>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${resultValue?.solved ? "bg-emerald-50 text-emerald-700" : resultValue?.skipped ? "bg-amber-50 text-amber-700" : "bg-slate-200 text-slate-700"}`}>
                      {resultValue?.solved ? "Solved" : resultValue?.skipped ? "Skipped" : "Incomplete"}
                    </span>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>Mistakes {resultValue?.mistakes || 0}</span>
                    <span>Hints {resultValue?.hintsUsed || 0}</span>
                    <span>Time {resultValue?.timeTakenSeconds || 0}s</span>
                  </div>
                  <MoveTraceList history={resultValue?.moveHistory || []} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function MoveTraceList({ history }: { history: TraceEntry[] }) {
  if (!history.length) {
    return <div className="rounded-lg bg-white px-3 py-4 text-sm text-slate-500">No move history stored for this attempt.</div>;
  }
  return (
    <div className="space-y-2">
      {history.map((entry, index) => (
        <div key={`${entry.by}-${index}`} className="rounded-lg bg-white px-3 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{entry.moveNumber}</span>
            <span className="font-semibold text-slate-900">{entry.san || entry.note || "Action"}</span>
            <span className="text-xs uppercase tracking-wide text-slate-400">{entry.by}</span>
            {entry.from && entry.to && <span className="text-xs text-slate-500">{entry.from} to {entry.to}</span>}
            {entry.note && entry.san && <span className="text-xs text-slate-500">{entry.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{icon}{label}</div>
      <div className="mt-1 text-lg font-black text-brand">{value}</div>
    </div>
  );
}
