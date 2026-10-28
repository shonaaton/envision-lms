import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { whatsappSession } from "@/lib/whatsappAccess";
import { WhatsAppSavedReply } from "@/models/WhatsAppWorkspace";
import { WHATSAPP_STARTER_REPLIES } from "@/lib/whatsappSavedReplies";

export async function GET() {
  const user = await whatsappSession(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const replies: any[] = await WhatsAppSavedReply.find({}).sort({ category: 1, title: 1 }).lean();
  return NextResponse.json({ replies: [...WHATSAPP_STARTER_REPLIES.map((reply) => ({ ...reply, editable: false })), ...replies.map((reply) => ({ id: String(reply._id), title: reply.title, category: reply.category, body: reply.body, editable: String(reply.createdBy) === user.id }))] });
}
export async function POST(req: Request) {
  const user = await whatsappSession("create"); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim(), category = String(body.category || "General").trim(), text = String(body.body || "").trim();
  if (!title || title.length > 80 || !category || category.length > 40 || !text || text.length > 4096) return NextResponse.json({ error: "Provide a title (up to 80 characters), category (up to 40), and reply (up to 4096)." }, { status: 400 });
  await dbConnect();
  if (body.id) {
    if (!Types.ObjectId.isValid(body.id)) return NextResponse.json({ error: "Invalid saved reply." }, { status: 400 });
    const reply = await WhatsAppSavedReply.findOneAndUpdate({ _id: body.id, createdBy: user.id }, { $set: { title, category, body: text } }, { new: true }).lean();
    if (!reply) return NextResponse.json({ error: "Only the author can edit this saved reply." }, { status: 403 });
  } else await WhatsAppSavedReply.create({ title, category, body: text, createdBy: user.id });
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: Request) {
  const user = await whatsappSession("create"); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!Types.ObjectId.isValid(id || "")) return NextResponse.json({ error: "Invalid saved reply." }, { status: 400 });
  await dbConnect();
  const result = await WhatsAppSavedReply.deleteOne({ _id: id, createdBy: user.id });
  return NextResponse.json(result.deletedCount ? { ok: true } : { error: "Only the author can delete this saved reply." }, { status: result.deletedCount ? 200 : 403 });
}
