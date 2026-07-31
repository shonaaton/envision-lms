import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { canAccessFeature } from "@/lib/featureAccess";
import { normalizeTopicKey } from "@/lib/assignmentAutomation";
import { assignmentTemplateSchema } from "@/lib/validation";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import "@/models/Batch";
import "@/models/Course";
import "@/models/PGN";
import "@/models/User";

export const dynamic = "force-dynamic";

async function canManageSession(session: any, permission = "view") {
  const role = (session?.user as any)?.role;
  if (role === "instructor") return true;
  if (role === "admin" || role === "sub-admin") return canAccessFeature("homework", session.user as any, permission);
  return false;
}

function filterFor(session: any, url: URL) {
  const role = (session.user as any).role;
  const q = String(url.searchParams.get("q") || "").trim();
  const status = String(url.searchParams.get("status") || "").trim();
  const filter: Record<string, any> = role === "admin" || role === "sub-admin" ? {} : { createdBy: (session.user as any).id };
  if (status === "active") filter.isActive = true;
  else if (status !== "all") filter.isActive = { $ne: false };
  if (status === "review") filter.linkStatus = { $ne: "linked" };
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: regex }, { topicName: regex }, { courseName: regex }, { levelName: regex }];
  }
  return filter;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !(await canManageSession(session, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const url = new URL(req.url);
  const list = await AssignmentTemplate.find(filterFor(session, url))
    .populate("course", "name")
    .populate("defaultBatches", "name")
    .populate("source.pgnIds", "title sourceFileName")
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(await canManageSession(session, "create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await dbConnect();
    const body = assignmentTemplateSchema.parse(await req.json());
    const created = await AssignmentTemplate.create({
      ...body,
      topicKey: normalizeTopicKey(body.topicName),
      createdBy: (session.user as any).id,
      updatedBy: (session.user as any).id,
    });
    return NextResponse.json(created);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Bad request" }, { status: 400 });
  }
}
