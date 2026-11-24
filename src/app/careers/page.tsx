import Link from "next/link";
import { ArrowRight, Briefcase, Clock3, Globe2, MapPin, Sparkles } from "lucide-react";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { EMPLOYMENT_TYPES, JOB_DEPARTMENTS, WORK_MODES, labelOf } from "@/lib/careers/careersConfig";
import { listPublicPostings, type PostingView } from "@/lib/careers/careersService";
import { publicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = publicMetadata({
  path: "/careers",
  title: "Careers | Join Envision Chess Academy",
  description: "Open roles at Envision Chess Academy: chess coaches, sales and academy team members. See the openings and apply online.",
});

export default async function CareersPage() {
  const postings = await listPublicPostings().catch((error) => {
    console.error("[careers] could not list openings", error);
    return [] as PostingView[];
  });
  const groups = JOB_DEPARTMENTS.map((department) => ({ ...department, postings: postings.filter((posting) => posting.department === department.value) })).filter((group) => group.postings.length);

  return (
    <main className="landing-compact min-h-screen bg-white text-brand-900">
      <MarketingHeader demoHref="/book-free-demo-class" />

      <section className="relative isolate overflow-hidden bg-[#f5edf8]">
        <div className="absolute inset-0 bg-[linear-gradient(118deg,#ffffff_0%,#f5edf8_52%,#e8d4f0_100%)]" />
        <div className="absolute inset-0 opacity-[0.6] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="relative mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
          <nav aria-label="Breadcrumb" className="mb-4 text-xs font-bold text-brand-900/60">
            <Link href="/" className="hover:text-brand">Home</Link>
            <span className="px-1.5">/</span>
            <span className="text-brand">Careers</span>
          </nav>
          <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-900 shadow-sm">
            <Sparkles size={15} /> We&apos;re hiring
          </p>
          <h1 className="mt-4 text-[1.9rem] font-bold leading-[1.08] sm:text-[2.4rem] lg:text-[2.8rem]">Careers at Envision Chess Academy</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-brand-900/75 sm:text-base">
            We teach chess to children and adults online and across our Kolkata centres. Join our coaches, counsellors and academy team, and help
            students learn to think on the board and beyond it.
          </p>
          <p className="mt-3 text-sm font-black text-brand">
            {postings.length ? `${postings.length} open role${postings.length === 1 ? "" : "s"}` : "No open roles right now"}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
        {groups.length ? (
          <div className="space-y-10">
            {groups.map((group) => (
              <div key={group.value}>
                <h2 className="text-xs font-black uppercase tracking-[0.14em] text-brand-900/55">{group.label}</h2>
                <div className="mt-3 grid gap-3">
                  {group.postings.map((posting) => (
                    <Link
                      key={posting.id}
                      href={`/careers/${posting.slug}`}
                      className="group grid gap-3 rounded-2xl border border-brand/10 bg-white p-5 shadow-sm shadow-brand-900/5 transition hover:border-brand/30 hover:shadow-md sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <h3 className="text-lg font-black text-brand-900 group-hover:text-brand">{posting.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-brand-900/70">{posting.summary}</p>
                        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-brand-900/60">
                          <span className="inline-flex items-center gap-1"><Clock3 size={13} /> {labelOf(EMPLOYMENT_TYPES, posting.employmentType)}</span>
                          <span className="inline-flex items-center gap-1">
                            {posting.workMode === "remote" ? <Globe2 size={13} /> : <MapPin size={13} />}
                            {posting.location || labelOf(WORK_MODES, posting.workMode)}
                          </span>
                          {posting.payNote ? <span className="inline-flex items-center gap-1"><Briefcase size={13} /> {posting.payNote}</span> : null}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 justify-self-start rounded-full bg-brand px-4 py-2 text-sm font-black text-white sm:justify-self-end">
                        View &amp; apply <ArrowRight size={15} />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-brand/20 bg-[#fbf8fc] p-8 text-center">
            <Briefcase className="mx-auto text-brand" size={28} />
            <h2 className="mt-3 text-lg font-black">No openings at the moment</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-brand-900/70">
              We post new roles here as soon as they open. If you would like to work with us, check back soon or send us a note.
            </p>
            <Link href="/contact-us" className="mt-4 inline-flex items-center gap-1.5 text-sm font-black text-brand hover:underline">
              Contact us <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </section>

      <MarketingFooter />
    </main>
  );
}
