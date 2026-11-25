import "server-only";

import { resolvePublicAppUrl } from "@/lib/appUrl";
import { blogPosts } from "@/lib/blog";
import { addressesFor, newPostMailCopy, planNewPostMailing, type MailablePost } from "@/lib/blog/newPostMail";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { BlogMailing, BlogMailRecipient, BlogPostMailState } from "@/models/BlogMailing";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

const CHUNK = 20;
/** A send that hasn't reported progress for this long is assumed dead and picked up again. */
const STALE_CLAIM_MS = 10 * 60_000;

/** Every active account, the same audience as the "All Users" announcement. */
const AUDIENCE = { isActive: { $ne: false } };

export function blogNewPostEmailsEnabled() {
  return String(process.env.BLOG_NEW_POST_EMAILS || "on").trim().toLowerCase() !== "off";
}

/** Record slugs the job hasn't seen; group the new ones into one mailing. */
async function recordNewPosts(now: Date) {
  const known = new Set<string>((await BlogPostMailState.find({}, { slug: 1 }).lean()).map((row: any) => row.slug));
  const plan = planNewPostMailing(blogPosts, known, now);

  if (plan.kind === "seed") {
    if (plan.slugs.length) {
      await BlogPostMailState.bulkWrite(
        plan.slugs.map((slug) => ({ updateOne: { filter: { slug }, update: { $setOnInsert: { slug, state: "seeded" } }, upsert: true } })),
        { ordered: false }
      );
    }
    return { seeded: plan.slugs.length, queued: 0 };
  }

  for (const slug of plan.skip) {
    await BlogPostMailState.updateOne({ slug }, { $setOnInsert: { slug, state: "skipped" } }, { upsert: true });
  }
  if (!plan.queue.length) return { seeded: 0, queued: 0 };

  // Claim each slug before it joins a mailing, so two app instances starting
  // together can't put the same post into two mailings.
  const claimed: string[] = [];
  for (const slug of plan.queue) {
    const result = await BlogPostMailState.updateOne({ slug }, { $setOnInsert: { slug, state: "queued" } }, { upsert: true });
    if (result.upsertedCount) claimed.push(slug);
  }
  if (!claimed.length) return { seeded: 0, queued: 0 };
  const mailing: any = await BlogMailing.create({ slugs: claimed });
  await BlogPostMailState.updateMany({ slug: { $in: claimed } }, { $set: { mailing: mailing._id } });
  return { seeded: 0, queued: claimed.length };
}

async function claimMailing() {
  const now = new Date();
  return BlogMailing.findOneAndUpdate(
    {
      $or: [
        { status: "pending" },
        { status: "sending", claimedAt: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
      ],
    },
    { $set: { status: "sending", claimedAt: now } },
    { new: true, sort: { createdAt: 1 } }
  );
}

async function deliverTo(user: any, mailing: any, posts: MailablePost[], baseUrl: string) {
  const own = newPostMailCopy(posts, baseUrl, user.name);
  const dedupKey = `blog_new_post:${mailing._id}:${user._id}`;
  await Notification.updateOne(
    { user: user._id, "metadata.dedupKey": dedupKey },
    {
      $setOnInsert: {
        user: user._id,
        type: "announcement",
        title: own.notificationTitle,
        message: own.notificationMessage,
        metadata: { kind: "blog_new_post", href: own.href, slugs: mailing.slugs, mailing: mailing._id, dedupKey },
      },
    },
    { upsert: true }
  );

  let sent = 0;
  let failed = 0;
  for (const email of addressesFor(user)) {
    // One copy per address per mailing: siblings share a parent's inbox.
    try {
      await BlogMailRecipient.create({ mailing: mailing._id, email });
    } catch (error: any) {
      if (error?.code === 11000) continue;
      throw error;
    }
    const isParent = user.role === "student" && email === String(user.parentEmail || "").toLowerCase() && email !== String(user.email || "").toLowerCase();
    const copy = isParent ? newPostMailCopy(posts, baseUrl, user.parentName) : own;
    try {
      const result: any = await sendAutomationEmail({
        to: email,
        subject: copy.subject,
        message: copy.message,
        actionUrl: copy.actionUrl,
        actionLabel: "Read the article",
        metadata: { kind: "blog_new_post", dedupKey: `${dedupKey}:${email}`, userId: String(user._id), mailing: String(mailing._id) },
      });
      if (result?.ok === false && !result?.skipped) failed += 1;
      else sent += 1;
    } catch (error) {
      failed += 1;
      console.error("[blog-mail] email failed", { user: String(user._id), error });
    }
  }
  return { sent, failed };
}

async function deliver(mailing: any, baseUrl: string) {
  const posts = mailing.slugs
    .map((slug: string) => blogPosts.find((post) => post.slug === slug))
    .filter(Boolean) as MailablePost[];
  if (!posts.length) {
    // Every post in it was unpublished again before the send started.
    await BlogMailing.updateOne({ _id: mailing._id }, { $set: { status: "sent", finishedAt: new Date() } });
    return;
  }

  let cursor = mailing.cursor || null;
  for (;;) {
    const users: any[] = await User.find({ ...AUDIENCE, ...(cursor ? { _id: { $gt: cursor } } : {}) })
      .select("_id name email role parentName parentEmail")
      .sort({ _id: 1 })
      .limit(CHUNK)
      .lean();
    if (!users.length) break;
    const results = await Promise.allSettled(users.map((user) => deliverTo(user, mailing, posts, baseUrl)));
    let sent = 0;
    let failed = 0;
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        sent += result.value.sent;
        failed += result.value.failed;
      } else {
        failed += 1;
        console.error("[blog-mail] delivery failed", { user: String(users[index]._id), error: result.reason });
      }
    });
    cursor = users[users.length - 1]._id;
    await BlogMailing.updateOne(
      { _id: mailing._id },
      { $set: { cursor, claimedAt: new Date() }, $inc: { usersDone: users.length, emailsSent: sent, emailsFailed: failed } }
    );
  }
  await BlogMailing.updateOne({ _id: mailing._id }, { $set: { status: "sent", finishedAt: new Date() } });
}

/**
 * Mail every active user when a deploy adds a blog post.
 *
 * The first run only records the posts already live. After that, each new
 * slug (published in the last two weeks) joins one mailing, and the mailing is
 * sent in chunks with a cursor, so a restart mid-send carries on where it
 * stopped. Set BLOG_NEW_POST_EMAILS=off to pause it; slugs keep being recorded
 * as queued and go out when it is switched back on.
 */
export async function processNewBlogPostEmails(now = new Date()) {
  await dbConnect();
  const recorded = await recordNewPosts(now);
  if (!blogNewPostEmailsEnabled()) return { ...recorded, mailings: 0, paused: true };

  const baseUrl = resolvePublicAppUrl() || "https://envisionchessacademy.com";
  let mailings = 0;
  for (let mailing = await claimMailing(); mailing; mailing = await claimMailing()) {
    await deliver(mailing, baseUrl);
    mailings += 1;
  }
  return { ...recorded, mailings };
}
