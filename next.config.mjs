/**
 * The five course pages used to live under `/online-chess-coaching-courses/`.
 * They are top-level pages now, so the old paths are 301'd rather than left to
 * 404 - those URLs are indexed and linked to.
 */
const COURSE_SLUG_REDIRECTS = [
  "beginner-chess-course",
  "intermediate-chess-course",
  "semi-pro-chess-course",
  "pro-chess-course",
  "masters-chess-course",
].map((slug) => ({
  source: `/online-chess-coaching-courses/${slug}`,
  destination: `/${slug}`,
  // An explicit 301 rather than Next's default 308, so the redirect reads the
  // way every SEO tool and server log expects a permanent move to read.
  statusCode: 301,
}));

/**
 * The Wix site this app replaced.
 *
 * Google still holds the old slugs - they are the sitelinks under our result -
 * and every one of them 404s today. Each entry below points at the page that
 * now does that job, so the link equity and the bookmarks move across instead
 * of dying at a 404.
 *
 * Only pages with a real successor are listed. The old blog (`/post/...`,
 * `/blog`, `/blog/tags/...`, `/blog/categories/...`) has no equivalent here, so
 * those stay 404: funnelling a hundred article URLs into the home page is a
 * soft 404 that Google discards anyway, and it would bury the pages that do
 * rank. Same for the Wix plumbing (`/cart-page`, `/profile/...`,
 * `/pages-sitemap.xml` and the other Wix sitemaps) - it should leave the index,
 * not be redirected.
 */
const LEGACY_WIX_REDIRECTS = [
  // Booking funnel. Both the CTA page and its thank-you page now land on the
  // demo form, which is where every call to action on the new site goes.
  ["/book-free-demo-class", "/register"],
  ["/thank-you-for-booking-demo", "/register"],
  ["/service-page/free-demo-assessment-session", "/register"],

  // Courses and pricing. There is no standalone pricing page now; the course
  // hub is the closest successor - it is the same ladder of plans.
  ["/plans-pricing", "/online-chess-coaching-courses"],
  ["/service-page/sayan-bose-individual-class-online", "/online-chess-coaching-courses"],
  ["/service-page/sayan-bose-individual-class-offline", "/chess-academy-in-kolkata"],

  // Contact, under a slug that lost its suffix in the move.
  ["/contact", "/contact-us"],
  // No careers page on the new site; the contact form is where an applicant
  // would land anyway.
  ["/career-kolkata", "/contact-us"],

  // The coach's own page. The success stories are the nearest thing to it.
  ["/sayan-bose", "/success-stories"],

  // Legal pages. These are app routes now, under shorter slugs.
  ["/privacy-policy", "/privacy"],
  ["/terms-and-conditions", "/terms"],
].map(([source, destination]) => ({ source, destination, statusCode: 301 }));

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [...COURSE_SLUG_REDIRECTS, ...LEGACY_WIX_REDIRECTS];
  },
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["mongoose"],
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
};
export default nextConfig;
