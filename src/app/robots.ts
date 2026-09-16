import type { MetadataRoute } from "next";
import { authPaths, machinePaths, portalPaths } from "@/lib/portalPaths";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

/**
 * Everything behind a login is disallowed, so crawl budget goes to the marketing
 * pages and nothing in the student portal is indexed. The path lists live in
 * `lib/portalPaths` because the tracking gate needs the same answer.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Prefix matching means "/fees" already covers "/fees" and everything
      // under it, so each path is listed once.
      disallow: [...portalPaths, ...machinePaths, ...authPaths],
    },
    sitemap: `${MARKETING_BASE_URL}/sitemap.xml`,
    host: MARKETING_BASE_URL,
  };
}
