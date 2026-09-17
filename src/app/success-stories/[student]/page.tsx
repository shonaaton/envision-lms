import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, Trophy } from "lucide-react";
import { getLandingAchievements } from "@/lib/achievements";
import { publicAchievementList, studentSlug } from "@/lib/achievementData";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import RelatedLinks from "@/components/marketing/RelatedLinks";
import { centreHubLink, contactLink, courseHubLink, courseLinks, demoLink } from "@/lib/internalLinks";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

export const dynamic = "force-dynamic";

const OG_IMAGE_PATH = "/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg";
const storiesUrl = `${MARKETING_BASE_URL}/success-stories`;

/** The one student this URL is about, or nothing if the slug matches nobody. */
async function findStudent(slug: string) {
  const everyone = publicAchievementList(await getLandingAchievements());
  const achievements = everyone.filter((item) => studentSlug(item.studentName) === slug);
  return { everyone, achievements, primary: achievements[0] };
}

/**
 * Every story page used to be indexed under the root layout's title with no
 * description and no canonical, so eighteen distinct pages looked like one.
 * `getLandingAchievements` is request-cached, so this does not cost a second
 * database read.
 */
export async function generateMetadata({ params }: { params: { student: string } }): Promise<Metadata> {
  const { primary } = await findStudent(params.student);
  if (!primary) return { title: "Student profile not found | Envision Chess Academy" };

  const pageUrl = `${storiesUrl}/${params.student}`;
  const title = `${primary.studentName} - Chess Achievements | Envision Chess Academy`;
  const description = primary.shortDescription || `${primary.studentName} achieved ${primary.result} at ${primary.tournamentName}.`;

  return {
    metadataBase: new URL(MARKETING_BASE_URL),
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "Envision Chess Academy",
      type: "profile",
      images: [{ url: primary.achievementImageUrl || OG_IMAGE_PATH, alt: `${primary.studentName} - chess tournament achievement` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [primary.achievementImageUrl || OG_IMAGE_PATH] },
  };
}

export default async function StudentSuccessPage({ params }: { params: { student: string } }) {
  const { everyone, achievements, primary } = await findStudent(params.student);

  /**
   * Other students, for the block at the foot of the page. A story page used to
   * link nowhere but back to the index, which wasted every link pointing at it.
   */
  const otherStudents = Array.from(
    new Map(
      everyone
        .filter((item) => studentSlug(item.studentName) !== params.student)
        .map((item) => [studentSlug(item.studentName), item]),
    ).values(),
  )
    .slice(0, 6)
    .map((item) => ({
      href: `/success-stories/${studentSlug(item.studentName)}`,
      label: item.studentName,
      detail: item.result,
    }));

  if (!primary) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fb] p-6 text-center">
        <div>
          <h1 className="text-3xl font-black text-slate-950">Student profile not found</h1>
          <Link href="/success-stories" className="btn-primary mt-5"><ArrowLeft size={16} /> Back to Success Stories</Link>
        </div>
      </main>
    );
  }

  const pageUrl = `${storiesUrl}/${params.student}`;
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${MARKETING_BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Student Success Stories", item: storiesUrl },
        { "@type": "ListItem", position: 3, name: primary.studentName, item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Person",
      name: primary.studentName,
      description: primary.shortDescription,
      url: pageUrl,
      image: primary.achievementImageUrl,
      // The academy is the thing being vouched for here, so the student is
      // linked back to it rather than described in isolation.
      alumniOf: {
        "@type": "EducationalOrganization",
        name: "Envision Chess Academy",
        url: `${MARKETING_BASE_URL}/`,
      },
      award: achievements.map((item) => `${item.result} - ${item.tournamentName}`),
    },
  ];

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <MarketingHeader demoHref="/register" />
      <section className="bg-[#17051f] px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <Link href="/success-stories" className="inline-flex items-center gap-2 text-sm font-bold text-accent"><ArrowLeft size={16} /> Success Stories</Link>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-accent">Student Profile</p>
            <h1 className="mt-3 text-4xl font-black leading-tight sm:text-6xl">{primary.studentName}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/76">{primary.shortDescription}</p>
          </div>
          <div className="relative aspect-[1.12] overflow-hidden rounded-lg border border-white/12 bg-white/10 shadow-2xl shadow-black/25">
            <Image src={primary.achievementImageUrl} alt={`${primary.studentName} achievement`} fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Info icon={Trophy} label="Result" value={primary.result} />
          <Info icon={MapPin} label="Location" value={primary.tournamentLocation} />
          <Info icon={CalendarDays} label="Year" value={primary.year} />
        </div>
        <h2 className="text-2xl font-black text-slate-950">All achievements for {primary.studentName}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((item) => (
            <article key={`${item.tournamentName}-${item.displayOrder}`} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-brand">{item.achievementLevel}</div>
              <h3 className="mt-2 font-black text-slate-950">{item.tournamentName}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{item.result}</p>
              <p className="mt-3 text-xs text-slate-500">{item.tournamentLocation} · {item.year}</p>
            </article>
          ))}
        </div>
      </section>

      <RelatedLinks
        tone="slate"
        eyebrow="More students"
        heading="Other Envision students and their results"
        intro="Every student here trained on the same published syllabus, online or at one of our Kolkata centres."
        links={otherStudents}
      />

      <RelatedLinks
        tone="slate"
        eyebrow="Train like this"
        heading="The coaching behind these results"
        intro={`${primary.studentName} worked through the Envision ladder: five stages, fifteen levels and 240 taught sessions, with a coach placing the student at the right session rather than at session one.`}
        links={[courseHubLink, ...courseLinks().slice(0, 3), centreHubLink, demoLink, contactLink]}
      />

      <MarketingFooter />
    </main>
  );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <Icon size={18} className="text-brand" />
      <div className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 font-black text-slate-950">{value}</div>
    </div>
  );
}
