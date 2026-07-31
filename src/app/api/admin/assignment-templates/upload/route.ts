import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { canAccessFeature } from "@/lib/featureAccess";
import { normalizeTopicKey } from "@/lib/assignmentAutomation";
import { assignmentTemplateSchema } from "@/lib/validation";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";

export const dynamic = "force-dynamic";

async function canManageSession(session: any, permission = "view") {
  const role = (session?.user as any)?.role;
  if (role === "instructor") return true;
  if (role === "admin" || role === "sub-admin") return canAccessFeature("homework", session.user as any, permission);
  return false;
}

function cleanTemplate(raw: any) {
  const source = raw?.template && typeof raw.template === "object" ? raw.template : raw;
  const template = { ...(source || {}) };
  delete template._id;
  delete template.id;
  delete template.topicKey;
  delete template.createdAt;
  delete template.updatedAt;
  delete template.createdBy;
  delete template.updatedBy;
  delete template.__v;
  if (template.course && typeof template.course === "object") template.course = String(template.course._id || "");
  if (!template.course) delete template.course;
  if (Array.isArray(template.defaultBatches)) {
    template.defaultBatches = template.defaultBatches.map((item: any) => String(item?._id || item)).filter(Boolean);
  }
  if (Array.isArray(template.defaultStudents)) {
    template.defaultStudents = template.defaultStudents.map((item: any) => String(item?._id || item)).filter(Boolean);
  }
  if (Array.isArray(template.source?.pgnIds)) {
    template.source.pgnIds = template.source.pgnIds.map((item: any) => String(item?._id || item)).filter(Boolean);
  }
  template.source = { kind: "manual", ...(template.source || {}) };
  return template;
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !(await canManageSession(session, "create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const json = await req.json();
    const rawTemplates = Array.isArray(json) ? json : Array.isArray(json.templates) ? json.templates : [json.template || json];
    await dbConnect();

    const imported: any[] = [];
    for (const raw of rawTemplates) {
      const body = assignmentTemplateSchema.parse(cleanTemplate(raw));
      const topicKey = normalizeTopicKey(body.topicName);
      const importBatchId = body.source?.importBatchId;
      const filter: Record<string, any> = importBatchId
        ? { topicKey, "source.importBatchId": importBatchId, isActive: { $ne: false } }
        : { topicKey, title: body.title, isActive: { $ne: false } };
      if (role !== "admin" && role !== "sub-admin") filter.createdBy = (session.user as any).id;
      const existing = await AssignmentTemplate.findOne(filter);
      const payload = {
        ...body,
        topicKey,
        updatedBy: (session.user as any).id,
      };
      const doc = existing
        ? await AssignmentTemplate.findByIdAndUpdate(existing._id, payload, { new: true })
        : await AssignmentTemplate.create({ ...payload, createdBy: (session.user as any).id });
      imported.push({ id: String(doc?._id), title: doc?.title, topicName: doc?.topicName, updated: Boolean(existing) });
    }
    return NextResponse.json({ imported: imported.length, templates: imported });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not upload template" }, { status: 400 });
  }
}
