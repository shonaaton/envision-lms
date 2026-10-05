import type { MetadataRoute } from "next";
import { publicAchievementList, studentSlug } from "@/lib/achievementData";
import { getLandingAchievements } from "@/lib/achievements";
import { centreHref, centreHub, kolkataCentres } from "@/lib/centrePages";
import { courseHub, coursePages } from "@/lib/coursePages";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";
import { BLOG_PATH, blogHref, blogPosts } from "@/lib/blog";

/**
 * The public sitemap.
 *
 * Only pages a search engine should land on: the marketing home, the course
 * ladder, the centres, the blog, the success stories and the legal pages. Everything behind a login -
 * the whole portal - is excluded here and disallowed in `robots.ts`, so the two
 * files agree.
 *
 * Course URLs are derived from `coursePages`, so a new tier is listed the moment
 * its page exists rather than needing a second edit here.
 */

export const revalidate = 86400;

const url = (path: string) => `${MARKETING_BASE_URL}${path}`;

/**
 * When the page copy was last changed. Every entry used to say "now", which
 * told Google every page changed every day - so it learned to ignore the field.
 * Bump this when the marketing pages are edited; blog posts carry their own
 * `updatedAt`, which is the date a crawler should trust for them.
 */
const SITE_CONTENT_UPDATED = new Date("2026-10-05");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {

  const core: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified: SITE_CONTENT_UPDATED, changeFrequency: "weekly", priority: 1 },
    // The demo form is where every call to action lands, so it is worth indexing.
    { url: url("/register"), lastModified: SITE_CONTENT_UPDATED, changeFrequency: "monthly", priority: 0.8 },
    { url: url("/success-stories"), lastModified: SITE_CONTENT_UPDATED, changeFrequency: "weekly", priority: 0.7 },
    { url: url("/contact-us"), lastModified: SITE_CONTENT_UPDATED, changeFrequency: "monthly", priority: 0.7 },
    // The parent-facing page for children's classes. It is kept out of the
    // header nav, so the sitemap and the footer are how it gets found.
    { url: url("/online-chess-classes-for-kids"), lastModified: SITE_CONTENT_UPDATED, changeFrequency: "monthly", priority: 0.9 },
  ];

  const courses: MetadataRoute.Sitemap = [
    { url: url(`/${courseHub.slug}`), lastModified: SITE_CONTENT_UPDATED, changeFrequency: "monthly" as const, priority: 0.9 },
    ...coursePages.map((page) => ({
      url: url(`/${page.slug}`),
      lastModified: SITE_CONTENT_UPDATED,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  // The offline side of the site: the Kolkata hub and one page per centre,
  // derived from the same list the pages are built from so the sitemap cannot
  // advertise a centre that does not resolve.
  const centres: MetadataRoute.Sitemap = [
    { url: url(`/${centreHub.slug}`), lastModified: SITE_CONTENT_UPDATED, changeFrequency: "monthly" as const, priority: 0.9 },
    ...kolkataCentres.map((centre) => ({
      url: url(centreHref(centre.slug)),
      lastModified: SITE_CONTENT_UPDATED,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  // Story pages are generated from the same list the pages themselves read, so
  // the sitemap cannot advertise a story that does not resolve.
  const achievements = publicAchievementList(await getLandingAchievements());
  const storySlugs = [...new Set(achievements.map((item) => studentSlug(item.studentName)).filter(Boolean))];
  const stories: MetadataRoute.Sitemap = storySlugs.map((slug) => ({
    url: url(`/success-stories/${slug}`),
    lastModified: SITE_CONTENT_UPDATED,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const legal: MetadataRoute.Sitemap = ["/privacy", "/terms", "/refund-policy"].map((path) => ({
    url: url(path),
    lastModified: SITE_CONTENT_UPDATED,
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  // The blog. The index changes whenever a post does, so it takes the newest
  // post's date; each post takes its own.
  const newestPost = blogPosts.reduce((latest, post) => (post.updatedAt > latest ? post.updatedAt : latest), "");
  const blog: MetadataRoute.Sitemap = [
    { url: url(BLOG_PATH), lastModified: newestPost ? new Date(newestPost) : SITE_CONTENT_UPDATED, changeFrequency: "weekly", priority: 0.8 },
    ...blogPosts.map((post) => ({
      url: url(blogHref(post.slug)),
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  return [...core, ...courses, ...centres, ...blog, ...stories, ...legal];
}
