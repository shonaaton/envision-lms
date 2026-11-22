import { NextResponse } from "next/server";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { AssignmentAutomationLog } from "@/models/AssignmentTemplate";
import {
  eventFilter,
  eventGroupCounts,
  istText,
  parseEventFilters,
  populateEvents,
  serializeEvent,
  STATUS_LABELS,
} from "@/lib/homeworkAutomationEvents";
import { buildSpreadsheet, resolveFormat, spreadsheetHeaders } from "@/lib/spreadsheet";
import { automationEventAccess } from "./access";
import "@/models/Classroom";
import "@/models/Homework";
import "@/models/User";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
const EXPORT_LIMIT = 5000;
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

export async function GET(req: Request) {
  const access = await automationEventAccess();
  if (!access.canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const params = new URL(req.url).searchParams;
  const filters = parseEventFilters(params);
  const ids = (params.get("ids") || "").split(",").filter((id) => objectId.safeParse(id).success);
  const filter = ids.length ? { _id: { $in: ids } } : await eventFilter(filters);

  if (params.get("download")) {
    const format = resolveFormat(params.get("download"), "xlsx");
    const logs: any[] = await populateEvents(AssignmentAutomationLog.find(filter).sort({ createdAt: -1 }).limit(EXPORT_LIMIT)).lean();
    const rows = logs.map(serializeEvent).map((row) => [
      istText(row.createdAt),
      STATUS_LABELS[row.status] || row.status,
      row.resolved ? `Assigned "${row.resolved.homeworkTitle || row.resolved.templateTitle}"${row.resolved.by ? ` by ${row.resolved.by}` : ""}` : row.actionable ? "Open" : "",
      row.topicName,
      row.classroomTitle,
      row.templateTitle,
      row.homeworkTitle,
      row.message,
      row.cleared ? istText(row.cleared.at) : "",
    ]);
    const body = buildSpreadsheet(format, [
      {
        name: "Automation events",
        columns: [
          { label: "When (IST)" },
          { label: "Status" },
          { label: "Follow-up" },
          { label: "Topic" },
          { label: "Class" },
          { label: "Template" },
          { label: "Homework" },
          { label: "Message" },
          { label: "Cleared (IST)" },
        ],
        rows,
      },
    ]);
    const stamp = istText(new Date()).slice(0, 10);
    return new NextResponse(new Uint8Array(body), { headers: spreadsheetHeaders(format, `homework-automation-events-${filters.group}-${stamp}`, body) });
  }

  const page = Math.max(1, Number(params.get("page") || 1) || 1);
  const [logs, total, counts] = await Promise.all([
    populateEvents(AssignmentAutomationLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)).lean(),
    AssignmentAutomationLog.countDocuments(filter),
    eventGroupCounts(filters),
  ]);
  return NextResponse.json({
    events: (logs as any[]).map(serializeEvent),
    total,
    page,
    hasMore: page * PAGE_SIZE < total,
    counts,
    canManage: access.canManage,
  });
}

const actionSchema = z.object({
  action: z.enum(["clear", "restore"]),
  // Either the picked rows, or every row the current filters match.
  ids: z.array(objectId).max(1000).optional(),
  filters: z.record(z.any()).optional(),
});

export async function POST(req: Request) {
  const access = await automationEventAccess();
  if (!access.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the request." }, { status: 400 });
  const { action, ids, filters } = parsed.data;
  if (!ids?.length && !filters) return NextResponse.json({ error: "Nothing selected." }, { status: 400 });
  await dbConnect();

  const scope = ids?.length
    ? { _id: { $in: ids } }
    : await eventFilter({ ...parseEventFilters(filters || {}), cleared: action === "restore" });
  const result =
    action === "clear"
      ? await AssignmentAutomationLog.updateMany({ $and: [scope, { clearedAt: null }] }, { $set: { clearedAt: new Date(), clearedBy: access.actorId } })
      : await AssignmentAutomationLog.updateMany({ $and: [scope, { clearedAt: { $ne: null } }] }, { $unset: { clearedAt: 1, clearedBy: 1 } });
  return NextResponse.json({ updated: result.modifiedCount });
}
