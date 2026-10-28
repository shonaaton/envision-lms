import { Schema, model, models } from "mongoose";
import { NextResponse } from "next/server";

// Loaded when first used: the scheduler in instrumentation.ts reaches this file,
// and Next.js compiles that for the Edge runtime too, where a static
// `import "crypto"` fails the dev server and the build (see lib/tempPasswords.ts).
function createHash(algorithm: string) {
  return (eval("require")("crypto") as typeof import("crypto")).createHash(algorithm);
}

const SendRequestSchema = new Schema({
  _id: String,
  fingerprint: String,
  state: { type: String, default: "processing" },
  response: Schema.Types.Mixed,
  statusCode: Number,
  createdAt: { type: Date, default: Date.now, expires: 30 * 24 * 60 * 60 },
});
export const WhatsAppSendRequest = models.WhatsAppSendRequest || model("WhatsAppSendRequest", SendRequestSchema);

/** Reserve before contacting the provider. Replaying a timed-out HTTP request
 * must never contact the provider a second time, even on another server.
 */
export async function withWhatsAppSendRequest(input: {
  key: unknown; actorId: string; kind: "reply" | "template" | "media" | "campaign"; payload: unknown;
}, send: () => Promise<{ body: Record<string, unknown>; status?: number }>) {
  const key = String(input.key || "");
  if (!/^[\w-]{16,100}$/.test(key)) return NextResponse.json({ error: "A valid requestId is required." }, { status: 400 });
  const id = `${input.kind}:${input.actorId}:${key}`;
  const fingerprint = createHash("sha256").update(JSON.stringify(input.payload)).digest("hex");
  await WhatsAppSendRequest.init();
  try {
    await WhatsAppSendRequest.create({ _id: id, fingerprint });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    const previous: any = await WhatsAppSendRequest.findById(id).lean();
    if (previous?.fingerprint !== fingerprint) return NextResponse.json({ error: "This requestId was already used for another message." }, { status: 409 });
    if (previous?.state === "completed") return NextResponse.json(previous.response, { status: previous.statusCode || 200 });
    return NextResponse.json({ error: "Send is still processing or its result is unconfirmed. Check the conversation before sending again.", retryable: false, uncertain: true }, { status: 409 });
  }
  try {
    const result = await send();
    const status = result.status || 200;
    await WhatsAppSendRequest.updateOne({ _id: id }, { $set: { state: "completed", response: result.body, statusCode: status } });
    return NextResponse.json(result.body, { status });
  } catch (error) {
    console.error("WhatsApp send result is unconfirmed", { requestId: key, error });
    // Leave the reservation in place: a DB/logging failure can happen after the
    // provider accepts a send. A blind retry would duplicate that message.
    return NextResponse.json({ error: "Could not confirm the send. Check the conversation before sending again.", retryable: false, uncertain: true }, { status: 502 });
  }
}
