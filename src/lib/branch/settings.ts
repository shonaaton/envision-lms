import { dbConnect } from "@/lib/db";
import { BranchSettings } from "@/models/Branch";
import { BranchError } from "./errors";
import { BRANCH_CAPABILITIES, DEFAULT_ROLE_ACCESS, rupeesToPaise, type BranchCapability, type RoleAccessOverrides } from "./rules";
import type { BranchKey } from "./scope";

/**
 * A branch's fee and messaging settings. No Node built-ins here: the scheduled
 * jobs read these (reminders, late fees, monthly reports).
 */

export type BranchSettingsView = {
  admissionFee: number; // paise
  proRataFirstMonth: boolean;
  planDiscounts: { quarterly: number; half_yearly: number; yearly: number }; // percent
  lateFee: number; // paise; 0 = off
  lateFeeAfterDay: number;
  remindersEnabled: boolean;
  reminderDays: number[];
  receiptPrefix: string;
  parentReportEnabled: boolean;
  absenceAlertAfter: number;
};

export const DEFAULT_BRANCH_SETTINGS: BranchSettingsView = {
  admissionFee: 0,
  proRataFirstMonth: false,
  planDiscounts: { quarterly: 0, half_yearly: 0, yearly: 0 },
  lateFee: 0,
  lateFeeAfterDay: 10,
  remindersEnabled: false,
  reminderDays: [1, 5, 10],
  receiptPrefix: "BB",
  parentReportEnabled: false,
  absenceAlertAfter: 3,
};

export async function getBranchSettings(branch: BranchKey): Promise<BranchSettingsView> {
  await dbConnect();
  const doc: any = await BranchSettings.findOne({ branch }).lean();
  if (!doc) return { ...DEFAULT_BRANCH_SETTINGS };
  return {
    admissionFee: doc.admissionFee ?? 0,
    proRataFirstMonth: Boolean(doc.proRataFirstMonth),
    planDiscounts: {
      quarterly: doc.planDiscounts?.quarterly ?? 0,
      half_yearly: doc.planDiscounts?.half_yearly ?? 0,
      yearly: doc.planDiscounts?.yearly ?? 0,
    },
    lateFee: doc.lateFee ?? 0,
    lateFeeAfterDay: doc.lateFeeAfterDay ?? 10,
    remindersEnabled: Boolean(doc.remindersEnabled),
    reminderDays: Array.isArray(doc.reminderDays) && doc.reminderDays.length ? doc.reminderDays : [1, 5, 10],
    receiptPrefix: doc.receiptPrefix || "BB",
    parentReportEnabled: Boolean(doc.parentReportEnabled),
    absenceAlertAfter: doc.absenceAlertAfter ?? 3,
  };
}

const whole = (value: unknown, min: number, max: number, label: string) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new BranchError(`${label} must be a whole number from ${min} to ${max}.`);
  return number;
};

/** Amounts come in as rupees, like every branch form. */
export async function saveBranchSettings(branch: BranchKey, input: any, actorId: string) {
  await dbConnect();
  const admissionFee = rupeesToPaise(input?.admissionFee ?? 0);
  if (admissionFee === null) throw new BranchError("Enter the admission fee in rupees.");
  const lateFee = rupeesToPaise(input?.lateFee ?? 0);
  if (lateFee === null) throw new BranchError("Enter the late fee in rupees.");
  const reminderDays = [...new Set<number>((Array.isArray(input?.reminderDays) ? input.reminderDays : []).map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 28)
    .sort((a, b) => a - b);
  if (input?.remindersEnabled && !reminderDays.length) throw new BranchError("Pick at least one reminder day (1 to 28).");
  const receiptPrefix = String(input?.receiptPrefix ?? "BB").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(receiptPrefix)) throw new BranchError("The receipt prefix is 1 to 6 letters or digits.");

  await BranchSettings.updateOne(
    { branch },
    {
      $set: {
        admissionFee,
        proRataFirstMonth: Boolean(input?.proRataFirstMonth),
        planDiscounts: {
          quarterly: whole(input?.planDiscounts?.quarterly ?? 0, 0, 50, "The quarterly plan discount"),
          half_yearly: whole(input?.planDiscounts?.half_yearly ?? 0, 0, 50, "The half-yearly plan discount"),
          yearly: whole(input?.planDiscounts?.yearly ?? 0, 0, 50, "The yearly plan discount"),
        },
        lateFee,
        lateFeeAfterDay: whole(input?.lateFeeAfterDay ?? 10, 1, 28, "The late fee day"),
        remindersEnabled: Boolean(input?.remindersEnabled),
        reminderDays: reminderDays.length ? reminderDays : [1, 5, 10],
        receiptPrefix,
        parentReportEnabled: Boolean(input?.parentReportEnabled),
        absenceAlertAfter: whole(input?.absenceAlertAfter ?? 3, 2, 10, "The absence alert"),
        updatedBy: actorId,
      },
    },
    { upsert: true }
  );
  return getBranchSettings(branch);
}

/** Feature access: what managers and coaches may do here (null = the defaults). */
export async function getRoleAccess(branch: BranchKey): Promise<RoleAccessOverrides> {
  await dbConnect();
  const doc: any = await BranchSettings.findOne({ branch }).select("roleAccess").lean();
  return doc?.roleAccess || null;
}

export async function saveRoleAccess(branch: BranchKey, input: any, actorId: string) {
  await dbConnect();
  const pick = (value: unknown) =>
    [...new Set((Array.isArray(value) ? value : []).map(String))].filter(
      (capability): capability is BranchCapability => (BRANCH_CAPABILITIES as string[]).includes(capability) && capability !== "staff" && capability !== "activity"
    );
  const roleAccess = {
    manager: input?.manager ? pick(input.manager) : DEFAULT_ROLE_ACCESS.manager,
    coach: input?.coach ? pick(input.coach) : DEFAULT_ROLE_ACCESS.coach,
  };
  await BranchSettings.updateOne({ branch }, { $set: { roleAccess, updatedBy: actorId } }, { upsert: true });
  return roleAccess;
}
