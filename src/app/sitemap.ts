import type { MetadataRoute } from "next";
import { publicAchievementList, studentSlug } from "@/lib/achievementData";
import { getLandingAchievements } from "@/lib/achievements";
import { centreHref, centreHub, kolkataCentres } from "@/lib/centrePages";
import { courseHub, coursePages } from "@/lib/coursePages";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

/**
 * The public sitemap.
 *
 * Only pages a search engine should land on: the marketing home, the course
 * ladder, the success stories and the legal pages. Everything behind a login -
 * the whole portal - is excluded here and disallowed in `robots.ts`, so the two
 * files agree.
 *
 * Course URLs are derived from `coursePages`, so a new tier is listed the moment
 * its page exists rather than needing a second edit here.
 */

export const revalidate = 86400;

const url = (path: string) => `${MARKETING_BASE_URL}${path}`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const core: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    // The demo form is where every call to action lands, so it is worth indexing.
    { url: url("/register"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: url("/success-stories"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: url("/contact-us"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];

  const courses: MetadataRoute.Sitemap = [
    { url: url(`/${courseHub.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.9 },
    ...coursePages.map((page) => ({
      url: url(`/${page.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  // The offline side of the site: the Kolkata hub and one page per centre,
  // derived from the same list the pages are built from so the sitemap cannot
  // advertise a centre that does not resolve.
  const centres: MetadataRoute.Sitemap = [
    { url: url(`/${centreHub.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.9 },
    ...kolkataCentres.map((centre) => ({
      url: url(centreHref(centre.slug)),
      lastModified: now,
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
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const legal: MetadataRoute.Sitemap = ["/privacy", "/terms", "/refund-policy"].map((path) => ({
    url: url(path),
    lastModified: now,
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  return [...core, ...courses, ...centres, ...stories, ...legal];
}
