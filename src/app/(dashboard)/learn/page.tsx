import Link from "next/link";
import { BookOpenCheck, ChevronRight, Sparkles, Star, Target } from "lucide-react";
import { auth } from "@/lib/auth";
import { getLearningCatalog } from "@/lib/learning/service";
import { EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";

export const dynamic = "force-dynamic";

function SectionCard({ section }: { section: Awaited<ReturnType<typeof getLearningCatalog>>["sections"][number] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-brand/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-brand">{section.title}</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">{section.completedExercises} / {section.totalExercises} completed</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{section.description}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <div className="font-semibold">{section.earnedStars} / {section.totalStars} stars</div>
          <div className="mt-1 text-xs text-slate-500">{section.progressPercent}% progress</div>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${section.title} progress`}>
        <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${section.progressPercent}%` }} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {section.lessons.map((lesson) => (
          <Link
            key={lesson.slug}
            href={lesson.isLocked ? "#" : `/learn/${lesson.slug}`}
            aria-disabled={lesson.isLocked}
            className={`group rounded-2xl border p-4 transition ${
              lesson.isLocked
                ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md hover:shadow-brand/10"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-950">{lesson.title}</div>
                <p className={`mt-1 text-xs leading-5 ${lesson.isLocked ? "text-slate-400" : "text-slate-500"}`}>{lesson.description}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${lesson.isComplete ? "bg-emerald-50 text-emerald-700" : lesson.isLocked ? "bg-slate-200 text-slate-500" : "bg-brand-50 text-brand"}`}>
                {lesson.isComplete ? "Complete" : lesson.isLocked ? "Locked" : "Continue"}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs">
              <span className={lesson.isLocked ? "text-slate-400" : "text-slate-500"}>
                {lesson.completedExercises} / {lesson.totalExercises} exercises
              </span>
              <span className={lesson.isLocked ? "text-slate-400" : "text-slate-700"}>{lesson.earnedStars} stars</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function LearnChessPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const catalog = await getLearningCatalog(userId);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Learn Chess"
        title="Build chess skills step by step"
        subtitle="Progress through native LMS lessons that teach movement, decision-making, king safety, and special moves through a reusable learning curriculum."
        icon={BookOpenCheck as any}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Overall Progress" value={`${catalog.totals.overallProgressPercent}%`} note={`${catalog.totals.completedExercises} / ${catalog.totals.totalExercises} exercises completed`} icon={Target as any} tone="purple" />
          <StatCard label="Stars Earned" value={catalog.totals.earnedStars} note={`${catalog.totals.totalStars} stars available`} icon={Star as any} tone="amber" />
          <StatCard
            label="Continue Learning"
            value={catalog.continueLesson?.lessonTitle || "Start your first lesson"}
            note={
              catalog.continueLesson
                ? `${catalog.continueLesson.completedExercises} / ${catalog.continueLesson.totalExercises} completed`
                : "Begin with the first unlocked lesson"
            }
            icon={Sparkles as any}
            tone="green"
          />
        </div>
      </PageHeader>

      {catalog.continueLesson ? (
        <Link
          href={`/learn/${catalog.continueLesson.lessonSlug}`}
          className="group flex items-center justify-between rounded-2xl border border-brand/15 bg-brand px-5 py-4 text-white shadow-lg shadow-brand-900/15 transition hover:bg-brand-700"
        >
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-accent">{catalog.continueLesson.sectionTitle}</div>
            <div className="mt-1 text-lg font-black">Continue {catalog.continueLesson.lessonTitle}</div>
          </div>
          <ChevronRight size={20} aria-hidden="true" className="transition group-hover:translate-x-0.5" />
        </Link>
      ) : null}

      {catalog.sections.length === 0 ? (
        <EmptyState title="Learning content is being prepared." description="The Learn Chess curriculum will appear here as soon as it is ready." />
      ) : (
        <div className="space-y-4">
          {catalog.sections.map((section) => (
            <SectionCard key={section.slug} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}
