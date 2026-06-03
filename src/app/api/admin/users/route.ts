import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User, generateUsername } from "@/models/User";
import { addUserSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function genPassword() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export async function GET(req: Request) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const url = new URL(req.url);
  const role = url.searchParams.get("role"); // student | instructor | admin
  const q = url.searchParams.get("q");
  const status = url.searchParams.get("status"); // active | inactive
  const tag = url.searchParams.get("tag");
  const sort = url.searchParams.get("sort") || "newest";

  const filter: any = {};
  if (role) filter.role = role;
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (tag) filter.tags = tag;
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { username: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ];
  }

  const sortObj: any = sort === "name" ? { name: 1 } : { createdAt: -1 };
  const list = await User.find(filter, { passwordHash: 0 })
    .populate("batches", "name")
    .sort(sortObj)
    .limit(500)
    .lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = addUserSchema.parse(await req.json());
    await dbConnect();
    const exists = await User.findOne({ email: body.email.toLowerCase() });
    if (exists) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    const username = await generateUsername(body.name);
    const tempPassword = body.password ?? genPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const u = await User.create({
      ...body,
      email: body.email.toLowerCase(),
      username,
      passwordHash,
    });
    return NextResponse.json({
      id: u._id.toString(),
      username,
      tempPassword: body.password ? undefined : tempPassword, // surface auto-generated password once
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}
