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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The email body as finished HTML. The generic email builder keeps one link
 * (as the button) and drops every other link line, which would lose the
 * second and later posts and the unsubscribe link, so this email brings its
 * own body.
 */
export function newPostMailHtml(posts: MailablePost[], baseUrl: string, name: string | undefined, unsubscribeUrl: string) {
  const link = (post: MailablePost) => `${baseUrl.replace(/\/+$/, "")}/blog/${post.slug}`;
  const intro = posts.length === 1 ? "We have just published a new article on the Envision Chess Academy blog:" : "We have just published new articles on the Envision Chess Academy blog:";
  const items = posts
    .map(
      (post) =>
        `<div style="margin:18px 0;padding:14px 16px;border:1px solid #eadff0;border-radius:10px">` +
        `<p style="margin:0 0 6px;font-weight:700;font-size:16px">${escapeHtml(post.h1)}</p>` +
        `<p style="margin:0 0 12px;color:#475569">${escapeHtml(post.excerpt)}</p>` +
        `<a href="${escapeHtml(link(post))}" style="display:inline-block;background:#5a1372;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700">Read the article</a>` +
        `</div>`
    )
    .join("");
  const footer = unsubscribeUrl
    ? `<p style="margin-top:24px;font-size:12px;color:#64748b">You get this email because you have an account with Envision Chess Academy. Don't want emails about new blog articles? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#64748b">Unsubscribe</a>. Class, homework and fee emails are not affected.</p>`
    : "";
  return `<p>Hello ${escapeHtml(name?.trim() || "there")},</p><p>${escapeHtml(intro)}</p>${items}<p>Happy reading,<br>Team Envision Chess Academy</p>${footer}`;
}
