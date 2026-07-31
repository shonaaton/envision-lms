import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { Activity } from "@/models/Activity";
import { Batch } from "@/models/Batch";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?.toString?.() || String(value || "");
}

function td(value: unknown) {
  return `<td>${String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>`;
}

function workbook(title: string, headers: string[], rows: unknown[][]) {
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><h2>${title}</h2><table border="1"><thead><tr>${headers
    .map((header) => `<th>${header}</th>`)
    .join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map(td).join("")}</tr>`).join("")}</tbody></table></body></html>`;
}

function csv(headers: string[], rows: unknown[][]) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function moduleLabel(type?: string) {
  const safe = String(type || "activity");
  if (safe.includes("attendance")) return "Attendance";
  if (safe.includes("homework")) return "Homework";
  if (safe.includes("pgn")) return "PGN Library";
  if (safe.includes("booking")) return "Self Booking";
  if (safe.includes("payment") || safe.includes("invoice")) return "Fees";
  if (safe.includes("user")) return "Users";
  if (safe.includes("coach")) return "Ask Coach";
  if (safe.includes("square")) return "Square Trainer";
  return "General";
}

function activityContext(item: any, batchNames: string) {
  const metadata = item.metadata || {};
  const parts = [
    metadata.courseName ? `Course: ${metadata.courseName}` : "",
    metadata.batchName && !batchNames.includes(String(metadata.batchName)) ? `Batch: ${metadata.batchName}` : "",
    typeof metadata.records === "number" ? `${metadata.records} records` : "",
    typeof metadata.totalScore === "number" ? `Score: ${metadata.totalScore}` : "",
    typeof metadata.accuracy === "number" ? `Accuracy: ${metadata.accuracy}%` : "",
    item.entityType ? String(item.entityType) : "",
  ].filter(Boolean);
  return parts.join(" - ") || batchNames || "";
}

function filterActivities(activities: any[], batchNameById: Map<string, string>, url: URL) {
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const userType = String(url.searchParams.get("userType") || "");
  const userId = String(url.searchParams.get("userId") || "");
  const batchId = String(url.searchParams.get("batch") || "");
  const courseName = String(url.searchParams.get("course") || "");

  return activities.filter((item: any) => {
    const actor = item.actor || null;
    const target = item.targetUser || null;
    const relatedRoles = [actor?.role, target?.role].filter(Boolean);
    const relatedUserIds = [actor?._id, target?._id].map(objectId).filter(Boolean);
    const actorBatchIds = [...(actor?.batches || []), ...(target?.batches || [])].map(objectId);
    const actorBatchNames = actorBatchIds.map((id) => batchNameById.get(id)).filter(Boolean);
    const haystack = [
      item.label,
      item.type,
      actor?.name,
      actor?.username,
      actor?.email,
      target?.name,
      target?.username,
      target?.email,
      ...actorBatchNames,
      item.metadata?.courseName,
      item.metadata?.batchName,
    ].filter(Boolean).join(" ").toLowerCase();

    if (q && !haystack.includes(q)) return false;
    if (userType && !relatedRoles.includes(userType)) return false;
    if (userId && !relatedUserIds.includes(userId)) return false;
    if (batchId && !actorBatchIds.includes(batchId)) return false;
    if (courseName && String(item.metadata?.courseName || "").trim() !== courseName) return false;
    return true;
  });
}

export async function GET(req: Request) {
  const session = await requireAdminApiAccess(req, "export");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "xls";
  const activityType = String(url.searchParams.get("type") || "");
  const from = url.searchParams.get("from") ? new Date(String(url.searchParams.get("from"))) : null;
  const to = url.searchParams.get("to") ? new Date(String(url.searchParams.get("to"))) : null;
  if (to) to.setHours(23, 59, 59, 999);

  const [activities, batches] = await Promise.all([
    Activity.find({
      ...(activityType ? { type: activityType } : {}),
      ...(from || to ? { occurredAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
    })
      .populate("actor", "name username email role batches")
      .populate("targetUser", "name username email role batches")
      .sort({ occurredAt: -1 })
      .limit(5000)
      .lean(),
    Batch.find({ isActive: { $ne: false } }, { name: 1 }).lean(),
  ]);

  const batchNameById = new Map(batches.map((batch: any) => [objectId(batch._id), String(batch.name || "")]));
  const filtered = filterActivities(activities, batchNameById, url);
  const headers = ["Date & Time", "User", "Username", "Email", "Role", "Activity", "Activity Type", "Module", "Context"];
  const rows = filtered.map((item: any) => {
    const actor = item.actor || item.targetUser || {};
    const actorBatchIds = [...(actor.batches || [])].map(objectId);
    const batchNames = actorBatchIds.map((id) => batchNameById.get(id)).filter(Boolean).join(", ");
    return [
      formatDateTime(item.occurredAt),
      actor.name || "System",
      actor.username || "",
      actor.email || "",
      actor.role || "",
      item.label || "",
      item.type || "",
      moduleLabel(item.type),
      activityContext(item, batchNames),
    ];
  });

  if (format === "csv") {
    return new NextResponse(csv(headers, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"activity-tracker.csv\"",
      },
    });
  }

  return new NextResponse(workbook("Activity Tracker", headers, rows), {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"activity-tracker.xls\"",
    },
  });
}
