import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isValidObjectId } from "mongoose";
import { ACADEMY_LOGO_URL } from "@/lib/branding";
import { maskEmail, verifyBlogUnsubscribeSignature } from "@/lib/blog/blogMailUnsubscribe";
import { dbConnect } from "@/lib/db";
import { BlogEmailOptOut, BlogMailRecipient } from "@/models/BlogMailing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blog emails | Envision Chess Academy", robots: { index: false, follow: false } };

type Params = { id: string; sig: string };

async function recipientFor(params: Params) {
  if (!isValidObjectId(params.id) || !(await verifyBlogUnsubscribeSignature(params.id, params.sig))) return null;
  await dbConnect();
  return (await BlogMailRecipient.findById(params.id, { email: 1 }).lean()) as { _id: unknown; email: string } | null;
}

/**
 * The unsubscribe link in the "new blog post" email (lib/blog/newPostMailJob.ts).
 * Opening the link changes nothing: mail scanners open every link in an email,
 * so the reader has to press the button. The opt-out is per address, because a
 * parent's address has no account to hold a setting.
 */
export default async function BlogUnsubscribePage({ params }: { params: Params }) {
  const recipient = await recipientFor(params);
  if (!recipient) notFound();
  const optedOut = Boolean(await BlogEmailOptOut.exists({ email: recipient.email }));
  const path = `/unsubscribe/blog/${params.id}/${params.sig}`;

  async function unsubscribe() {
    "use server";
    const row = await recipientFor(params);
    if (!row) notFound();
    await BlogEmailOptOut.updateOne({ email: row.email }, { $setOnInsert: { email: row.email, recipient: row._id } }, { upsert: true });
    redirect(path);
  }

  async function resubscribe() {
    "use server";
    const row = await recipientFor(params);
    if (!row) notFound();
    await BlogEmailOptOut.deleteOne({ email: row.email });
    redirect(path);
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="bg-brand px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" className="h-8 w-auto" />
        </div>
        <div className="space-y-4 p-5">
          <h1 className="text-xl font-black">{optedOut ? "You're unsubscribed" : "Emails about new blog articles"}</h1>
          <p className="text-sm text-slate-600">
            {optedOut
              ? `${maskEmail(recipient.email)} will no longer get an email when we publish a new blog article.`
              : `We email ${maskEmail(recipient.email)} when we publish a new article on the Envision Chess Academy blog.`}
          </p>
          <p className="text-sm text-slate-600">Class, homework, fee and other academy emails are not affected.</p>
          <form action={optedOut ? resubscribe : unsubscribe}>
            <button
              type="submit"
              className={optedOut ? "rounded-lg border border-brand px-4 py-2 text-sm font-bold text-brand" : "rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"}
            >
              {optedOut ? "Subscribe again" : "Unsubscribe from blog emails"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
