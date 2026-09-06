/**
 * Single source of truth for how portal demo states map to CRM pipeline stages.
 *
 * The portal owns every stage up to and including "demo completed" / "no show".
 * Conversion is the one transition the CRM owns: when sales moves a lead into
 * "Current Student", the portal follows.
 */

export type DemoStage =
  | "DEMO_REQUESTED"
  | "DEMO_BOOKED"
  | "DEMO_NO_SHOW"
  | "DEMO_COMPLETED"
  | "CURRENT_STUDENT";

/**
 * Labels pushed to the CRM. These must match the pipeline stage names exactly or
 * the CRM will reject the update, so every one is overridable from the
 * environment without a redeploy.
 */
const DEFAULT_STAGE_LABELS: Record<DemoStage, string> = {
  DEMO_REQUESTED: "Demo Requested",
  DEMO_BOOKED: "Demo Booked/Upcoming Demo",
  DEMO_NO_SHOW: "Demo Class No Shows/Missed",
  DEMO_COMPLETED: "Demo Completed",
  CURRENT_STUDENT: "Current Student",
};

const STAGE_ENV_KEYS: Record<DemoStage, string> = {
  DEMO_REQUESTED: "CRM_STAGE_DEMO_REQUESTED",
  DEMO_BOOKED: "CRM_STAGE_DEMO_BOOKED",
  DEMO_NO_SHOW: "CRM_STAGE_DEMO_NO_SHOW",
  DEMO_COMPLETED: "CRM_STAGE_DEMO_COMPLETED",
  CURRENT_STUDENT: "CRM_STAGE_CURRENT_STUDENT",
};

export function crmStageLabel(stage: DemoStage) {
  return String(process.env[STAGE_ENV_KEYS[stage]] || "").trim() || DEFAULT_STAGE_LABELS[stage];
}

export function crmPipelineName() {
  return String(process.env.CRM_PIPELINE_NAME || "").trim() || "Leads";
}

/**
 * Portal `Booking.demoStatus` -> CRM stage. Returns null for states the portal
 * deliberately does not push: closures and cancellations belong to sales, who
 * own the "why" (dead / no response / wrong number).
 */
export function demoStatusToStage(demoStatus?: string | null): DemoStage | null {
  switch (String(demoStatus || "")) {
    case "REQUESTED":
    case "COACH_ASSIGNED":
    case "RESCHEDULE_REQUESTED":
      return "DEMO_REQUESTED";
    case "APPROVED":
    case "CLASSROOM_CREATED":
      return "DEMO_BOOKED";
    case "STUDENT_NO_SHOW":
    case "ABSENT":
      return "DEMO_NO_SHOW";
    case "ASSESSMENT_PENDING":
    case "COMPLETED":
      return "DEMO_COMPLETED";
    case "CONVERTED":
      return "CURRENT_STUDENT";
    default:
      return null;
  }
}

function normalizeStageName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function envStageList(key: string) {
  return String(process.env[key] || "")
    .split(",")
    .map((entry) => normalizeStageName(entry))
    .filter(Boolean);
}

export type InboundStageKind = "demo" | "converted" | "closed";

const CONVERTED_PATTERNS = ["current student", "converted", "enrolled", "active student", "paid student"];

/**
 * Classify an arbitrary CRM stage name arriving over the webhook.
 *
 * Matching is fuzzy on purpose: pipeline labels get renamed and truncated in the
 * CRM UI, and a mislabelled stage must never silently close a live demo. Exact
 * names can be pinned with CRM_DEMO_STAGES / CRM_CONVERTED_STAGES when needed.
 */
export function classifyCrmStage(stageName: string): InboundStageKind {
  const normalized = normalizeStageName(stageName);
  if (!normalized) return "demo";

  const pinnedConverted = envStageList("CRM_CONVERTED_STAGES");
  const pinnedDemo = envStageList("CRM_DEMO_STAGES");
  if (pinnedConverted.includes(normalized)) return "converted";
  if (pinnedDemo.includes(normalized)) return "demo";

  if (CONVERTED_PATTERNS.some((pattern) => normalized.includes(pattern))) return "converted";
  if (normalized.includes("demo") || normalized.includes("trial")) return "demo";
  return "closed";
}
