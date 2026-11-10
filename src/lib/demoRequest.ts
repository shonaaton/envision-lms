/**
 * The vocabulary of the free demo form: read by the public form, the API
 * validator and the sales inbox, so a label changes in one place.
 */

export const DEMO_REQUEST_KIND = "demo_request";

/** Where the form sends a family once their request is in, and the sessionStorage key that carries it there. */
export const DEMO_THANKS_PATH = "/book-free-demo-class/thank-you";
export const DEMO_THANKS_STORAGE_KEY = "envision:demo-request";

export const DEMO_AGE_GROUPS = [
  { value: "5-8", label: "5–8 years" },
  { value: "9-12", label: "9–12 years" },
  { value: "13-15", label: "13–15 years" },
] as const;

export const DEMO_CHILD_LEVELS = [
  { value: "fresher", label: "Fresher" },
  { value: "intermediate", label: "Intermediate" },
  { value: "plays_tournaments", label: "Plays tournaments" },
  { value: "fide_rated", label: "FIDE rated" },
] as const;

/** Levels the form offered before 2026-11-10. Saved requests still carry them. */
const RETIRED_CHILD_LEVELS: Record<string, string> = { beginner: "Beginner", advanced: "Advanced" };

export const DEMO_AGE_GROUP_VALUES = DEMO_AGE_GROUPS.map((item) => item.value) as [string, ...string[]];
export const DEMO_CHILD_LEVEL_VALUES = DEMO_CHILD_LEVELS.map((item) => item.value) as [string, ...string[]];

export function demoAgeGroupLabel(value?: string | null) {
  return DEMO_AGE_GROUPS.find((item) => item.value === value)?.label || "Not specified";
}

export function demoChildLevelLabel(value?: string | null) {
  return DEMO_CHILD_LEVELS.find((item) => item.value === value)?.label || RETIRED_CHILD_LEVELS[String(value)] || "Not specified";
}

/**
 * Where a form lead has got to in the Demo Leads CRM (/sales/leads).
 * A lead saved before the CRM existed has no stage and reads as "new".
 */
export const DEMO_LEAD_STAGES = [
  { value: "new", label: "New lead" },
  { value: "qualified", label: "Qualified" },
  { value: "demo_taken", label: "Demo taken" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
] as const;

export type DemoLeadStage = (typeof DEMO_LEAD_STAGES)[number]["value"];
export const DEMO_LEAD_STAGE_VALUES = DEMO_LEAD_STAGES.map((item) => item.value) as [DemoLeadStage, ...DemoLeadStage[]];

export function demoLeadStage(value?: string | null): DemoLeadStage {
  return DEMO_LEAD_STAGE_VALUES.find((stage) => stage === value) || "new";
}

export function demoLeadStageLabel(value?: string | null) {
  const stage = demoLeadStage(value);
  return DEMO_LEAD_STAGES.find((item) => item.value === stage)!.label;
}

/** The Meta event id shared by the browser pixel and the server event, so one lead counts once. */
export function demoRequestEventId(id: string) {
  return `demo_request_${id}`;
}
