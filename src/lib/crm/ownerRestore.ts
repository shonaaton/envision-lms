import "server-only";

import { pushLeadStageLabel } from "@/lib/crm/client";
import { ownerSignals } from "@/lib/crm/leadOwner";
import { customAttributes } from "@/lib/crm/mirror";
import { CrmLeadRecord } from "@/models/CrmLeadRecord";

/**
 * Putting the salesperson attribute back when Kraya drops it.
 *
 * Kraya's triggers set `"Sayandeb Lead" = "Yes"` when a lead enters that
 * salesperson's stage, but the attribute disappears from the lead once it moves
 * on (to Qualified, say) - no trigger removes it, Kraya just loses it. The mirror
 * merges attributes and never deletes them, so the portal still knows the owner
 * and writes it back through the Leads API.
 *
 * Runs from the webhook after the mirror has taken the payload. Never throws.
 */

/**
 * The owner key to write back, or "" when there is nothing to restore.
 *
 * `record` is the mirror after this payload was merged, `payload` is what Kraya
 * actually sent. A key the mirror remembers but the payload lacks is one Kraya
 * dropped. An explicit "No" from Kraya is not a drop - the mirror stores it, the
 * key stops counting as an owner, and nothing is restored.
 */
export function ownerKeyToRestore(
  record: { attributes?: Record<string, unknown> | null; attributeChangedAt?: Record<string, unknown> | null },
  payload: Record<string, any>,
) {
  // Kraya still names an owner, so it has one - even if it is not the one the
  // portal remembers. A reassignment must not be undone.
  if (ownerSignals(customAttributes(payload)).length) return "";

  const remembered = ownerSignals(record.attributes, record.attributeChangedAt);
  if (!remembered.length) return "";
  const newest = remembered.filter((signal) => signal.changedAt === remembered[0].changedAt);
  // Two owner keys set at the same moment: which one is current is unknown, and
  // writing the wrong one back hands the lead to someone else.
  return newest.length === 1 ? newest[0].key : "";
}

export type OwnerRestoreResult = { restored: boolean; key?: string; reason?: string };

export function isOwnerRestoreEnabled() {
  return String(process.env.CRM_RESTORE_LEAD_OWNER ?? "").trim().toLowerCase() !== "false";
}

export async function restoreLeadOwnerAttribute(input: { crmLeadId: string; payload: Record<string, any> }): Promise<OwnerRestoreResult> {
  if (!isOwnerRestoreEnabled()) return { restored: false, reason: "CRM_RESTORE_LEAD_OWNER is false." };
  const { crmLeadId, payload } = input;

  try {
    const record: any = await CrmLeadRecord.findOne({ crmLeadId })
      .select("name phone email stage pipeline attributes attributeChangedAt")
      .lean();
    if (!record) return { restored: false, reason: "Lead is not in the mirror." };

    const key = ownerKeyToRestore(record, payload);
    if (!key) return { restored: false };

    const stage = String(payload?.stage || record.stage || "").trim();
    const phone = String(payload?.phone || record.phone || "").trim();
    if (!stage || !phone) {
      const reason = "Cannot restore the owner attribute: Kraya's upsert needs the lead's phone and stage.";
      await CrmLeadRecord.updateOne({ crmLeadId }, { $set: { ownerRestoreError: reason } }).catch(() => undefined);
      return { restored: false, key, reason };
    }

    // One write-back per key per stage. Kraya fires a webhook for the portal's own
    // upsert too; if the attribute did not stick, that echo lacks it again, and
    // without this claim the two would loop.
    const claimed = await CrmLeadRecord.findOneAndUpdate(
      { crmLeadId, $or: [{ ownerRestoreKey: { $ne: key } }, { ownerRestoreStage: { $ne: stage } }] },
      { $set: { ownerRestoreKey: key, ownerRestoreStage: stage, ownerRestoredAt: new Date() }, $unset: { ownerRestoreError: "" } },
    ).lean();
    if (!claimed) {
      const reason = `Kraya still has no "${key}" after the portal wrote it back. Check KRAYA_LEAD_ATTRIBUTES_FIELD matches the Leads API.`;
      await CrmLeadRecord.updateOne({ crmLeadId }, { $set: { ownerRestoreError: reason } }).catch(() => undefined);
      return { restored: false, key, reason };
    }

    const push = await pushLeadStageLabel({
      crmLeadId,
      name: record.name || payload?.name,
      phone,
      email: record.email,
      // The lead's current stage and pipeline, sent back unchanged: the upsert
      // needs a stage, and anything else would move the lead.
      stageLabel: stage,
      pipeline: String(payload?.pipeline || record.pipeline || "").trim() || undefined,
      attributes: { [key]: String(record.attributes?.[key] ?? "Yes") },
    });

    if (!push.ok) {
      // Release the claim so the next webhook for this lead can try again.
      await CrmLeadRecord.updateOne(
        { crmLeadId, ownerRestoreKey: key, ownerRestoreStage: stage },
        { $set: { ownerRestoreError: push.reason }, $unset: { ownerRestoreKey: "", ownerRestoreStage: "" } },
      ).catch(() => undefined);
      return { restored: false, key, reason: push.reason };
    }
    return { restored: true, key };
  } catch (error) {
    console.error("Lead owner attribute restore failed", error);
    return { restored: false, reason: "Restore failed." };
  }
}
