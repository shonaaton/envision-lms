import { centreHref, centreHub, centreTimeRange, kolkataCentres } from "@/lib/centrePages";
import { courseHub, coursePages } from "@/lib/coursePages";

/**
 * The public site's internal link sets, in one place.
 *
 * Every "where to next" block on the site is built from these rather than from
 * hand-written anchors, for three reasons: the anchor text stays the phrase each
 * target page actually targets, a new course or centre appears in every block at
 * once, and a slug can never be linked to a page that does not exist.
 *
 * Anchor text matters more than link count here. "Chess Academy in Bowbazar"
 * tells a crawler what the destination is about; "click here" and "read more"
 * tell it nothing, so nothing in this file produces either.
 */

export type RelatedLink = {
  href: string;
  label: string;
  detail: string;
};

/** The five course pages, each with the phrase it targets. */
export function courseLinks(exceptSlug?: string): RelatedLink[] {
  return coursePages
    .filter((page) => page.slug !== exceptSlug)
    .map((page) => ({
      href: `/${page.slug}`,
      label: page.h1,
      detail: page.supportingHeading ?? page.keyword,
    }));
}

export const courseHubLink: RelatedLink = {
  href: `/${courseHub.slug}`,
  label: courseHub.navLabel,
  detail: "All five stages, fifteen levels and 240 live sessions in one place.",
};

/** The four Kolkata centres, with the facts that decide which one a parent picks. */
export function centreLinks(exceptSlug?: string): RelatedLink[] {
  return kolkataCentres
    .filter((centre) => centre.slug !== exceptSlug)
    .map((centre) => ({
      href: centreHref(centre.slug),
      label: centre.h1,
      detail: `${centre.address} - ${centre.schedule.map((entry) => entry.day.slice(0, 3)).join(", ")}, ${centreTimeRange(centre)}`,
    }));
}

export const centreHubLink: RelatedLink = {
  href: `/${centreHub.slug}`,
  label: centreHub.navLabel,
  detail: `All ${kolkataCentres.length} centres, their batch timings, coaches and contact numbers.`,
};

export const successStoriesLink: RelatedLink = {
  href: "/success-stories",
  label: "Student Success Stories",
  detail: "Verified tournament results, ratings and titles won by Envision students.",
};

export const contactLink: RelatedLink = {
  href: "/contact-us",
  label: "Contact Us",
  detail: "Ask about batches, availability and fees, online or at any Kolkata centre.",
};

export const demoLink: RelatedLink = {
  href: "/register",
  label: "Book a Free Demo Class",
  detail: "A real assessment class with a coach that ends in a level recommendation.",
};

export const homeLink: RelatedLink = {
  href: "/",
  label: "Envision Chess Academy",
  detail: "Structured chess coaching in India, online and at four Kolkata centres.",
};

/** The offline cluster, as an online page should offer it. */
export function offlineCluster(): RelatedLink[] {
  return [centreHubLink, ...centreLinks()];
}

/** The online cluster, as an offline or story page should offer it. */
export function onlineCluster(): RelatedLink[] {
  return [courseHubLink, ...courseLinks()];
}
