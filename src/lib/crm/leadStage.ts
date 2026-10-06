import "server-only";

import { emailKey, phoneKey } from "@/lib/crm/identity";
import { classifyCrmStage } from "@/lib/crm/stages";
import { CrmLeadRecord } from "@/models/CrmLeadRecord";

export type StudentCrmStage = {
  stage: string;
  stageChangedAt?: Date;
  /** The stage writes the lead off - Dead, No Response, Lost, Demo Closed and the like. See classifyCrmStage. */
  closed: boolean;
};

/**
 * Each student's current stage in Kraya, from the mirrored CRM lead. The linked
 * account wins, then phone, then email - the same strength order the lead-owner
 * lookup uses (demoLeadOwner.ts), newest lead first when a family has several.
 *
 * Kraya keeps one lead per phone number, so a family is one lead there even
 * when it holds two portal accounts (siblings, or a parent who signed up twice).
 * The lead can only be linked to one of them; the others still follow its stage
 * by phone, or a Dead family would stay open on every account but one.
 */
export async function crmStagesForStudents(students: any[]): Promise<Map<string, StudentCrmStage>> {
  const result = new Map<string, StudentCrmStage>();
  const list = [...new Map(students.filter((student) => student?._id).map((student) => [String(student._id), student])).values()];
  if (!list.length) return result;

  const phones = Array.from(new Set(list.map((student) => phoneKey(student.phone)).filter(Boolean)));
  const emails = Array.from(new Set(list.map((student) => emailKey(student.email)).filter(Boolean)));
  const or: any[] = [{ portalUser: { $in: list.map((student) => student._id) } }];
  if (phones.length) or.push({ phoneKey: { $in: phones } });
  if (emails.length) or.push({ emailKey: { $in: emails } });

  const records: any[] = await CrmLeadRecord.find({ $or: or, stage: { $nin: [null, ""] } })
    .select("portalUser phoneKey emailKey stage stageChangedAt lastEventAt")
    .sort({ lastEventAt: -1 })
    .lean();
  if (!records.length) return result;

  for (const student of list) {
    const studentId = String(student._id);
    const phone = phoneKey(student.phone);
    const email = emailKey(student.email);
    const record =
      records.find((row) => String(row.portalUser || "") === studentId) ||
      (phone ? records.find((row) => row.phoneKey === phone) : undefined) ||
      (email ? records.find((row) => row.emailKey === email) : undefined);
    if (!record) continue;
    const stage = String(record.stage || "");
    result.set(studentId, { stage, stageChangedAt: record.stageChangedAt || undefined, closed: classifyCrmStage(stage) === "closed" });
  }
  return result;
}
