import { describe, expect, it } from "vitest";
import { blogHref, blogPosts } from "@/lib/blog";
import { inlineHrefs, plainText } from "@/lib/blog/inline";
import { centreHub } from "@/lib/centrePages";
import { cityFaqs, cityHref, cityPages, type CityPageConfig } from "@/lib/cityPages";
import { courseHub, coursePages } from "@/lib/coursePages";

/**
 * The guard rail for the city pages.
 *
 * City pages are the one kind of page Google actively penalises when done
 * lazily: a set of copies with the city name swapped is a "doorway page"
 * pattern. So beyond the usual title and description checks, this measures how
 * much of each page's own copy it shares with every other city page, and fails
 * if two of them drift towards being the same page. It also refuses copy that
 * claims a centre, branch or office in a city where the academy has none.
 */

const knownRoutes = new Set([
  "/",
  "/register",
  "/contact-us",
  "/success-stories",
  "/online-chess-classes-for-kids",
  `/${courseHub.slug}`,
  `/${centreHub.slug}`,
  ...coursePages.map((page) => `/${page.slug}`),
  ...cityPages.map((page) => cityHref(page.slug)),
  ...blogPosts.map((post) => blogHref(post.slug)),
]);

/** The copy that belongs to one city alone: everything except the shared template. */
function ownCopy(config: CityPageConfig) {
  return [
    ...config.intro,
    config.supportingHeading,
    config.scene.heading,
    ...config.scene.paragraphs,
    ...config.reasons.flatMap((reason) => [reason.title, reason.detail]),
    ...config.faqs.flatMap((faq) => [faq.q, faq.a]),
  ]
    .map(plainText)
    .join(" ");
}

function shingles(text: string, size = 4) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let index = 0; index + size <= words.length; index += 1) out.add(words.slice(index, index + size).join(" "));
  return out;
}

function overlap(a: Set<string>, b: Set<string>) {
  let shared = 0;
  a.forEach((item) => {
    if (b.has(item)) shared += 1;
  });
  return shared / Math.min(a.size, b.size);
}

describe.each(cityPages.map((page) => [page.city, page] as const))("city page %s", (_city, page) => {
  const names = [page.city, page.altName].filter(Boolean) as string[];
  const mentions = (text: string) => names.some((name) => text.includes(name));

  it("has a slug, title and description built around the city", () => {
    expect(page.slug).toMatch(/^chess-coaching-in-[a-z]+$/);
    expect(page.title.length).toBeLessThanOrEqual(65);
    expect(page.title).toMatch(/\| Envision$/);
    expect(mentions(page.title)).toBe(true);
    expect(page.description.length).toBeGreaterThanOrEqual(120);
    expect(page.description.length).toBeLessThanOrEqual(165);
    expect(mentions(page.description)).toBe(true);
    expect(mentions(page.keyword)).toBe(true);
    expect(page.keywords[0]).toBe(page.keyword);
  });

  it("has enough city-specific substance to stand on its own", () => {
    expect(page.intro.length).toBeGreaterThanOrEqual(2);
    expect(page.scene.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(page.reasons.length).toBe(3);
    expect(new Set(page.areas).size).toBeGreaterThanOrEqual(8);
    expect(page.faqs.length).toBeGreaterThanOrEqual(2);
    expect(ownCopy(page).split(/\s+/).length).toBeGreaterThanOrEqual(450);
  });

  it("never claims premises the academy does not have", () => {
    const copy = `${ownCopy(page)} ${cityFaqs(page).map((faq) => faq.a).join(" ")}`;
    for (const name of names) {
      expect(copy).not.toMatch(new RegExp(`(our|an?|the) (envision )?(centre|center|branch|office|campus) in ${name}`, "i"));
    }
    // The first shared answer says plainly that there is no centre here.
    expect(cityFaqs(page)[0].a).toMatch(/^No\./);
  });

  it("links only to pages that exist", () => {
    const hrefs = [...page.intro, ...page.scene.paragraphs].flatMap(inlineHrefs);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(knownRoutes.has(href), href).toBe(true);
  });
});

describe("the city pages as a set", () => {
  it("leaves Kolkata to the centre hub", () => {
    expect(cityPages.some((page) => /kolkata/i.test(page.city + page.slug))).toBe(false);
  });

  it("has unique slugs, titles, descriptions and target phrases", () => {
    for (const field of ["slug", "title", "description", "keyword", "supportingHeading"] as const) {
      const values = cityPages.map((page) => page[field].toLowerCase());
      expect(new Set(values).size, field).toBe(values.length);
    }
  });

  it("does not let any two cities become near-copies of each other", () => {
    const sets = cityPages.map((page) => ({ city: page.city, shingles: shingles(ownCopy(page)) }));
    for (let i = 0; i < sets.length; i += 1) {
      for (let j = i + 1; j < sets.length; j += 1) {
        const shared = overlap(sets[i].shingles, sets[j].shingles);
        expect(shared, `${sets[i].city} and ${sets[j].city} share ${(shared * 100).toFixed(0)}% of their own copy`).toBeLessThan(0.25);
      }
    }
  });
});
