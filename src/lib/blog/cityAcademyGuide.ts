import type { Block, BlogPost } from "@/lib/blog/types";
import { centreHub, kolkataCentres } from "@/lib/centrePages";
import { cityHref, getCityPage } from "@/lib/cityPages";

/**
 * "Top chess academies in <city>" guides for the cities where Envision teaches
 * online only.
 *
 * Every guide lists Envision first, as the live online option, and says in its
 * first lines that Envision has no centre in that city - the honest version of
 * what competing listicles do without saying so. The other academies are
 * described only with facts found in public sources (their own sites, listing
 * sites, Wikipedia, ChessBase India) in October 2026, and each entry's text
 * names its source. No rankings of other academies, no criticism, no invented
 * addresses.
 *
 * The parts that would otherwise be copy-pasted seven times - the Envision
 * section, the criteria, the comparison table, the links to the other city
 * guides - are generated here, so a change to the course or the centres reaches
 * every guide. What makes each guide its own page is passed in: the opening
 * answer, the academies, and the local advice.
 */

export type AcademyEntry = {
  name: string;
  /** Neighbourhood or "Online". */
  area: string;
  format: string;
  suits: string;
  /** Inline text; must say where its facts come from. */
  text: string;
};

export type CityAcademyGuideInput = {
  citySlug: string;
  description: string;
  /** The opening answer: names the academies covered. */
  answer: string;
  academies: AcademyEntry[];
  /** City-specific advice for choosing, one paragraph. */
  localAdvice: string;
  extraFaqs: { q: string; a: string }[];
  /** The city's own supporting post, linked from the guide. */
  cityPost: { slug: string; anchor: string };
  priority: number;
};

/** Slugs of every city academy guide, so each guide can link to the others. */
export const CITY_ACADEMY_GUIDE_CITIES = [
  "chess-coaching-in-mumbai",
  "chess-coaching-in-delhi",
  "chess-coaching-in-bangalore",
  "chess-coaching-in-hyderabad",
  "chess-coaching-in-chennai",
  "chess-coaching-in-pune",
  "chess-coaching-in-ahmedabad",
];

/** "chess-coaching-in-mumbai" -> "top-chess-academies-in-mumbai". */
export const academyGuideSlug = (citySlug: string) => citySlug.replace(/^chess-coaching-in-/, "top-chess-academies-in-");

/** The city spelling people search with - "Bangalore", not "Bengaluru". */
const searchName = (citySlug: string) => getCityPage(citySlug).keyword.replace(/^best chess coaching in /, "");

