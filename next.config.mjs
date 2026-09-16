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

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return COURSE_SLUG_REDIRECTS;
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
