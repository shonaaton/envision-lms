import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { BoardSvg } from "@/components/blog/ChessDiagram";
import RelatedLinks from "@/components/marketing/RelatedLinks";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { BLOG_PATH, blogCategories, blogHref, blogPosts, categoryLabel, postsByCategory, readingMinutes } from "@/lib/blog";
import type { BlogPost, DiagramBlock } from "@/lib/blog/types";
import { courseHubLink, courseLinks, demoLink, successStoriesLink } from "@/lib/internalLinks";
import { absoluteUrl, breadcrumbSchema, organizationRef, publicMetadata, WEBSITE_ID } from "@/lib/seo";

const title = "Chess Blog: Guides for Parents & Players | Envision";
const description =
  "Free chess guides from Envision Chess Academy coaches: how the pieces move, the rules, checkmates, openings and tactics, plus advice on choosing online chess classes.";

export const metadata: Metadata = publicMetadata({
  path: BLOG_PATH,
  title,
  description,
  keywords: [
    "chess blog",
    "learn chess online",
    "chess guide for beginners",
    "chess tips for kids",
    "online chess classes for kids",
    "how to play chess",
  ],
  imageAlt: "Envision Chess Academy student with a tournament trophy - chess guides for parents and players",
});

const STARTING_POSITION = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

/** The post's first diagram for its card, or the starting position if it has none. */
function thumbnail(post: BlogPost): Pick<DiagramBlock, "fen" | "alt" | "highlight" | "dots" | "arrows"> {
  const diagram = post.body.find((block): block is DiagramBlock => block.type === "diagram");
  return diagram ?? { fen: STARTING_POSITION, alt: "" };
}

function PostCard({ post, featured = false }: { post: BlogPost; featured?: boolean }) {
  const Heading = featured ? "h2" : "h3";
  return (
    <Link
      href={blogHref(post.slug)}
      className={`group flex h-full overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-xl hover:shadow-brand-900/10 ${featured ? "flex-col md:flex-row" : "flex-col"}`}
    >
      <div className={`shrink-0 bg-brand-50 p-4 ${featured ? "md:w-[42%]" : ""}`}>
        <div className="mx-auto max-w-[260px] overflow-hidden rounded-lg shadow-md shadow-brand-900/10">
          <BoardSvg diagram={thumbnail(post)} decorative />
        </div>
      </div>
      <div className={`flex flex-1 flex-col ${featured ? "p-6 sm:p-8" : "p-5"}`}>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand">{categoryLabel(post.category)}</p>
        <Heading className={`mt-2 font-black leading-snug text-brand-900 group-hover:text-brand ${featured ? "text-2xl sm:text-3xl" : "text-lg"}`}>{post.h1}</Heading>
        <p className={`mt-3 flex-1 leading-6 text-brand-900/70 ${featured ? "text-base" : "text-sm"}`}>{post.excerpt}</p>
        <span className="mt-4 flex items-center justify-between text-xs font-bold text-brand-900/60">
          <span className="inline-flex items-center gap-1.5"><Clock3 size={14} /> {readingMinutes(post)} min read</span>
          <span className="inline-flex items-center gap-1 text-brand">Read the guide <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
        </span>
      </div>
    </Link>
  );
}

/**
 * The blog index.
 *
 * Grouped by category under real H2s, so the page reads as three topic hubs -
 * learning chess, choosing classes, ratings - rather than a date-ordered feed,
 * and each group passes its links to the posts that belong to that topic.
 */
export default function BlogIndexPage() {
  const [featured] = blogPosts;
  const url = absoluteUrl(BLOG_PATH);

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      "@id": `${url}#blog`,
      name: "Envision Chess Academy Blog",
      description,
      url,
      inLanguage: "en-IN",
      isPartOf: { "@id": WEBSITE_ID },
      publisher: organizationRef,
      blogPost: blogPosts.map((post) => ({
        "@type": "BlogPosting",
        headline: post.h1,
        url: absoluteUrl(blogHref(post.slug)),
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
      })),
    },
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Chess Blog", path: BLOG_PATH },
    ]),
  ];

  return (
    <main className="landing-compact min-h-screen bg-white text-brand-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <MarketingHeader demoHref={demoLink.href} />

      <header className="relative isolate overflow-hidden bg-[#f5edf8]">
        <div className="absolute inset-0 bg-[linear-gradient(118deg,#ffffff_0%,#f5edf8_55%,#e8d4f0_100%)]" />
        <div className="absolute inset-0 opacity-[0.6] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-x-1.5 text-xs font-bold text-brand-900/60">
            <Link href="/" className="hover:text-brand">Home</Link>
            <span>/</span>
            <span className="text-brand">Chess Blog</span>
          </nav>
          <p className="inline-flex rounded-full bg-accent px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-900 shadow-sm shadow-accent-600/30">
            Free chess guides
          </p>
          <h1 className="mt-4 max-w-3xl text-[2rem] font-black leading-[1.08] text-brand-900 sm:text-[2.6rem] lg:text-[3rem]">
            Chess Blog: guides for parents and players
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-brand-900/75 sm:text-lg sm:leading-8">
            Learn how to play chess step by step, with board diagrams for every rule, checkmate and tactic - and get straight answers on choosing online
            chess classes for your child, wherever you live.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Topics">
            {blogCategories.map((category) => (
              <li key={category.id}>
                <a href={`#${category.id}`} className="inline-flex rounded-full border border-brand/20 bg-white px-3.5 py-1.5 text-xs font-bold text-brand transition hover:border-brand/50 hover:bg-brand-50">
                  {category.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </header>

      {featured ? (
        <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8 lg:pt-14" aria-label="Featured guide">
          <PostCard post={featured} featured />
        </section>
      ) : null}

      {blogCategories.map((category) => {
        const posts = postsByCategory(category.id).filter((post) => post.slug !== featured?.slug);
        if (!posts.length) return null;
        return (
          <section key={category.id} id={category.id} className="mx-auto max-w-7xl scroll-mt-24 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
            <h2 className="text-2xl font-black leading-tight text-brand-900 sm:text-3xl">{category.heading}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-brand-900/70">{category.intro}</p>
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          </section>
        );
      })}

      <RelatedLinks
        eyebrow="Learn with a coach"
        heading="Ready for live chess classes?"
        intro="Every guide here follows the syllabus our coaches teach live: five stages, fifteen levels and 240 sessions, online from anywhere."
        links={[demoLink, courseHubLink, ...courseLinks().slice(0, 2), successStoriesLink]}
      />

      <MarketingFooter />
    </main>
  );
}
