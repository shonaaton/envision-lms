import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { dbConnect } from "@/lib/db";
import { canonicalEmail } from "@/lib/identityMatch";
import { consumeRateLimit, getClientIp, jsonRateLimitHeaders } from "@/lib/requestSecurity";
import { contactMessageSchema } from "@/lib/validation";
import { ContactMessage } from "@/models/ContactMessage";

export const dynamic = "force-dynamic";

/**
 * The public contact form's only endpoint.
 *
 * Unauthenticated and world-writable, so it carries the same two rate limits
 * registration uses - one per IP, one per inbox - plus a honeypot. The limits
 * are looser than registration's: asking a second question an hour later is
 * normal behaviour, while opening a second account is not.
 *
 * It deliberately never reports whether an email has written in before. A
 * contact form that says "you already asked us that" leaks who is a customer.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const ip = getClientIp(req.headers);
    const ipLimit = consumeRateLimit(`contact:ip:${ip}`, 10, 15 * 60 * 1000);
    const emailKey = canonicalEmail(String(body?.email || ""));
    const emailLimit = emailKey ? consumeRateLimit(`contact:email:${emailKey}`, 5, 60 * 60 * 1000) : null;
    if (!ipLimit.allowed || (emailLimit && !emailLimit.allowed)) {
      const limited = !ipLimit.allowed ? ipLimit : emailLimit!;
      return NextResponse.json(
        { error: "You have sent several messages already. Please wait a little before sending another." },
        { status: 429, headers: jsonRateLimitHeaders(limited) }
      );
    }

    const data = contactMessageSchema.parse(body);

    // A filled honeypot is a bot. Answer exactly as a success does, so the bot
    // has nothing to learn and stops retrying.
    if (data.website) return NextResponse.json({ ok: true });

    await dbConnect();
    const created = await ContactMessage.create({
      name: data.name,
      email: data.email.toLowerCase(),
      address: data.address,
      countryCode: data.countryCode,
      phone: data.phone,
      interest: data.interest,
      message: data.message,
      sourcePath: data.sourcePath,
    });

    return NextResponse.json({ ok: true, id: created._id.toString() });
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      return NextResponse.json({ error: issue?.message || "Please check the form and try again." }, { status: 400 });
    }
    // Logged, because the reader is told nothing useful on purpose and a
    // contact form that quietly 500s is a form nobody knows is broken.
    console.error("[contact] submission failed", error);
    return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 500 });
  }
}
