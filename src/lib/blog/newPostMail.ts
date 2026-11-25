/**
 * The decisions behind the "new blog post" email, kept free of the database
 * so they can be tested on their own. The job that sends it is
 * `newPostMailJob.ts`.
 */

/** A post published longer ago than this is not news, even if its slug is new to the job. */
export const NEW_POST_MAX_AGE_DAYS = 14;

export type MailablePost = { slug: string; h1: string; excerpt: string; publishedAt: string };

export type NewPostPlan =
  /** First run ever: remember every live post, mail nothing. */
  | { kind: "seed"; slugs: string[] }
  | { kind: "update"; queue: string[]; skip: string[] };

/**
 * Which live posts to mail about.
 *
 * `known` is every slug the job has already recorded. On the very first run
 * it is empty, and every live post is recorded as already announced: without
 * that, switching the automation on would mail the whole archive at once.
 */
export function planNewPostMailing(posts: MailablePost[], known: Set<string>, now: Date): NewPostPlan {
  if (known.size === 0) return { kind: "seed", slugs: posts.map((post) => post.slug) };
  const cutoff = now.getTime() - NEW_POST_MAX_AGE_DAYS * 24 * 60 * 60_000;
  const queue: string[] = [];
  const skip: string[] = [];
  for (const post of posts) {
    if (known.has(post.slug)) continue;
    const published = Date.parse(`${post.publishedAt}T00:00:00Z`);
    if (Number.isFinite(published) && published < cutoff) skip.push(post.slug);
    else queue.push(post.slug);
  }
  return { kind: "update", queue, skip };
}

/** One email for everything a deploy added, so seven new posts are one email, not seven. */
export function newPostMailCopy(posts: MailablePost[], baseUrl: string, name?: string) {
  const link = (post: MailablePost) => `${baseUrl.replace(/\/+$/, "")}/blog/${post.slug}`;
  const single = posts.length === 1;
  const subject = single ? `New on the Envision blog: ${posts[0].h1}` : `${posts.length} new articles on the Envision blog`;
  const intro = single ? "We have just published a new article on the Envision Chess Academy blog:" : "We have just published new articles on the Envision Chess Academy blog:";
  const items = posts.flatMap((post) => [`${post.h1}`, post.excerpt, link(post), ""]);
  const message = [`Hello ${name?.trim() || "there"},`, "", intro, "", ...items, "Happy reading,", "Team Envision Chess Academy"].join("\n");
  const notice = single ? posts[0].excerpt : posts.map((post) => post.h1).join(" · ");
  return { subject, message, actionUrl: link(posts[0]), notificationTitle: subject, notificationMessage: notice, href: `/blog/${posts[0].slug}` };
}

/** The addresses one user's copy goes to: their own, and a student's parent if different. */
export function addressesFor(user: { role?: string; email?: string | null; parentEmail?: string | null }) {
  const out = new Set<string>();
  for (const value of [user.email, user.role === "student" ? user.parentEmail : null]) {
    const email = String(value || "").trim().toLowerCase();
    if (email.includes("@") && !email.endsWith(".invalid")) out.add(email);
  }
  return [...out];
}
