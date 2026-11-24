export const OFFLINE_LEAD_ASSIGNMENT_TEMPLATE = "offline_lead_assignment";
export const OFFLINE_LEAD_REMINDER_TEMPLATE = "offline_lead_followup";

const PREFIX = "offline_lead:";

export function offlineLeadOutcomePayload(leadId: string, outcome: "converted" | "lost") {
  return `${PREFIX}${outcome}:${leadId}`;
}

export function parseOfflineLeadOutcomePayload(value?: string | null) {
  const match = String(value || "").trim().match(/^offline_lead:(converted|lost):([a-f0-9]{24})$/i);
  return match ? { outcome: match[1].toLowerCase() as "converted" | "lost", leadId: match[2] } : null;
}

