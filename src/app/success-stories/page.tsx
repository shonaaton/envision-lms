import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin, Trophy } from "lucide-react";
import { getLandingAchievements } from "@/lib/achievements";
import { publicAchievementList, studentSlug } from "@/lib/achievementData";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import RelatedLinks from "@/components/marketing/RelatedLinks";
import { centreHubLink, centreLinks, contactLink, courseHubLink, courseLinks, demoLink } from "@/lib/internalLinks";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

export const dynamic = "force-dynamic";

const pageUrl = `${MARKETING_BASE_URL}/success-stories`;
const OG_IMAGE_PATH = "/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg";

/**
 * These pages carried no metadata at all, so every one of them was indexed under
 * the root layout's title with no description and no canonical. The breadcrumb
 * schema below is only worth having once the page says what it is.
 */
const title = "Student Success Stories | Envision Chess Academy";
const description =
  "Verified results from Envision Chess Academy students: age-group titles, FIDE ratings, and district, state, national and international tournament wins.";

export const metadata: Metadata = {
  metadataBase: new URL(MARKETING_BASE_URL),
  title,
  description,
  keywords: [
    "Envision Chess Academy students",
    "chess student achievements",
    "chess tournament winners Kolkata",
    "FIDE rated students India",
    "chess academy results",
  ],
  alternates: { canonical: pageUrl },
  openGraph: {
    title,
    description,
    url: pageUrl,
    siteName: "Envision Chess Academy",
    type: "website",
    images: [{ url: OG_IMAGE_PATH, width: 1200, height: 900, alt: "Envision Chess Academy student with a tournament trophy" }],
  },
  twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE_PATH] },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${MARKETING_BASE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Student Success Stories", item: pageUrl },
  ],
};

export default async function SuccessStoriesPage() {
  const achievements = publicAchievementList(await getLandingAchievements());
  const students = Array.from(new Map(achievements.map((item) => [studentSlug(item.studentName), item])).values());

  const schema = [
    breadcrumbSchema,
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Envision Chess Academy student success stories",
      description,
      url: pageUrl,
      numberOfItems: students.length,
      itemListElement: students.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.studentName,
        item: `${MARKETING_BASE_URL}/success-stories/${studentSlug(item.studentName)}`,
      })),
    },
  ];

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <MarketingHeader demoHref="/register" />
      <section className="bg-[#17051f] px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Student Success Stories</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">Verified student journeys from tournament floor to public record.</h1>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8">
        {students.map((item) => (
          <Link key={studentSlug(item.studentName)} href={`/success-stories/${studentSlug(item.studentName)}`} className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-900/10">
            <div className="relative aspect-[1.08] bg-slate-100">
              <Image src={item.achievementImageUrl} alt={`${item.studentName} achievement`} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover transition duration-700 group-hover:scale-105" />
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-black text-brand">
                <Trophy size={13} /> {item.achievementLevel}
              </span>
            </div>
            <div className="p-5">
              <h2 className="text-xl font-black text-slate-950">{item.studentName}</h2>
              <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-700">{item.result}</p>
              <p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><MapPin size={13} /> {item.tournamentLocation}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-black text-brand">View Profile <ArrowRight size={15} /></span>
            </div>
          </Link>
        ))}
      </section>

      <RelatedLinks
        tone="slate"
        eyebrow="How they got there"
        heading="The courses and centres behind these results"
        intro="Every student on this page trained on the same published syllabus - five stages, fifteen levels and 240 taught sessions - either in a live online batch or at one of our four Kolkata centres."
        links={[courseHubLink, ...courseLinks(), centreHubLink, ...centreLinks(), demoLink, contactLink]}
      />

      <MarketingFooter />
    </main>
  );
}
