import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Homework, Submission } from "@/models/Homework";
import { User } from "@/models/User";
import { getCoachAssignedStudentIds } from "@/lib/coachStudentAccess";
import { ChevronLeft, Clock, FileText, Trophy, User2 } from "lucide-react";
import HomeworkReviewBoard from "@/components/homework/HomeworkReviewBoard";
import HomeworkComputerReviewBoard from "@/components/homework/HomeworkComputerReviewBoard";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function answerKey(activityId: string, itemId: string) {
  return `${activityId}:${itemId}`;
}

function boardReviewItems(homework: any, submission: any) {
  const results = submission.activityResults || {};
  const items: any[] = [];
  for (const activity of homework.activities || []) {
    const isPgnHomework = activity.type === "study_pgn" && activity.source?.kind === "pgn_quiz";
    if (!isPgnHomework) continue;
    for (const item of activity.items || []) {
      const key = answerKey(objectId(activity._id), String(item.id || ""));
      items.push({
        key,
        activityTitle: activity.title || "PGN Homework",
        item,
        result: results[key] || {},
      });
    }
  }
  return items;
}

function computerReviewItems(homework: any, submission: any) {
  const results = submission.activityResults || {};
  const items: any[] = [];
  for (const activity of homework.activities || []) {
    if (activity.type !== "play_computer") continue;
    const key = answerKey(objectId(activity._id), "play_computer");
    items.push({
      key,
      activity,
      result: results[key] || {},
    });
  }
  return items;
}

export default async function HomeworkReviewPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!session || (role !== "instructor" && role !== "admin" && role !== "sub-admin")) {
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
              {boardReviewItems(homework, submission).map(({ key, activityTitle, item, result }) => (
                <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-950">{item.title || item.pgnTitle || "Board question"}</div>
                      <div className="text-xs text-slate-500">{activityTitle}</div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${result?.solved ? "bg-emerald-50 text-emerald-700" : result?.skipped ? "bg-amber-50 text-amber-700" : "bg-slate-200 text-slate-700"}`}>
                      {result?.solved ? "Solved" : result?.skipped ? "Skipped" : "Incomplete"}
                    </span>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>Mistakes {result?.mistakes || 0}</span>
                    <span>Hints {result?.hintsUsed || 0}</span>
                    <span>Time {result?.timeTakenSeconds || 0}s</span>
                  </div>
                  <HomeworkReviewBoard item={item} result={result} />
                </div>
              ))}
              {computerReviewItems(homework, submission).map(({ key, activity, result }) => (
                <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-950">{activity.title || "Play vs Computer"}</div>
                      <div className="text-xs text-slate-500">{activity.computer?.strength || "Computer game"} - color {activity.computer?.side || "white"}</div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${result?.solved ? "bg-emerald-50 text-emerald-700" : result?.failed ? "bg-red-50 text-red-700" : "bg-slate-200 text-slate-700"}`}>
                      {result?.solved ? "Won" : result?.failed ? "0 points" : "Incomplete"}
                    </span>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    {!result?.solved && <span>Wrong attempts {result?.mistakes || 0}</span>}
                    <span>Outcome {result?.outcome ? String(result.outcome).replaceAll("_", " ") : "Not recorded"}</span>
                    <span>Time {result?.timeTakenSeconds || 0}s</span>
                  </div>
                  <HomeworkComputerReviewBoard activity={activity} result={result} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
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
