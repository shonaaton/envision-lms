import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, CalendarClock, Clock3, Globe2, MapPin } from "lucide-react";
import JobDescription from "@/components/careers/JobDescription";
import ApplyForm, { ApplyNowButton } from "@/components/careers/ApplyForm";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { EMPLOYMENT_TYPES, JOB_DEPARTMENTS, WORK_MODES, labelOf } from "@/lib/careers/careersConfig";
import { getPublicPosting } from "@/lib/careers/careersService";
import { publicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const posting = await getPublicPosting(params.slug).catch(() => null);
  if (!posting) return publicMetadata({ path: `/careers/${params.slug}`, title: "Opening not found | Envision Chess Academy", description: "This opening is not available.", noindex: true });
  return publicMetadata({
    path: `/careers/${posting.slug}`,
    title: `${posting.title} | Careers | Envision Chess Academy`,
    description: posting.summary.slice(0, 160),
    noindex: !posting.accepting,
  });
}

export default async function CareerOpeningPage({ params }: { params: { slug: string } }) {
  const posting = await getPublicPosting(params.slug).catch(() => null);
  if (!posting) notFound();

  return (
    <main className="landing-compact min-h-screen bg-white text-brand-900">
      <MarketingHeader demoHref="/book-free-demo-class" />

      <section className="relative isolate overflow-hidden bg-[#f5edf8]">
        <div className="absolute inset-0 bg-[linear-gradient(118deg,#ffffff_0%,#f5edf8_52%,#e8d4f0_100%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-12">
          <Link href="/careers" className="inline-flex items-center gap-1.5 text-xs font-black text-brand hover:underline">
            <ArrowLeft size={14} /> All openings
          </Link>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-brand-900/55">{labelOf(JOB_DEPARTMENTS, posting.department)}</p>
          <h1 className="mt-1 text-[1.8rem] font-bold leading-[1.1] sm:text-[2.3rem]">{posting.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-brand-900/75 sm:text-base">{posting.summary}</p>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm font-bold text-brand-900/70">
            <span className="inline-flex items-center gap-1.5"><Clock3 size={15} /> {labelOf(EMPLOYMENT_TYPES, posting.employmentType)}</span>
            <span className="inline-flex items-center gap-1.5">
              {posting.workMode === "remote" ? <Globe2 size={15} /> : <MapPin size={15} />} {posting.location || labelOf(WORK_MODES, posting.workMode)}
            </span>
            {posting.payNote ? <span className="inline-flex items-center gap-1.5"><Briefcase size={15} /> {posting.payNote}</span> : null}
            {posting.closesAt && posting.accepting ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock size={15} /> Apply by {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(posting.closesAt))}
              </span>
            ) : null}
          </p>
          {posting.accepting ? (
            <ApplyNowButton className="btn-primary mt-6 inline-flex h-12 px-7">Apply now</ApplyNowButton>
          ) : null}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_minmax(380px,460px)] lg:items-start">
        <div className="min-w-0">
          {posting.description ? <JobDescription text={posting.description} /> : <p className="text-sm text-brand-900/70">{posting.summary}</p>}
          {posting.accepting ? (
            <ApplyNowButton className="btn-primary mt-8 inline-flex h-12 px-7 lg:hidden">Apply for this role</ApplyNowButton>
          ) : null}
        </div>
        <div id="apply" className="lg:sticky lg:top-24">
          {posting.accepting ? (
            <ApplyForm posting={posting} />
          ) : (
            <div className="rounded-2xl border border-brand/10 bg-[#fbf8fc] p-6">
              <h2 className="text-lg font-black">This role is closed</h2>
              <p className="mt-2 text-sm leading-6 text-brand-900/70">We are no longer taking applications for this opening. See what else is open on our careers page.</p>
              <Link href="/careers" className="btn-primary mt-4 inline-flex">See open roles</Link>
            </div>
          )}
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