export function cityAcademyGuide(input: CityAcademyGuideInput): BlogPost {
  const city = getCityPage(input.citySlug);
  const name = searchName(input.citySlug);
  const display = city.altName && city.altName !== city.city ? `${city.city} (${city.altName})` : city.city;
  const cityPage = cityHref(city.slug);
  const centreNames = kolkataCentres.map((centre) => centre.name).join(", ");

  const otherGuides = CITY_ACADEMY_GUIDE_CITIES.filter((slug) => slug !== input.citySlug).map(
    (slug) => `[top chess academies in ${searchName(slug)}](/blog/${academyGuideSlug(slug)})`,
  );

  const academyBlocks: Block[] = input.academies.flatMap((academy, index) => [
    { type: "h2" as const, id: `academy-${index + 2}`, text: `${index + 2}. ${academy.name}` },
    { type: "p" as const, text: academy.text },
  ]);

  const body: Block[] = [
    { type: "p", text: input.answer },
    {
      type: "callout",
      title: "Who wrote this, and how",
      text: `This guide is written by Envision Chess Academy, and we list ourselves first - as the online option, because we have no centre in ${city.city}. Details of the other academies come from public sources (their own websites, listing sites, Wikipedia and ChessBase India) as checked in October 2026, and each entry says where its information comes from. We describe every academy by the same criteria rather than ranking them. Timings, fees and programmes change, so confirm directly with any academy before enrolling.`,
    },
    { type: "h2", id: "how-we-compared", text: `How we compared chess academies in ${city.city}` },
    {
      type: "ul",
      items: [
        "**Location and format** - which part of the city, and whether classes are offline, online or both.",
        "**Who it suits** - young beginners, school-age improvers or competitive players.",
        "**Structure** - a defined syllabus and levels rather than open-ended sessions.",
        "**Coaching** - coach credentials and results that can be checked publicly.",
        "**Practice and competition** - homework, tournaments and game review.",
      ],
    },
    { type: "h2", id: "at-a-glance", text: `Chess academies in ${city.city} at a glance` },
    {
      type: "table",
      caption: `Chess academies in ${city.city} compared (details as published, October 2026)`,
      head: ["Academy", "Area", "Format", "Best suited to"],
      rows: [
        [`[Envision Chess Academy](${cityPage})`, `Online, anywhere in ${city.city}`, "Live online (offline in Kolkata)", "Beginners to rated players who want a structured syllabus at home"],
        ...input.academies.map((academy) => [academy.name, academy.area, academy.format, academy.suits]),
      ],
    },
    { type: "h2", id: "envision", text: `1. Envision Chess Academy - live online chess classes for ${city.city}` },
    {
      type: "p",
      text: `Envision Chess Academy teaches families in ${city.city} through **live online classes** - never recordings - on one published syllabus of **240 sessions across five stages**, from the first move to elite competitive play. Children attend two classes a week, get homework a coach reviews and play weekly academy tournaments, all inside one portal that parents can see. Classes are taught in ${city.languages.join(" and ")}, and families join from ${city.areas.slice(0, 4).join(", ")} and across the city. See [online chess classes in ${name}](${cityPage}) for how classes work for ${city.city} families.`,
    },
    { type: "h3", id: "envision-offline", text: "Offline centres in Kolkata" },
    {
      type: "p",
      text: `The same courses run in person at Envision's ${kolkataCentres.length} centres in Kolkata - ${centreNames} - for families in or moving to the city. Students can switch between online and offline classes without starting again, because both follow the same ladder. See the [chess academy in Kolkata](/${centreHub.slug}) page for addresses and batch timings, or our guide to the [top chess academies in Kolkata](/blog/top-chess-academies-in-kolkata).`,
    },
    { type: "h3", id: "envision-strengths", text: "What sets Envision apart" },
    {
      type: "ul",
      items: [
        "**A published syllabus** - every session of the [Beginner Chess Course](/beginner-chess-course) and the rest of the [online chess coaching courses](/online-chess-coaching-courses) is listed in full.",
        "**Placement by assessment** - a free demo class places each child at the right session.",
        "**No commute** - classes continue through traffic, weather and travel.",
        "**Verified results** from students across India and abroad - see our [student success stories](/success-stories).",
      ],
    },
    ...academyBlocks,
    { type: "h2", id: "how-to-choose", text: `How to choose a chess academy in ${city.city}` },
    { type: "p", text: input.localAdvice },
    {
      type: "ol",
      items: [
        "**Decide on the format first** - local offline classes, online classes, or a mix. Our comparison of [online vs offline chess classes](/blog/online-vs-offline-chess-classes) helps.",
        "**Match the academy to your child's level** - beginners and competitive juniors need different things.",
        "**Ask to see the syllabus** and what your child would learn in the next two months.",
        "**Book a trial or demo class** at two or three academies and watch how your child responds.",
        "**Ask how progress is shown** - homework, tournaments and reports.",
      ],
    },
    {
      type: "p",
      text: `Our checklist on [how to choose a chess coach](/blog/how-to-choose-a-chess-coach) covers each point in detail, and parents in ${city.city} may also find [${input.cityPost.anchor}](/blog/${input.cityPost.slug}) useful.`,
    },
    { type: "h2", id: "other-cities", text: "Chess academy guides for other cities" },
    { type: "p", text: `We have written the same kind of guide for other cities: ${otherGuides.join(", ")}, and the [top chess academies in Kolkata](/blog/top-chess-academies-in-kolkata), where Envision also teaches in person.` },
    {
      type: "cta",
      heading: `Try a live online chess class from ${city.city}`,
      text: "Book a free online demo class. A coach assesses your child and recommends the exact session to start from - no travel, no payment and no obligation.",
      href: "/register",
      label: "Book a Free Demo Class",
    },
  ];

  return {
    slug: academyGuideSlug(input.citySlug),
    title: `Top Chess Academies in ${name} (2026 Guide) | Envision`,
    h1: `Top Chess Academies in ${display}: A 2026 Guide for Parents`,
    description: input.description,
    keyword: `top chess academies in ${name}`,
    keywords: [
      `top chess academies in ${name}`,
      `top 10 chess academies in ${name}`,
      `best chess academies in ${name}`,
      `chess academies in ${name} for kids`,
      `chess classes in ${name} comparison`,
    ],
    category: "city-guides",
    excerpt: `A guide to chess academies in ${city.city}: Envision's live online classes first, then the local academies families ask us about - with the areas they serve, their formats and who each one suits.`,
    publishedAt: "2026-10-27",
    updatedAt: "2026-10-27",
    relatedCourses: ["beginner-chess-course", "intermediate-chess-course"],
    relatedCities: [input.citySlug],
    relatedPosts: ["top-chess-academies-in-kolkata", "online-vs-offline-chess-classes", input.cityPost.slug],
    priority: input.priority,
    body,
    faqs: [
      {
        q: `Which are the top chess academies in ${name}?`,
        a: `Options include Envision Chess Academy's live online classes and local academies such as ${input.academies.map((academy) => academy.name).join(", ")}. The best choice depends on your area, your child's age and level, and whether you want online or offline classes.`,
      },
      {
        q: `Does Envision have a chess centre in ${city.city}?`,
        a: `No. Envision teaches families in ${city.city} through live online classes. Its offline centres are in Kolkata - ${centreNames} - and both formats follow the same 240-session syllabus.`,
      },
      ...input.extraFaqs,
      {
        q: `How do I choose between chess academies in ${city.city}?`,
        a: "Start with location and format, then compare the syllabus, coach credentials, batch size, homework and tournaments. Book trial classes at your shortlisted academies and see which one your child is keen to return to.",
      },
    ],
  };
}
