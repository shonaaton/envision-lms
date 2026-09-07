/**
 * Stage-group vocabulary shared by the server and the browser.
 *
 * Split out of `catalogue.ts` because that module is `server-only` - it queries
 * Mongo - while the sales and admin screens need these labels to render. Same
 * reason `feesAnalyticsTypes.ts` exists alongside `feesAnalytics.ts`.
 */

export const STAGE_GROUPS = [
  "new",
  "qualified",
  "hot",
  "demo_requested",
  "demo_booked",
  "demo_completed",
  "converted",
  "closed",
  "other",
] as const;

export type StageGroup = (typeof STAGE_GROUPS)[number];

export const STAGE_GROUP_LABELS: Record<StageGroup, string> = {
  new: "New leads",
  qualified: "Qualified",
  hot: "Hot leads",
  demo_requested: "Demo requested",
  demo_booked: "Demo booked",
  demo_completed: "Demo completed",
  converted: "Converted",
  closed: "No response / dead / deleted",
  other: "Other",
};

export type StageEntry = {
  stage: string;
  group: StageGroup;
  order: number;
  seen: number;
  lastSeen: string | null;
};
