import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User, generateUsername } from "@/models/User";
import { addUserSchema } from "@/lib/validation";
import { recordActivity } from "@/lib/activity";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { sendWelcomeEmail } from "@/lib/welcomeEmail";

export const dynamic = "force-dynamic";

async function requireUserManagement(permission: "view" | "create") {
  const session = await auth();
  if (!session?.user) return null;
  if (!(await canAccessFeature("userManagement", session.user as any, permission))) return null;
  return session;
}

function genPassword() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export async function GET(req: Request) {
  const session = await requireUserManagement("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const url = new URL(req.url);
  const role = url.searchParams.get("role"); // student | instructor | admin
  const q = url.searchParams.get("q");
  const status = url.searchParams.get("status"); // active | inactive
  const accountStatus = url.searchParams.get("accountStatus");
  const includeDemo = url.searchParams.get("includeDemo") === "true";
  const tag = url.searchParams.get("tag");
  const sort = url.searchParams.get("sort") || "newest";

  const filter: any = {};
  if (role) filter.role = role;
  if (accountStatus) {
    filter.accountStatus = accountStatus;
  } else if (role === "student" && !includeDemo) {
    filter.accountStatus = { $ne: "demo" };
  }
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (tag) filter.tags = tag;
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { username: { $regex: q, $options: "i" } },
      { countryCode: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ];
  }

  const sortObj: any = sort === "name" ? { name: 1 } : { createdAt: -1 };
  const list = await User.find(filter, { passwordHash: 0 })
    .populate("batches", "name")
    .sort(sortObj)
    .limit(500)
    .lean();
  return NextResponse.json(list, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(req: Request) {
  const session = await requireUserManagement("create");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  try {
    const body = addUserSchema.parse(await req.json());
    await dbConnect();
    const actorIsSuperAdmin = await isSuperAdminSession(session.user as any);
    if ((body.role === "admin" || body.role === "sub-admin") && !actorIsSuperAdmin) {
      return NextResponse.json({ error: "Only Super Admins can create admin or sub-admin accounts." }, { status: 403 });
    }
    const exists = await User.findOne({ email: body.email.toLowerCase() });
    if (exists) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    const username = await generateUsername(body.name);
    const tempPassword = body.password ?? genPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const isDemoStudent = body.role === "student" && body.accountStatus === "demo";
    const u = await User.create({
      ...body,
      email: body.email.toLowerCase(),
      accountStatus: body.role === "student" ? body.accountStatus || "enrolled" : body.accountStatus,
      ...(isDemoStudent ? { demoExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), tags: [...new Set([...(body.tags || []), "demo"])] } : {}),
      username,
      passwordHash,
      tempPassword,
      passwordChangedAt: new Date(),
      passwordChangeSource: "registration",
    });
    await recordActivity({
      actor: actorId,
      targetUser: u._id.toString(),
      type: "user.created",
      label: `Created ${body.role} account for ${u.name}`,
      entityType: "User",
      entityId: u._id.toString(),
      metadata: { role: body.role, username, accountStatus: u.accountStatus },
    });
    const welcomeEmail = await sendWelcomeEmail({
      name: u.name,
      email: u.email,
      phone: u.phone,
      countryCode: u.countryCode,
      username,
      role: body.role,
      temporaryPassword: tempPassword,
      request: req,
    });
    return NextResponse.json({
      id: u._id.toString(),
      username,
      tempPassword,
      welcomeEmailDelivered: welcomeEmail.delivered,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}
