import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { blogPosts } from "@/lib/blog";
import { BlogPostView } from "@/models/BlogPostView";
import { consumeRateLimit, getClientIp } from "@/lib/requestSecurity";

export const dynamic = "force-dynamic";

/**
 * Public blog view counts.
 *
 * GET  ?slugs=a,b   -> { views: { a: 12, b: 0 } }
 * POST { slug }     -> counts one view, returns { slug, views }
 *
 * Unauthenticated by design: readers are logged-out visitors. Only slugs of
 * published posts are accepted, so the collection can never grow past the
 * number of posts. A failure never breaks the page: GET answers with an empty
 * map and POST with no count, and the page simply shows no number.
 */

const PUBLISHED = new Set(blogPosts.map((post) => post.slug));

/** A reader opens a handful of posts a minute; this only bites scripts. */
const VIEWS_PER_MINUTE_PER_IP = 30;

async function countsFor(slugs: string[]) {
  const rows = (await BlogPostView.find({ slug: { $in: slugs } }, { slug: 1, views: 1 }).lean()) as unknown as {
    slug: string;
    views: number;
  }[];
  const views: Record<string, number> = Object.fromEntries(slugs.map((slug) => [slug, 0]));
  // Summed, not assigned: two first-ever views arriving together can each
  // insert a row before the unique index exists, and neither should be lost.
  for (const row of rows) views[row.slug] += row.views ?? 0;
  return views;
}

/** Counts one view. A first view racing another can hit the unique index; the retry then finds the row. */
async function addView(slug: string, retry = true): Promise<number> {
  try {
    const row = (await BlogPostView.findOneAndUpdate(
      { slug },
      { $inc: { views: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true, projection: { views: 1 } }
    ).lean()) as unknown as { views: number } | null;
    return row?.views ?? 0;
  } catch (error) {
    if (retry && (error as { code?: number })?.code === 11000) return addView(slug, false);
    throw error;
  }
}

export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("slugs") ?? "";
    const slugs = Array.from(new Set(raw.split(",").map((slug) => slug.trim()))).filter((slug) => PUBLISHED.has(slug));
    if (!slugs.length) return NextResponse.json({ views: {} });
    await dbConnect();
    return NextResponse.json({ views: await countsFor(slugs) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ views: {} });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    if (!PUBLISHED.has(slug)) return NextResponse.json({ error: "Unknown post." }, { status: 404 });

    await dbConnect();
    // Over the limit: still answer with the current number, just don't add to it.
    if (!consumeRateLimit(`blog-views:ip:${getClientIp(req.headers)}`, VIEWS_PER_MINUTE_PER_IP, 60_000).allowed) {
      return NextResponse.json({ slug, views: (await countsFor([slug]))[slug] });
    }
    await addView(slug);
    return NextResponse.json({ slug, views: (await countsFor([slug]))[slug] });
  } catch {
    return NextResponse.json({ slug: null, views: null });
  }
}
