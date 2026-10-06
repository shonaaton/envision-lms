import type { Metadata } from "next";
import Link from "next/link";
import RegisterForm from "./RegisterForm";
import { blogHref } from "@/lib/blog";
import { courseHub } from "@/lib/coursePages";
import { breadcrumbSchema, faqSchema, publicMetadata } from "@/lib/seo";

/**
 * The demo form is a client component, so it cannot carry its own metadata.
 * This server wrapper exists to give it some: every call to action on the site
 * lands here and the sitemap lists it, but it was inheriting the root layout's
 * title with no description and no canonical - the generic portal blurb about
 * homework and PGN libraries, on the page a parent reaches from an ad.
 */
export const metadata: Metadata = publicMetadata({
  path: "/register",
  title: "Book a Free Demo Chess Class | Envision Chess Academy",
  description:
    "Book a free demo chess class online with a FIDE-rated coach. We assess your child's level, explain the course ladder and answer your questions - no payment needed.",
  socialDescription: "Book a free one-to-one chess demo class with a FIDE-rated coach at Envision Chess Academy.",
  keywords: ["free demo chess class", "book chess demo class", "free chess class online for kids", "chess assessment class"],
  imageAlt: "Envision Chess Academy student - book a free demo chess class",
});

const demoSteps = [
  {
    title: "Book a slot",
    detail: "Fill in the form above with your child's details and pick a time. Online demos run for families anywhere in India and abroad; offline demos run at our Kolkata centres.",
  },
  {
    title: "Meet the coach",
    detail: "A coach plays through a few positions with your child, asks what they already know, and watches how they think - whether they have never touched a chessboard or already play tournaments.",
  },
  {
    title: "Get a level recommendation",
    detail: "The demo ends with a clear answer: which stage of the course ladder fits, and the exact session to start from, so a child is never made to repeat what they already know.",
  },
  {
    title: "Decide in your own time",
    detail: "We explain group and one-to-one classes, the class rhythm and the fees. There is no payment for the demo and no obligation to join.",
  },
];

/**
 * Also the page's FAQPage schema. Every answer has to stay true of how demos
 * actually run - the same facts the home and course FAQs state.
 */
const demoFaqs = [
  {
    q: "Is the demo chess class really free?",
    a: "Yes. The demo class is free, there is no payment step, and there is no obligation to enrol afterwards.",
  },
  {
    q: "Does my child need to know how to play chess?",
    a: "No. Complete beginners are welcome - the coach simply starts from the board and the pieces. Children who already play are assessed so they can start at the right point in the syllabus.",
  },
  {
    q: "Is the demo class online or offline?",
    a: "Both are available. Online demos take place in the academy's live classroom, so a laptop or tablet with a stable connection is all you need. Offline demos take place at our Kolkata centres.",
  },
  {
    q: "What happens after the demo?",
    a: "You receive a level recommendation and the session your child would start from. If you decide to join, your child is placed in a suitable group batch or one-to-one coaching on the same syllabus.",
  },
];

const schema = [
  breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Book a Free Demo Chess Class", path: "/register" },
  ]),
  faqSchema(demoFaqs),
];

/**
 * The form fills the first screen, so the explanation sits below it. It is what
 * makes this a page a search engine can rank for "free demo chess class" rather
 * than a bare form with 150 words on it, and it answers the questions that stop
 * a parent from pressing submit.
 */
export default function RegisterPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <RegisterForm />
      <section aria-labelledby="demo-class" className="bg-[#12031a] px-4 pb-16 pt-12 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 id="demo-class" className="text-2xl font-black leading-tight sm:text-3xl">What happens in a free demo chess class?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/75">
            The demo is a real assessment class with an Envision coach, not a sales call. It shows you how our live classes work and tells you exactly
            where your child would start on the{" "}
            <Link href={`/${courseHub.slug}`} className="font-bold text-accent underline underline-offset-2">
              online chess coaching course ladder
            </Link>
            .
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {demoSteps.map((step, index) => (
              <li key={step.title} className="rounded-xl border border-white/10 bg-white/[0.06] p-5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-sm font-black text-brand-900">{index + 1}</span>
                <h3 className="mt-3 text-base font-black">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/70">{step.detail}</p>
              </li>
            ))}
          </ol>

          <h2 className="mt-14 text-2xl font-black leading-tight sm:text-3xl">Questions parents ask before booking</h2>
          <div className="mt-6 grid gap-3">
            {demoFaqs.map((faq) => (
              <div key={faq.q} className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
                <h3 className="text-base font-black">{faq.q}</h3>
                <p className="mt-2 text-sm leading-6 text-white/70">{faq.a}</p>
              </div>
            ))}
          </div>

          <p className="mt-10 text-sm leading-7 text-white/70">
            Want to know more first? Read{" "}
            <Link href="/online-chess-classes-for-kids" className="font-bold text-accent underline underline-offset-2">
              online chess classes for kids
            </Link>
            , our guide to{" "}
            <Link href={blogHref("how-online-chess-classes-work")} className="font-bold text-accent underline underline-offset-2">
              how online chess classes work
            </Link>
            , or see{" "}
            <Link href="/success-stories" className="font-bold text-accent underline underline-offset-2">
              what our students have achieved
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
