import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { whatsappSession, canAccessWhatsAppPhone } from "@/lib/whatsappAccess";
import { canAccessFeature } from "@/lib/featureAccess";
import { WhatsAppConversation } from "@/models/WhatsAppConversation";
import { WhatsAppPrivateNote } from "@/models/WhatsAppWorkspace";
import { User } from "@/models/User";
import { Batch } from "@/models/Batch";
import { FeeAssignment, Invoice, Notification } from "@/models/Fee";
import { FeatureAccess } from "@/models/FeatureAccess";
import { FEATURE_DEFINITIONS } from "@/lib/featureRegistry";
import { parseAcademyDateTimeLocal } from "@/lib/academyTime";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";
const validPhone = (phone: string) => /^\d{7,15}$/.test(phone);
const userShape = (user: any) => user ? { id: String(user._id), name: user.name, role: user.role, email: user.email, username: user.username, phone: user.phone, parentName: user.parentName, parentEmail: user.parentEmail } : null;

export async function GET(req: Request) {
  const user = await whatsappSession(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const params = new URL(req.url).searchParams;
  if (params.get("staff") === "1") {
    if (user.role === "instructor") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const staff: any[] = await User.find({ role: { $in: ["admin", "sub-admin", "instructor"] }, isActive: { $ne: false }, branch: null }).select("name role").sort({ name: 1 }).lean();
    return NextResponse.json({ staff: staff.map((person) => ({ id: String(person._id), name: person.name, role: person.role })) });
  }
  const phoneNumber = params.get("phone") || "";
  if (!validPhone(phoneNumber)) return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
  if (!(await canAccessWhatsAppPhone(user, phoneNumber))) return NextResponse.json({ error: "This conversation is not assigned to you." }, { status: 403 });
  if (params.has("searchUsers")) {
    if (user.role === "instructor" || !(await canAccessFeature("whatsapp", user, "manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const search = (params.get("searchUsers") || "").trim().slice(0, 100);
    if (search.length < 2) return NextResponse.json({ users: [] });
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const users: any[] = await User.find({ $or: ["name", "username", "email", "phone"].map((field) => ({ [field]: { $regex: escaped, $options: "i" } })) }).select("name role username email phone parentName").limit(20).lean();
    return NextResponse.json({ users: users.map(userShape) });
  }
  if (params.get("notes") === "1") {
    const before = params.get("before");
    if (before && !Types.ObjectId.isValid(before)) return NextResponse.json({ error: "Invalid note cursor." }, { status: 400 });
    const notes: any[] = await WhatsAppPrivateNote.find({ phoneNumber, ...(before ? { _id: { $lt: new Types.ObjectId(before) } } : {}) }).populate("author", "name").sort({ _id: -1 }).limit(51).lean();
    return NextResponse.json({ notes: notes.slice(0, 50).map((note) => ({ id: String(note._id), body: note.body, author: note.author?.name || "Staff", createdAt: note.createdAt })), nextCursor: notes.length > 50 ? String(notes[49]._id) : null });
  }
  const conversation: any = await WhatsAppConversation.findOne({ phoneNumber }).populate("assignedTo", "name role").lean();
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const linkedId = conversation.linkedManually ? conversation.linkedUser : conversation.matchedUser;
  const profile: any = linkedId ? await User.findById(linkedId).select("name role email username phone parentName parentEmail batches").lean() : null;
  const batches: any[] = profile ? await Batch.find({ $or: [{ students: profile._id }, { coach: profile._id }], isActive: { $ne: false } }).populate("coach", "name").select("name coach").lean() : [];
  let fees: any = null;
  if (profile?.role === "student" && user.role !== "instructor" && (await canAccessFeature("studentFees", user, "view"))) {
    const [assignment, invoices]: any[] = await Promise.all([
      FeeAssignment.findOne({ student: profile._id }).populate("plan", "name").select("type creditBalance plan").lean(),
      Invoice.find({ student: profile._id, status: { $in: ["unpaid", "overdue"] } }).select("invoiceNumber totalAmount dueDate status").sort({ dueDate: 1 }).lean(),
    ]);
    fees = { planName: assignment?.plan?.name || "", type: assignment?.type || "", creditBalance: assignment?.type === "credits" ? assignment.creditBalance : null, outstanding: invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0), 0), invoices: invoices.slice(0, 10).map((invoice: any) => ({ number: invoice.invoiceNumber, totalAmount: invoice.totalAmount, dueDate: invoice.dueDate, status: invoice.status })) };
  }
  return NextResponse.json({ profile: userShape(profile), linkedManually: Boolean(conversation.linkedManually), displayName: conversation.displayName || "", batches: batches.map((batch) => ({ id: String(batch._id), name: batch.name, coachName: batch.coach?.name || "" })), fees, assignedTo: conversation.assignedTo ? { id: String(conversation.assignedTo._id), name: conversation.assignedTo.name, role: conversation.assignedTo.role } : null, followUpAt: conversation.followUpAt, followUpNote: conversation.followUpNote || "" });
}

export async function POST(req: Request) {
  const user = await whatsappSession("create"); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})); const phoneNumber = String(body.phoneNumber || "");
  if (!validPhone(phoneNumber)) return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
  await dbConnect();
  if (!(await canAccessWhatsAppPhone(user, phoneNumber))) return NextResponse.json({ error: "This conversation is not assigned to you." }, { status: 403 });
  if (body.action === "note") {
    const text = String(body.text || "").trim();
    if (!text || text.length > 4000 || !/^[\w-]{16,100}$/.test(body.requestId || "")) return NextResponse.json({ error: "Provide a note of up to 4000 characters." }, { status: 400 });
    await WhatsAppPrivateNote.init();
    await WhatsAppPrivateNote.updateOne({ author: user.id, requestId: body.requestId }, { $setOnInsert: { author: user.id, requestId: body.requestId, phoneNumber, body: text } }, { upsert: true });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "followUp") {
    const followUpAt = body.followUpAt ? parseAcademyDateTimeLocal(body.followUpAt) : null;
    if (followUpAt && (!Number.isFinite(followUpAt.getTime()) || followUpAt.getTime() <= Date.now())) return NextResponse.json({ error: "Choose a future follow-up time in IST." }, { status: 400 });
    const result = await WhatsAppConversation.updateOne({ phoneNumber }, { $set: { followUpAt, followUpBy: user.id, followUpNote: String(body.note || "").trim().slice(0, 500), followUpNotifiedAt: null } });
    return NextResponse.json({ ok: Boolean(result.matchedCount) }, { status: result.matchedCount ? 200 : 404 });
  }
  if (!["assign", "link"].includes(body.action) || user.role === "instructor" || !(await canAccessFeature("whatsapp", user, "manage"))) return NextResponse.json({ error: "You need WhatsApp management access for this action." }, { status: 403 });
  if (body.action === "link") {
    const id = body.userId;
    if (id && !Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid LMS user." }, { status: 400 });
    if (id && !(await User.exists({ _id: id }))) return NextResponse.json({ error: "LMS user not found." }, { status: 404 });
    const result = await WhatsAppConversation.updateOne({ phoneNumber }, { $set: { linkedManually: body.automatic !== true, linkedUser: id || null, displayName: String(body.displayName || "").trim().slice(0, 100) } });
    return NextResponse.json({ ok: Boolean(result.matchedCount) }, { status: result.matchedCount ? 200 : 404 });
  }
  const id = body.userId;
  if (id && !Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid assignee." }, { status: 400 });
  const assignee: any = id ? await User.findOne({ _id: id, role: { $in: ["admin", "sub-admin", "instructor"] }, isActive: { $ne: false }, branch: null }).select("name role").lean() : null;
  if (id && !assignee) return NextResponse.json({ error: "Choose an active online admin or coach." }, { status: 400 });
  const result = await WhatsAppConversation.updateOne({ phoneNumber }, { $set: { assignedTo: id || null, assignedBy: user.id, assignedAt: new Date() } });
  if (!result.matchedCount) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  if (assignee?.role === "instructor") {
    const instructorId = new Types.ObjectId(id);
    const definition = FEATURE_DEFINITIONS.find((feature) => feature.key === "whatsapp")!;
    const grant = [{ $set: { key: "whatsapp", status: { $ifNull: ["$status", definition.defaultStatus || "enabled"] }, rolePermissions: { $ifNull: ["$rolePermissions", definition.defaultRolePermissions || {}] }, userOverrides: { $concatArrays: [{ $filter: { input: { $ifNull: ["$userOverrides", []] }, as: "override", cond: { $ne: ["$$override.user", instructorId] } } }, [{ user: instructorId, access: "allow", permissions: ["view", "create"], note: "Assigned WhatsApp conversations only" }]] } } }];
    await FeatureAccess.init();
    try { await FeatureAccess.updateOne({ key: "whatsapp" }, grant, { upsert: true }); }
    catch (error: any) { if (error.code !== 11000) throw error; await FeatureAccess.updateOne({ key: "whatsapp" }, grant); }
  }
  if (assignee && String(assignee._id) !== user.id) {
    const notificationId = new Types.ObjectId(createHash("sha256").update(`wa-assignment:${phoneNumber}:${assignee._id}:${new Date().toISOString().slice(0, 16)}`).digest("hex").slice(0, 24));
    await Notification.updateOne({ _id: notificationId }, { $setOnInsert: { user: assignee._id, type: "whatsapp_assignment", title: "WhatsApp conversation assigned", message: `A WhatsApp conversation with +${phoneNumber} has been assigned to you.`, metadata: { href: `/admin/whatsapp/${phoneNumber}`, phoneNumber } } }, { upsert: true });
  }
  return NextResponse.json({ ok: true });
}
