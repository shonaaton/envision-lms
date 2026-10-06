import "server-only";

import { dbConnect } from "@/lib/db";
import { crmCallsConfig, crmClientConfig } from "@/lib/crm/client";
import { getStageCatalogue, STAGE_GROUPS } from "@/lib/crm/catalogue";
import { crmStageLabel, type DemoStage } from "@/lib/crm/stages";
import { CrmLead } from "@/models/CrmLead";
import { CrmLeadRecord } from "@/models/CrmLeadRecord";

const STAGES: DemoStage[] = [
  "DEMO_REQUESTED",
  "DEMO_BOOKED",
  "DEMO_NO_SHOW",
  "DEMO_COMPLETED",
  "CURRENT_STUDENT",
  "CLOSED_NO_RESPONSE",
  "CLOSED_DELETED",
];

/**
 * Sync health: is the integration wired up, and what has it been doing.
 *
 * Shared by the admin API route and the admin page so both describe the CRM the
 * same way - the page renders this server-side and the client refetches it.
 */
export async function getCrmHealth() {
  await dbConnect();
  const config = crmClientConfig();
  const calls = crmCallsConfig();

  // Every inbound webhook carries the stage name exactly as the CRM spells it.
  // Collecting the distinct values turns webhook traffic into an authoritative
  // catalogue, so the outbound labels can be configured from observed data
  // instead of being read off the CRM UI.
  const observedStages = await CrmLead.aggregate([
    { $unwind: "$history" },
    { $match: { "history.direction": "inbound", "history.stage": { $nin: [null, ""] } } },
    { $group: { _id: "$history.stage", seen: { $sum: 1 }, lastSeen: { $max: "$history.at" } } },
    { $sort: { lastSeen: -1 } },
    { $project: { _id: 0, stage: "$_id", seen: 1, lastSeen: 1 } },
  ]).catch(() => [] as any[]);

  const [leads, failing, total, catalogue, mirrorCount] = await Promise.all([
    CrmLead.find({}).populate("user", "name email phone accountStatus").sort({ updatedAt: -1 }).limit(50).lean(),
    CrmLead.countDocuments({ lastPushError: { $exists: true, $ne: null } }),
    CrmLead.countDocuments({}),
    getStageCatalogue().catch(() => []),
    CrmLeadRecord.countDocuments({}).catch(() => 0),
  ]);

  return {
    stageGroups: STAGE_GROUPS,
    catalogue,
    mirror: { leads: mirrorCount },
    config: {
      outboundConfigured: config.configured,
      inboundConfigured: Boolean(String(process.env.KRAYA_WEBHOOK_SECRET || "").trim()),
      endpoint: config.configured ? `${config.baseUrl}${config.upsertPath}` : null,
      webhookPath: "/api/crm/kraya/webhook",
      callLoggingConfigured: calls.configured,
      callsEndpoint: calls.configured ? calls.url : null,
      stageLabels: Object.fromEntries(STAGES.map((stage) => [stage, crmStageLabel(stage)])),
    },
    observedStages,
    unmatchedStageLabels: STAGES.map((stage) => crmStageLabel(stage)).filter(
      (label) => !observedStages.some((entry: any) => entry.stage === label),
    ),
    counts: { total, failing },
    leads,
  };
}
