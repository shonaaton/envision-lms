import type { Block, BlogCategory, BlogPost } from "@/lib/blog/types";
import { plainText } from "@/lib/blog/inline";
import bestAgeToStartChess from "@/lib/blog/posts/best-age-to-start-chess";
import chessOpeningPrinciples from "@/lib/blog/posts/chess-opening-principles-for-beginners";
import chessRulesForBeginners from "@/lib/blog/posts/chess-rules-for-beginners";
import chessTactics from "@/lib/blog/posts/chess-tactics-forks-pins-skewers";
import howChessPiecesMove from "@/lib/blog/posts/how-chess-pieces-move";
import howToCheckmate from "@/lib/blog/posts/how-to-checkmate-basic-mates";
import howToChooseACoach from "@/lib/blog/posts/how-to-choose-a-chess-coach";
import howToGetFideRating from "@/lib/blog/posts/how-to-get-fide-rating-india";
import onlineClassesAbroad from "@/lib/blog/posts/online-chess-classes-abroad-time-zones";
import howOnlineClassesWork from "@/lib/blog/posts/how-online-chess-classes-work";

/**
 * Every published post. A post exists on the site, in the sitemap, on the blog
 * index and in the "guides" blocks on the course pages the moment it is listed
 * here - and not before, so a half-written file is never published by accident.
 */
const ALL_POSTS: BlogPost[] = [
  howOnlineClassesWork,
  howChessPiecesMove,
  chessRulesForBeginners,
  howToCheckmate,
  chessOpeningPrinciples,
  chessTactics,
  bestAgeToStartChess,
  howToGetFideRating,
  onlineClassesAbroad,
  howToChooseACoach,
];

export const blogPosts: BlogPost[] = [...ALL_POSTS].sort(
  (a, b) => b.priority - a.priority || b.publishedAt.localeCompare(a.publishedAt),
);

export const BLOG_PATH = "/blog";
export const blogHref = (slug: string) => `${BLOG_PATH}/${slug}`;

export const blogCategories: { id: BlogCategory; label: string; heading: string; intro: string }[] = [
  {
    id: "learn-chess",
    label: "Learn Chess",
    heading: "Learn chess: rules, checkmates, openings and tactics",
    intro: "Step-by-step guides with board diagrams, written the way our coaches teach the beginner and intermediate stages.",
  },
  {
    id: "for-parents",
    label: "For Parents",
    heading: "For parents: choosing chess classes for your child",
    intro: "Honest answers to the questions parents ask before they book a first chess class, online or abroad.",
  },
  {
    id: "tournaments-and-ratings",
    label: "Tournaments & Ratings",
    heading: "Tournaments and FIDE ratings",
    intro: "How rated chess works in India, and what it takes to move from academy games to rated events.",
  },
];

export function categoryLabel(id: BlogCategory) {
  return blogCategories.find((category) => category.id === id)?.label ?? id;
}

export function getBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}

export function postsByCategory(category: BlogCategory) {
  return blogPosts.filter((post) => post.category === category);
}

/** Posts that name this course page as related - the course page lists them back. */
export function postsForCourse(courseSlug: string) {
  return blogPosts.filter((post) => post.relatedCourses.includes(courseSlug));
}

function blockText(block: Block): string {
  switch (block.type) {
    case "ul":
    case "ol":
      return block.items.map(plainText).join(" ");
    case "table":
      return [...block.head, ...block.rows.flat()].join(" ");
    case "callout":
      return `${block.title} ${plainText(block.text)}`;
    case "cta":
      return `${block.heading} ${block.text}`;
    case "diagram":
      return block.caption;
    default:
      return plainText(block.text);
  }
}

export function postWordCount(post: BlogPost) {
  const text = [...post.body.map(blockText), ...post.faqs.flatMap((faq) => [faq.q, faq.a])].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

/** At the 200 words a minute an unhurried reader manages. */
export function readingMinutes(post: BlogPost) {
  return Math.max(1, Math.round(postWordCount(post) / 200));
}

export function postHeadings(post: BlogPost) {
  return post.body.flatMap((block) => (block.type === "h2" || block.type === "h3" ? [block] : []));
}
