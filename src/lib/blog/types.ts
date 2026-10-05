/**
 * The shape of a blog post.
 *
 * Posts are data, not free-form markup, for the same reason the course and
 * centre pages are: the page component decides the heading levels, the schema
 * and the internal links, so a post cannot ship with two H1s, an H3 with no
 * H2 above it, a diagram without alt text or a link to a page that does not
 * exist. `content.test.ts` checks every one of those against every post.
 *
 * Inline text supports exactly two marks - `[anchor](/path)` and `**bold**` -
 * which covers every contextual link and emphasis a guide needs without
 * pulling a markdown parser into the bundle.
 */

export type BlogCategory = "learn-chess" | "for-parents" | "tournaments-and-ratings";

/** A square name, a1..h8. */
export type Square = string;

export type DiagramBlock = {
  type: "diagram";
  /** Piece placement, or a full FEN. Only the placement field is read. */
  fen: string;
  /** Squares tinted to show where a piece can go or what is attacked. */
  highlight?: Square[];
  /** Squares marked with a dot - targets, escape squares, empty destinations. */
  dots?: Square[];
  /** Arrows as "e2e4" pairs. */
  arrows?: string[];
  /** Board seen from black's side. */
  flipped?: boolean;
  /** The visible caption under the board. */
  caption: string;
  /**
   * What the board shows, in words, for screen readers and image search. Not a
   * repeat of the caption: it lists the pieces and squares that matter.
   */
  alt: string;
};

export type Block =
  | { type: "h2"; id: string; text: string }
  | { type: "h3"; id: string; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "callout"; title: string; text: string }
  | { type: "table"; caption: string; head: string[]; rows: string[][] }
  /** A call to action box. `href` is usually the demo form. */
  | { type: "cta"; heading: string; text: string; href: string; label: string }
  | DiagramBlock;

export type BlogPost = {
  slug: string;
  /** The `<title>`. Ends in "| Envision" and stays within about 60 characters. */
  title: string;
  h1: string;
  /** Meta description, 120-160 characters. */
  description: string;
  /** The one phrase this post is written to rank for. */
  keyword: string;
  keywords: string[];
  category: BlogCategory;
  /** Shown under the H1 as a standfirst, and on the blog index card. */
  excerpt: string;
  publishedAt: string;
  updatedAt: string;
  /** Course pages this post sends readers to, and that list this post back. */
  relatedCourses: string[];
  /** Sibling posts for the "keep reading" block. */
  relatedPosts: string[];
  /** Higher sorts first on the blog index, the footer and the home strip. */
  priority: number;
  body: Block[];
  faqs: { q: string; a: string }[];
};
