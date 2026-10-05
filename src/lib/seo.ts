import type { Metadata } from "next";
import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL } from "@/lib/branding";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

/**
 * Metadata and schema shared by every public page.
 *
 * The canonical, Open Graph and Twitter blocks used to be hand-copied into each
 * page, and the copies drifted: the legal pages had no social card at all and
 * `/register` had no Twitter block. Pages now describe themselves - path, title,
 * description, the phrase they target - and this file turns that into tags.
 */

export const SITE_NAME = "Envision Chess Academy";

/** The site-wide social card, until a page supplies its own. */
export const DEFAULT_OG_IMAGE = "/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg";

export const absoluteUrl = (path: string) => `${MARKETING_BASE_URL}${path === "/" ? "/" : path}`;

export type PublicMetadataInput = {
  /** Site-relative path, e.g. "/blog/how-chess-pieces-move". */
  path: string;
  title: string;
  description: string;
  keywords?: string[];
  /** Alt text for the social card - what the page is about, not the filename. */
  imageAlt?: string;
  /**
   * A page-specific social card. Omitted when the route has its own
   * `opengraph-image`, which Next attaches by itself.
   */
  image?: { url: string; width: number; height: number } | null;
  type?: "website" | "article" | "profile";
  publishedTime?: string;
  modifiedTime?: string;
  /** A shorter description for the social card, where the meta one is long. */
  socialDescription?: string;
  noindex?: boolean;
};

export function publicMetadata(input: PublicMetadataInput): Metadata {
  const url = absoluteUrl(input.path);
  const image = input.image === undefined ? { url: DEFAULT_OG_IMAGE, width: 1200, height: 900 } : input.image;
  const socialDescription = input.socialDescription ?? input.description;
  const images = image ? [{ ...image, alt: input.imageAlt ?? input.title }] : undefined;

  return {
    metadataBase: new URL(MARKETING_BASE_URL),
    title: input.title,
    description: input.description,
    ...(input.keywords?.length ? { keywords: input.keywords } : {}),
    alternates: { canonical: url },
    // No explicit "index": that is the default, and stating it would contradict
    // the noindex Next adds to a streamed not-found page. Large image previews
    // let Google show the social card in Discover and image results.
    robots: input.noindex ? { index: false, follow: true } : { "max-image-preview": "large", "max-snippet": -1 },
    openGraph: {
      title: input.title,
      description: socialDescription,
      url,
      siteName: SITE_NAME,
      locale: "en_IN",
      type: input.type ?? "website",
      ...(input.type === "article"
        ? { publishedTime: input.publishedTime, modifiedTime: input.modifiedTime, authors: [SITE_NAME] }
        : {}),
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: socialDescription,
      ...(image ? { images: [image.url] } : {}),
    },
  };
}

/**
 * The academy as one schema.org node with a stable `@id`.
 *
 * Course, centre and blog schema point at this `@id` rather than restating the
 * academy each time, so Google reads one organisation behind every page instead
 * of a dozen near-identical ones.
 */
export const ORGANIZATION_ID = `${MARKETING_BASE_URL}/#organization`;
export const WEBSITE_ID = `${MARKETING_BASE_URL}/#website`;

/**
 * The academy's own social profiles, for `sameAs`. They tell Google these
 * accounts and this site are one organisation, which is what lets it show them
 * together in the knowledge panel. Confirmed by the owner on 2026-10-05.
 */
export const ACADEMY_SAME_AS: string[] = [
  "https://www.facebook.com/envisionchess",
  "https://www.instagram.com/envisionchessacademy",
  "https://www.youtube.com/@EnvisionChessAcademy",
];

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    legalName: ACADEMY_DEFAULTS.legalName,
    url: `${MARKETING_BASE_URL}/`,
    logo: { "@type": "ImageObject", url: ACADEMY_LOGO_URL },
    email: ACADEMY_DEFAULTS.email,
    telephone: ACADEMY_DEFAULTS.phone,
    ...(ACADEMY_SAME_AS.length ? { sameAs: ACADEMY_SAME_AS } : {}),
  };
}

/** A reference to the academy node, for `publisher`, `provider` and `author`. */
export const organizationRef = { "@type": "EducationalOrganization", "@id": ORGANIZATION_ID, name: SITE_NAME } as const;

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: `${MARKETING_BASE_URL}/`,
    inLanguage: "en-IN",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export type Crumb = { name: string; path: string };

export function breadcrumbSchema(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };
}
