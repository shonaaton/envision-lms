import type { MetadataRoute } from "next";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

/**
 * Everything behind a login is disallowed, so crawl budget goes to the marketing
 * pages and nothing in the student portal is indexed. The list mirrors the route
 * folders in `app/(dashboard)` plus the auth and machine endpoints.
 */
const portalPaths = [
  "/admin",
  "/analysis",
  "/ask-coach",
  "/attendance",
  "/availability",
  "/booking",
  "/calendar",
  "/chess-profile",
  "/classrooms",
  "/coach-pay",
  "/dashboard",
  "/demo-feedback",
  "/demo-preview",
  "/fees",
  "/homework",
  "/instructor",
  "/invoices",
  "/king-hunt",
  "/leaderboard",
  "/learn",
  "/pgn",
  "/play",
  "/profile",
  "/sales",
  "/square-trainer",
  "/tactics-trainer",
  "/tournaments",
];

const machinePaths = ["/api/", "/v1/", "/fishnet", "/health", "/tournament-join"];

// Sign-in surfaces: /register is deliberately absent, it is a public landing page.
const authPaths = ["/login", "/forgot-password", "/reset-password"];

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
