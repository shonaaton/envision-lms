import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, ChevronLeft, GraduationCap, Star, Target, TrendingDown, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";
import { getLearningAnalytics } from "@/lib/learning/adminService";

export const dynamic = "force-dynamic";

function Bar({ value, tone = "brand" }: { value: number; tone?: "brand" | "rose" | "emerald" }) {
  const colour = tone === "rose" ? "bg-rose-500" : tone === "emerald" ? "bg-emerald-500" : "bg-brand";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${colour}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export default async function LearnAnalyticsPage() {
  const session = await auth();
  const user = session?.user as any;
  if (!user) notFound();
  const allowed = (await isSuperAdminSession(user)) || (await canAccessFeature("learnChess", user, "manage"));
  if (!allowed) notFound();

  const analytics = await getLearningAnalytics();
  const { totals } = analytics;
  const starTotal = analytics.starDistribution.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/learn"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition hover:border-brand/30 hover:bg-brand-50 hover:text-brand"
        >
          <ChevronLeft size={16} /> Curriculum authoring
        </Link>
      </div>

      <PageHeader
        eyebrow="Learn Chess"
        title="Learning analytics"
        subtitle="Where students are getting stuck, measured from their own attempts."
        icon={BarChart3}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Students started" value={totals.studentsStarted} icon={Users} tone="purple" />
          <StatCard label="Finished the course" value={totals.studentsCompletedAll} icon={GraduationCap} tone="green" />
          <StatCard
            label="Exercises solved"
            value={totals.completions}
            note={`${totals.attempts} attempts in total`}
            icon={Target}
            tone="blue"
          />
          <StatCard
            label="Average stars"
            value={totals.averageStars || "-"}
            note={`${totals.publishedExercises} published exercises`}
            icon={Star}
            tone="amber"
          />
        </div>
      </PageHeader>

      {totals.attempts === 0 ? (
        <EmptyState
          title="No attempts yet."
          description="Numbers appear here as soon as students start working through the lessons."
        />
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Star distribution</h2>
            <div className="mt-3 space-y-3">
              {analytics.starDistribution
                .slice()
                .reverse()
                .map((row) => (
                  <div key={row.stars} className="grid grid-cols-[70px_minmax(0,1fr)_60px] items-center gap-3">
                    <span className="text-sm font-bold text-amber-500">{"★".repeat(row.stars)}</span>
                    <Bar value={starTotal ? (row.count / starTotal) * 100 : 0} tone="emerald" />
                    <span className="text-right text-sm font-bold text-slate-700">{row.count}</span>
                  </div>
                ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Three stars means no wrong moves, no hints and no restarts. A low three-star share usually means an exercise is
              harder than its level says.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Completion by lesson</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">
                    <th className="py-2 pr-3">Lesson</th>
                    <th className="py-2 pr-3">Students</th>
                    <th className="py-2 pr-3">Solved</th>
                    <th className="py-2 pr-3 w-[180px]">Completion</th>
                    <th className="py-2 pr-3">Avg stars</th>
                    <th className="py-2">Avg wrong moves</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.lessons.map((lesson) => (
                    <tr key={lesson.lessonId} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="font-bold text-slate-900">{lesson.lessonName}</div>
                        <div className="text-[11px] font-semibold text-slate-500">
                          {lesson.sectionName} - {lesson.exercises} exercises
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700">{lesson.students}</td>
                      <td className="py-2.5 pr-3 text-slate-700">{lesson.completions}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <Bar value={lesson.completionRate} tone={lesson.completionRate < 50 ? "rose" : "brand"} />
                          <span className="w-10 text-right text-xs font-bold text-slate-600">{lesson.completionRate}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700">{lesson.averageStars || "-"}</td>
                      <td className="py-2.5 text-slate-700">{lesson.averageIncorrectMoves}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-slate-500">
                <TrendingDown size={16} className="text-rose-500" /> Hardest exercises
              </h2>
              {analytics.hardestExercises.length ? (
                <ul className="mt-3 space-y-2">
                  {analytics.hardestExercises.map((exercise) => (
                    <li key={exercise.exerciseId} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-900">{exercise.title}</div>
                          <div className="text-[11px] font-semibold text-slate-500">
                            {exercise.lessonName} - {exercise.students} students
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${
                            exercise.completionRate < 50 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {exercise.completionRate}%
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
                        {exercise.averageIncorrectMoves} wrong moves and {exercise.averageHints} hints per student on average
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Nothing to rank yet. An exercise appears here once at least three students have tried it.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Recent activity</h2>
              <ul className="mt-3 space-y-1.5">
                {analytics.recentActivity.map((row, index) => (
                  <li key={`${row.studentName}-${row.at}-${index}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 odd:bg-slate-50">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-900">{row.studentName}</div>
                      <div className="truncate text-[11px] font-semibold text-slate-500">
                        {row.lessonName} - {row.exerciseTitle}
                      </div>
                    </div>
                    <span className={`shrink-0 text-xs font-black ${row.completed ? "text-emerald-600" : "text-slate-400"}`}>
                      {row.completed ? "★".repeat(Math.max(1, row.stars)) : "tried"}
                    </span>
                  </li>
                ))}
                {!analytics.recentActivity.length ? <li className="text-sm text-slate-500">No attempts recorded yet.</li> : null}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
