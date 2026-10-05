import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, Clock3, GraduationCap } from "lucide-react";
import PostBody from "@/components/blog/PostBody";
import TableOfContents from "@/components/blog/TableOfContents";
import RelatedLinks from "@/components/marketing/RelatedLinks";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { BLOG_PATH, blogHref, blogPosts, categoryLabel, getBlogPost, postHeadings, postWordCount, readingMinutes } from "@/lib/blog";
import { formatPostDate } from "@/lib/blog/dates";
import { coursePages } from "@/lib/coursePages";
import { blogHubLink, courseHubLink, demoLink, postLinks, type RelatedLink } from "@/lib/internalLinks";
import { absoluteUrl, breadcrumbSchema, faqSchema, organizationRef, publicMetadata, SITE_NAME, WEBSITE_ID } from "@/lib/seo";

/** Every post is known at build time, so each one is plain static HTML. */
export const dynamicParams = false;

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = getBlogPost(params.slug);
  if (!post) return {};
  return publicMetadata({
    path: blogHref(post.slug),
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    type: "article",
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    // The route's own `opengraph-image` draws a card for this post.
    image: null,
  });
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = getBlogPost(params.slug);
  if (!post) notFound();

  const url = absoluteUrl(blogHref(post.slug));
  const headings = postHeadings(post);
  const minutes = readingMinutes(post);

  const courseLinks: RelatedLink[] = post.relatedCourses.flatMap((slug) => {
    const course = coursePages.find((page) => page.slug === slug);
    return course ? [{ href: `/${course.slug}`, label: course.h1, detail: course.supportingHeading ?? course.keyword }] : [];
  });

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": `${url}#article`,
      headline: post.h1,
      name: post.title,
      description: post.description,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      isPartOf: { "@id": WEBSITE_ID },
      image: `${url}/opengraph-image`,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      inLanguage: "en-IN",
      wordCount: postWordCount(post),
      timeRequired: `PT${minutes}M`,
      keywords: post.keywords.join(", "),
      articleSection: categoryLabel(post.category),
      about: { "@type": "Thing", name: "Chess" },
      author: organizationRef,
      publisher: organizationRef,
    },
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Chess Blog", path: BLOG_PATH },
      { name: post.h1, path: blogHref(post.slug) },
    ]),
    ...(post.faqs.length ? [faqSchema(post.faqs)] : []),
  ];

  return (
    <main className="landing-compact min-h-screen bg-white text-brand-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <MarketingHeader demoHref={demoLink.href} />

      {/* ------------------------------------------------------------- hero */}
      <header className="relative isolate overflow-hidden bg-[#f5edf8]">
        <div className="absolute inset-0 bg-[linear-gradient(118deg,#ffffff_0%,#f5edf8_55%,#e8d4f0_100%)]" />
        <div className="absolute inset-0 opacity-[0.6] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
          <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-x-1.5 text-xs font-bold text-brand-900/60">
            <Link href="/" className="hover:text-brand">Home</Link>
            <span>/</span>
            <Link href={BLOG_PATH} className="hover:text-brand">Chess Blog</Link>
            <span>/</span>
            <span className="text-brand">{categoryLabel(post.category)}</span>
          </nav>
          <p className="inline-flex rounded-full bg-accent px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-900 shadow-sm shadow-accent-600/30">
            {categoryLabel(post.category)}
          </p>
          <h1 className="mt-4 text-[1.9rem] font-black leading-[1.1] text-brand-900 sm:text-[2.4rem] lg:text-[2.75rem]">{post.h1}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-brand-900/75 sm:text-lg sm:leading-8">{post.excerpt}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-brand-900/65">
            <span className="inline-flex items-center gap-1.5"><GraduationCap size={15} className="text-brand" /> By the {SITE_NAME} coaching team</span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={15} className="text-brand" /> Updated <time dateTime={post.updatedAt}>{formatPostDate(post.updatedAt)}</time>
            </span>
            <span className="inline-flex items-center gap-1.5"><Clock3 size={15} className="text-brand" /> {minutes} min read</span>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------- article */}
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:py-14">
        <article className="min-w-0 max-w-3xl">
          <div className="lg:hidden">
            <TableOfContents headings={headings} />
          </div>
          <PostBody blocks={post.body} />

          {post.faqs.length ? (
            <section aria-labelledby="faq" className="mt-14 border-t border-brand/10 pt-10">
              <h2 id="faq" className="scroll-mt-24 text-2xl font-black leading-tight text-brand-900 sm:text-[1.7rem]">Frequently asked questions</h2>
              <div className="mt-6 grid gap-3">
                {post.faqs.map((faq) => (
                  <details key={faq.q} className="group rounded-2xl border border-brand/10 bg-white p-5 shadow-sm shadow-brand-900/5 transition hover:border-brand/30" open>
                    <summary className="cursor-pointer list-none">
                      <h3 className="flex items-center justify-between gap-4 text-base font-black text-brand-900">
                        {faq.q}
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-accent transition-transform duration-300 group-open:rotate-45" aria-hidden>+</span>
                      </h3>
                    </summary>
                    <p className="mt-3 text-[0.97rem] leading-7 text-brand-900/75">{faq.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-5">
            <TableOfContents headings={headings} />
            <div className="rounded-2xl bg-brand p-5 text-white shadow-xl shadow-brand-900/20">
              <p className="text-base font-black leading-snug">Learn this with a coach</p>
              <p className="mt-2 text-xs leading-5 text-white/75">A free demo class ends with a level recommendation for your child, online from anywhere.</p>
              <Link href={demoLink.href} className="btn-accent mt-4 inline-flex w-full justify-center text-sm">
                {demoLink.label} <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <RelatedLinks
        eyebrow="Keep reading"
        heading="More chess guides from our coaches"
        links={[...postLinks(post.relatedPosts), blogHubLink]}
      />

      {courseLinks.length ? (
        <RelatedLinks
          eyebrow="Courses"
          heading="The courses that teach this"
          intro="Every guide on this blog follows the same syllabus our coaches teach live, online and at our Kolkata centres."
          links={[...courseLinks, courseHubLink, demoLink]}
        />
      ) : null}

      <MarketingFooter />
    </main>
  );
}
