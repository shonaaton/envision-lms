import { Activity } from "@/models/Activity";

type ActivityInput = {
  actor?: string;
  targetUser?: string;
  type: string;
  label: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

export async function recordActivity(input: ActivityInput) {
  try {
    await Activity.create({
      ...input,
      occurredAt: input.occurredAt ?? new Date(),
    });
  } catch {
    // Activity tracking should never block the user action that triggered it.
  }
}
