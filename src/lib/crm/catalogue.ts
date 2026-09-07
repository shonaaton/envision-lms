import "server-only";

import { CrmLeadRecord } from "@/models/CrmLeadRecord";
import { AcademySettings } from "@/models/Fee";
import { STAGE_GROUPS, type StageEntry, type StageGroup } from "@/lib/crm/stageGroups";

/**
 * The pipeline stage catalogue.
 *
 * Kraya's stage names are free text the academy renames in its own UI, so nothing
 * in the portal may hardcode them. Instead every stage the CRM has actually sent
 * is collected from the mirror's own history, and an admin maps each one to a
 * group. The sales counters read groups, never names, which makes a stage rename
 * in Kraya a mapping fix rather than a deploy.
 *
 * This mirrors the approach already taken by /api/admin/crm, which builds the
 * same catalogue from inbound webhook traffic to configure the CRM_STAGE_* vars.
 */

// The vocabulary itself lives in stageGroups.ts so client components can import
// it without pulling this server-only module into the browser bundle.
export { STAGE_GROUPS, STAGE_GROUP_LABELS } from "@/lib/crm/stageGroups";
export type { StageGroup, StageEntry } from "@/lib/crm/stageGroups";

function normalize(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Best guess for a stage the admin has not mapped yet.
 *
 * Order matters: "Demo Completed" contains "demo", so the more specific demo
 * phrases are tested before the generic one. An unrecognised stage lands in
 * "other" and is counted nowhere, which is the safe default - a miscategorised
 * lead is worse than an uncounted one.
 */
export function guessGroup(stage: string): StageGroup {
  const value = normalize(stage);
  if (!value) return "other";
  if (/(current student|converted|enrolled|active student|paid student)/.test(value)) return "converted";
  if (/(no response|not responding|unresponsive|dead|deleted|not interested|no interest|lost|junk|spam|wrong number|duplicate|unqualified|dropped)/.test(value)) return "closed";
  if (/(no show|missed|completed|done)/.test(value) && /(demo|trial)/.test(value)) return "demo_completed";
  if (/(booked|upcoming|scheduled)/.test(value) && /(demo|trial)/.test(value)) return "demo_booked";
  if (/(demo|trial)/.test(value)) return "demo_requested";
  if (/(hot|warm|high intent|priority)/.test(value)) return "hot";
  if (/(qualified|interested|follow up|nurtur)/.test(value)) return "qualified";
  if (/(new|fresh|raw|incoming)/.test(value)) return "new";
  return "other";
}

type StoredMapping = Record<string, { group: StageGroup; order: number }>;

/** Mapping lives on the AcademySettings singleton - one row, admin-editable. */
async function storedMapping(): Promise<StoredMapping> {
  const settings: any = await AcademySettings.findOne({}).select("crmStageMapping").lean();
  const raw = settings?.crmStageMapping;
  if (!raw) return {};
  const entries = raw instanceof Map ? Array.from(raw.entries()) : Object.entries(raw);
  return entries.reduce<StoredMapping>((acc, [stage, value]: [string, any]) => {
    const group = STAGE_GROUPS.includes(value?.group) ? (value.group as StageGroup) : guessGroup(stage);
    acc[stage] = { group, order: Number(value?.order ?? 999) };
    return acc;
  }, {});
}

/**
 * Every stage the CRM has ever sent, with its mapping and how often it appears.
 *
 * Both the current stage and the history are scanned: a lead that arrived already
 * in "Qualified" and never moved has that stage nowhere in its history.
 */
export async function getStageCatalogue(): Promise<StageEntry[]> {
  const [observed, current, mapping] = await Promise.all([
    CrmLeadRecord.aggregate([
      { $unwind: "$stageHistory" },
      { $match: { "stageHistory.stage": { $nin: [null, ""] } } },
      { $group: { _id: "$stageHistory.stage", seen: { $sum: 1 }, lastSeen: { $max: "$stageHistory.at" } } },
    ]).catch(() => [] as any[]),
    CrmLeadRecord.aggregate([
      { $match: { stage: { $nin: [null, ""] } } },
      { $group: { _id: "$stage", seen: { $sum: 1 }, lastSeen: { $max: "$lastEventAt" } } },
    ]).catch(() => [] as any[]),
    storedMapping(),
  ]);

  const merged = new Map<string, { seen: number; lastSeen: Date | null }>();
  for (const row of [...(observed as any[]), ...(current as any[])]) {
    const stage = String(row._id || "");
    if (!stage) continue;
    const existing = merged.get(stage);
    const lastSeen = row.lastSeen ? new Date(row.lastSeen) : null;
    merged.set(stage, {
      seen: (existing?.seen || 0) + Number(row.seen || 0),
      lastSeen: !existing?.lastSeen || (lastSeen && lastSeen > existing.lastSeen) ? lastSeen : existing.lastSeen,
    });
  }
  // A stage an admin mapped but which no lead currently sits in still belongs in
  // the catalogue, or saving the mapping would silently drop it.
  for (const stage of Object.keys(mapping)) {
    if (!merged.has(stage)) merged.set(stage, { seen: 0, lastSeen: null });
  }

  return Array.from(merged.entries())
    .map(([stage, stats]) => ({
      stage,
      group: mapping[stage]?.group ?? guessGroup(stage),
      order: mapping[stage]?.order ?? 999,
      seen: stats.seen,
      lastSeen: stats.lastSeen ? stats.lastSeen.toISOString() : null,
    }))
    .sort((a, b) => a.order - b.order || b.seen - a.seen || a.stage.localeCompare(b.stage));
}

export async function saveStageMapping(entries: Array<{ stage: string; group: StageGroup; order?: number }>) {
  const mapping = entries.reduce<Record<string, { group: StageGroup; order: number }>>((acc, entry, index) => {
    const stage = String(entry.stage || "").trim();
    if (!stage) return acc;
    acc[stage] = {
      group: STAGE_GROUPS.includes(entry.group) ? entry.group : "other",
      order: Number.isFinite(entry.order) ? Number(entry.order) : index,
    };
    return acc;
  }, {});
  await AcademySettings.updateOne({}, { $set: { crmStageMapping: mapping } }, { upsert: true });
  return mapping;
}

/** Stage names belonging to each group, for building Mongo filters. */
export async function stagesByGroup(): Promise<Record<StageGroup, string[]>> {
  const catalogue = await getStageCatalogue();
  return STAGE_GROUPS.reduce<Record<StageGroup, string[]>>((acc, group) => {
    acc[group] = catalogue.filter((entry) => entry.group === group).map((entry) => entry.stage);
    return acc;
  }, {} as Record<StageGroup, string[]>);
}
