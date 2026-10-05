import { describe, expect, it } from "vitest";
import { blogHref, blogPosts, getBlogPost, postWordCount } from "@/lib/blog";
import { parsePlacement, squareCoords } from "@/lib/blog/fen";
import { inlineHrefs } from "@/lib/blog/inline";
import type { Block, BlogPost } from "@/lib/blog/types";
import { publicAchievementList, seededAchievements, studentSlug } from "@/lib/achievementData";
import { centreHref, centreHub, kolkataCentres } from "@/lib/centrePages";
import { courseHub, coursePages } from "@/lib/coursePages";

/**
 * The guard rail for the blog.
 *
 * A post is data, so everything that would make it bad for readers or for
 * search can be checked before it ships: a link to a page that does not exist,
 * a heading outline that skips a level, a diagram with an impossible position
 * or no alt text, a title Google will truncate. Add a post and `npm test` reads
 * it end to end.
 */

const STATIC_ROUTES = [
  "/",
  "/register",
  "/contact-us",
  "/success-stories",
  "/blog",
  "/online-chess-classes-for-kids",
  "/privacy",
  "/terms",
  "/refund-policy",
];

/** Phrases a landing page owns. A post that chased one would compete with it. */
const LANDING_PAGE_PHRASES = ["online chess classes for kids", "chess classes for kids", "best chess coaching in india"];

const knownRoutes = new Set<string>([
  ...STATIC_ROUTES,
  `/${courseHub.slug}`,
  ...coursePages.map((page) => `/${page.slug}`),
  `/${centreHub.slug}`,
  ...kolkataCentres.map((centre) => centreHref(centre.slug)),
  ...blogPosts.map((post) => blogHref(post.slug)),
  // Story pages are built from the database in production; the seed is the
  // set every environment is guaranteed to have.
  ...publicAchievementList(seededAchievements).map((item) => `/success-stories/${studentSlug(item.studentName)}`),
]);

function blockHrefs(block: Block): string[] {
  switch (block.type) {
    case "p":
      return inlineHrefs(block.text);
    case "ul":
    case "ol":
      return block.items.flatMap(inlineHrefs);
    case "callout":
      return inlineHrefs(block.text);
    case "table":
      return block.rows.flat().flatMap(inlineHrefs);
    case "cta":
      return [block.href];
    default:
      return [];
  }
}

const internalHrefs = (post: BlogPost) =>
  post.body.flatMap(blockHrefs).filter((href) => href.startsWith("/"));

