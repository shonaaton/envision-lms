import "server-only";

import { dbConnect } from "@/lib/db";
import { isCrmCallLoggingConfigured, isCrmConfigured } from "@/lib/crm/client";
import { getStageCatalogue, stagesByGroup } from "@/lib/crm/catalogue";
import type { StageEntry, StageGroup } from "@/lib/crm/stageGroups";
import { Booking } from "@/models/Booking";
import { CrmLeadRecord } from "@/models/CrmLeadRecord";

/** Newest leads first, capped so one query cannot pull the whole pipeline. */
const MAX_LEADS = 500;

export type CrmCall = {
  id: string;
  at: string;
  by: string;
  outcome: string;
  durationMinutes: number;
  note: string;
  /** True once the CRM has this call too. False means it exists only in the portal. */
  syncedToCrm: boolean;
  pushError: string;
};

export type CrmLeadView = {
  id: string;
  crmLeadId: string;
  name: string;
  phone: string;
  email: string;
  pipeline: string;
  stage: string;
  stageGroup: StageGroup;
  stageChangedAt: string | null;
  notes: string;
  attributes: Array<{ label: string; value: string }>;
  firstSeenAt: string | null;
  lastEventAt: string | null;
  lastPushError: string;
  portalUserId: string | null;
  stageHistory: Array<{ stage: string; at: string; source: string; actorName: string }>;
  calls: CrmCall[];
  internalNotes: Array<{ id: string; at: string; by: string; body: string }>;
  lastCallAt: string | null;
};

export type CrmTodayCounters = {
  newLeads: number;
  qualified: number;
  hot: number;
  demoRequested: number;
  demoBooked: number;
  assignedToday: number;
  noShowsToday: number;
  completedToday: number;
  closedToday: number;
};

export type CrmPayload = {
  leads: CrmLeadView[];
  catalogue: StageEntry[];
  today: CrmTodayCounters;
  generatedAt: string;
  /** False when Kraya credentials are missing, so the UI can say why saving fails. */
  outboundConfigured: boolean;
  /** False when the Calls endpoint is unset - calls then stay portal-only. */
  callLoggingConfigured: boolean;
};

function iso(value: any) {
  return value ? new Date(value).toISOString() : null;
}

/** "last_call_at" and "leadSource" both read better as "Last call at" / "Lead source". */
function humanizeKey(key: string) {
  return String(key)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function renderAttributeValue(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function toLeadView(record: any, groupOf: (stage: string) => StageGroup): CrmLeadView {
  const calls = ((record.calls || []) as any[])
    .map((call) => ({
      id: call._id?.toString?.() || "",
      at: iso(call.at) || "",
      by: String(call.byName || "Unknown"),
      outcome: String(call.outcome || "connected"),
      durationMinutes: Number(call.durationMinutes || 0),
      note: String(call.note || ""),
      syncedToCrm: Boolean(call.krayaCallId),
      pushError: String(call.pushError || ""),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));

  return {
    id: record._id?.toString?.() || "",
    crmLeadId: String(record.crmLeadId || ""),
    name: String(record.name || "Unnamed lead"),
    phone: String(record.phone || ""),
    email: String(record.email || ""),
    pipeline: String(record.pipeline || ""),
    stage: String(record.stage || ""),
    stageGroup: groupOf(String(record.stage || "")),
    stageChangedAt: iso(record.stageChangedAt),
    notes: String(record.notes || ""),
    attributes: Object.entries(record.attributes || {})
      .map(([key, value]) => ({ label: humanizeKey(key), value: renderAttributeValue(value) }))
      .filter((entry) => entry.value !== "")
      .sort((a, b) => a.label.localeCompare(b.label)),
    firstSeenAt: iso(record.firstSeenAt),
    lastEventAt: iso(record.lastEventAt),
    lastPushError: String(record.lastPushError || ""),
    portalUserId: record.portalUser ? String(record.portalUser) : null,
    stageHistory: ((record.stageHistory || []) as any[])
      .map((entry) => ({
        stage: String(entry.stage || ""),
        at: iso(entry.at) || "",
        source: String(entry.source || "kraya"),
        actorName: String(entry.actorName || ""),
      }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    calls,
    internalNotes: ((record.internalNotes || []) as any[])
      .map((note) => ({
        id: note._id?.toString?.() || "",
        at: iso(note.at) || "",
        by: String(note.byName || "Unknown"),
        body: String(note.body || ""),
      }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    lastCallAt: calls[0]?.at || null,
  };
}

function dayBounds(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Today's pipeline, from whichever system owns each fact.
 *
 * Lead counts come from the mirror, because Kraya owns lead stages. Demo counts
 * come from `Booking`, because the portal owns the demo funnel - `crm/stages.ts`
 * documents that split, and reading demo state from stage names instead would
 * double-count leads whose stage has not caught up with their booking.
 */
export async function getTodayCounters(): Promise<CrmTodayCounters> {
  const { start, end } = dayBounds();
  const groups = await stagesByGroup();
  const inRange = { $gte: start, $lte: end };

  const closedStages = groups.closed;

  const [newLeads, qualified, hot, closedToday, demoRequested, demoBooked, assignedToday, noShowsToday, completedToday] = await Promise.all([
    CrmLeadRecord.countDocuments({ firstSeenAt: inRange }),
    groups.qualified.length ? CrmLeadRecord.countDocuments({ stage: { $in: groups.qualified } }) : Promise.resolve(0),
    groups.hot.length ? CrmLeadRecord.countDocuments({ stage: { $in: groups.hot } }) : Promise.resolve(0),
    closedStages.length
      ? CrmLeadRecord.countDocuments({
          stage: { $in: closedStages },
          stageChangedAt: inRange,
        })
      : Promise.resolve(0),
    Booking.countDocuments({ bookingType: "demo", demoStatus: { $in: ["REQUESTED", "COACH_ASSIGNED", "RESCHEDULE_REQUESTED"] } }),
    Booking.countDocuments({ bookingType: "demo", demoStatus: { $in: ["APPROVED", "CLASSROOM_CREATED"] } }),
    Booking.countDocuments({ bookingType: "demo", assignedCoachAt: inRange, startAt: { $gte: new Date() } }),
    Booking.countDocuments({ bookingType: "demo", demoStatus: { $in: ["STUDENT_NO_SHOW", "ABSENT"] }, startAt: inRange }),
    Booking.countDocuments({ bookingType: "demo", demoStatus: { $in: ["COMPLETED", "ASSESSMENT_PENDING"] }, startAt: inRange }),
  ]);

  return { newLeads, qualified, hot, demoRequested, demoBooked, assignedToday, noShowsToday, completedToday, closedToday };
}

export async function getCrmPayload(): Promise<CrmPayload> {
  await dbConnect();

  const [records, catalogue, today] = await Promise.all([
    CrmLeadRecord.find({}).sort({ lastEventAt: -1 }).limit(MAX_LEADS).lean(),
    getStageCatalogue(),
    getTodayCounters(),
  ]);

  const groupByStage = new Map(catalogue.map((entry) => [entry.stage, entry.group]));
  const groupOf = (stage: string): StageGroup => groupByStage.get(stage) ?? "other";

  return {
    leads: (records as any[]).map((record) => toLeadView(record, groupOf)),
    catalogue,
    today,
    generatedAt: new Date().toISOString(),
    outboundConfigured: isCrmConfigured(),
    callLoggingConfigured: isCrmCallLoggingConfigured(),
  };
}