describe.each(blogPosts.map((post) => [post.slug, post] as const))("blog post %s", (_slug, post) => {
  it("has a slug that is lowercase words joined by hyphens", () => {
    expect(post.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("has a title Google will not truncate, branded like the rest of the site", () => {
    expect(post.title.length).toBeGreaterThanOrEqual(30);
    expect(post.title.length).toBeLessThanOrEqual(65);
    expect(post.title).toMatch(/\| Envision$/);
  });

  it("has a meta description of 120-165 characters", () => {
    expect(post.description.length).toBeGreaterThanOrEqual(120);
    expect(post.description.length).toBeLessThanOrEqual(165);
  });

  it("names its target phrase in the title, H1 or description", () => {
    const words = post.keyword.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
    const haystack = `${post.title} ${post.h1} ${post.description}`.toLowerCase();
    const found = words.filter((word) => haystack.includes(word.replace(/s$/, "")));
    expect(found.length / words.length).toBeGreaterThanOrEqual(0.6);
  });

  it("opens with a direct answer before the first heading", () => {
    expect(post.body[0]?.type).toBe("p");
  });

  it("has a valid heading outline: H2s first, unique ids, no H1 in the body", () => {
    let seenH2 = false;
    const ids = new Set<string>();
    for (const block of post.body) {
      expect(block.type).not.toBe("h1");
      if (block.type === "h2") seenH2 = true;
      if (block.type === "h3") expect(seenH2, `H3 "${block.text}" comes before any H2`).toBe(true);
      if (block.type === "h2" || block.type === "h3") {
        expect(block.id).toMatch(/^[a-z0-9-]+$/);
        expect(ids.has(block.id), `duplicate heading id "${block.id}"`).toBe(false);
        // "faq" is the id of the FAQ section the page appends.
        expect(block.id).not.toBe("faq");
        ids.add(block.id);
      }
    }
    expect([...post.body].filter((block) => block.type === "h2").length).toBeGreaterThanOrEqual(4);
  });

  it("links only to pages that exist", () => {
    for (const href of post.body.flatMap(blockHrefs)) {
      if (/^https:\/\//.test(href)) continue;
      expect(knownRoutes.has(href.split("#")[0]), `${href} is not a public route`).toBe(true);
    }
  });

  it("links into the rest of the site with at least three contextual links and the demo form", () => {
    const hrefs = internalHrefs(post);
    expect(new Set(hrefs.filter((href) => href !== "/register")).size).toBeGreaterThanOrEqual(3);
    expect(hrefs).toContain("/register");
    expect(hrefs).not.toContain(blogHref(post.slug));
  });

  it("uses descriptive anchor text, never 'click here'", () => {
    const text = JSON.stringify(post.body).toLowerCase();
    expect(text).not.toMatch(/\[(click here|here|read more|this)\]/);
  });

  it("relates only to courses and posts that exist", () => {
    expect(post.relatedCourses.length).toBeGreaterThan(0);
    for (const slug of post.relatedCourses) expect(coursePages.some((page) => page.slug === slug), slug).toBe(true);
    expect(post.relatedPosts.length).toBeGreaterThanOrEqual(2);
    for (const slug of post.relatedPosts) {
      expect(slug).not.toBe(post.slug);
      expect(getBlogPost(slug), slug).toBeDefined();
    }
  });

  it("has diagrams with legal positions, real squares and alt text", () => {
    for (const block of post.body) {
      if (block.type !== "diagram") continue;
      expect(() => parsePlacement(block.fen)).not.toThrow();
      for (const square of [...(block.highlight ?? []), ...(block.dots ?? [])]) expect(squareCoords(square), square).not.toBeNull();
      for (const arrow of block.arrows ?? []) {
        expect(arrow).toMatch(/^[a-h][1-8][a-h][1-8]$/);
      }
      expect(block.alt.length).toBeGreaterThanOrEqual(40);
      expect(block.alt).not.toBe(block.caption);
      expect(block.caption.length).toBeGreaterThan(0);
    }
  });

  it("has dates in order and FAQs for the FAQ schema", () => {
    expect(post.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(post.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(post.updatedAt >= post.publishedAt).toBe(true);
    expect(post.faqs.length).toBeGreaterThanOrEqual(3);
  });

  it("is long enough to answer the query properly", () => {
    expect(postWordCount(post)).toBeGreaterThanOrEqual(1000);
  });
});

describe("the blog as a whole", () => {
  it("has unique slugs, titles and target phrases", () => {
    for (const field of ["slug", "title", "keyword", "h1"] as const) {
      const values = blogPosts.map((post) => post[field].toLowerCase());
      expect(new Set(values).size, field).toBe(values.length);
    }
  });

  it("does not compete with a course or centre page for its phrase", () => {
    const pagePhrases = [
      ...LANDING_PAGE_PHRASES,
      courseHub.keyword,
      ...coursePages.map((page) => page.keyword),
      ...kolkataCentres.map((centre) => centre.keyword),
    ].map((phrase) => phrase.toLowerCase());
    for (const post of blogPosts) expect(pagePhrases).not.toContain(post.keyword.toLowerCase());
  });

  it("is linked to from at least one other post", () => {
    const linked = new Set(blogPosts.flatMap((post) => [...internalHrefs(post), ...post.relatedPosts.map(blogHref)]));
    for (const post of blogPosts) expect(linked.has(blogHref(post.slug)), post.slug).toBe(true);
  });
});
