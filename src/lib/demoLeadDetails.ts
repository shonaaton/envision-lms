/**
 * Editing a Demo Leads CRM lead after it was created (2026-11-14, user: "there
 * are no ways to edit any information or add any information of any lead once
 * they are created").
 *
 * Pure rules, shared by the server and its tests: what a valid set of details
 * is, and the one-line summary of what changed that goes into the lead's
 * history. The server adds the checks that need the database (the number is
 * not another lead's, the viewer may touch this lead).
 */

import { CONTACT_INTEREST_VALUES, contactDisplayPhone, contactInterestLabel } from "@/lib/contactEnquiries";
import {
  DEMO_AGE_GROUP_VALUES,
  DEMO_CHILD_LEVEL_VALUES,
  MANUAL_LEAD_SOURCES,
  demoAgeGroupLabel,
  demoChildLevelLabel,
  manualLeadSourceLabel,
} from "@/lib/demoRequest";
import { demoSlotLabel } from "@/lib/demoRequestSlots";
import { exactNationalNumber, exactPhoneNumberProblem } from "@/lib/phoneCountryCodes";

export type LeadDetails = {
  name: string;
  email: string;
  /** "+91" style. */
  countryCode: string;
  /** National digits only. */
  phone: string;
  ageGroup: string;
  childLevel: string;
  interest: string;
  preferredTime: string;
  /** IST day "YYYY-MM-DD" and "HH:mm", both or neither. */
  demoSlotDate: string;
  demoSlotTime: string;
  /** Leads added by hand only; "" on form leads. */
  manualSource: string;
};

export type LeadDetailsInput = Record<keyof LeadDetails, string>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Cleans what the edit form sent. A field the lead may not have (an age, a
 * level) may be left empty; one it must have (name, number) may not. A
 * retired value the lead already carries (an old level) is kept as it is,
 * since the form shows it as the current choice.
 */
export function normalizeLeadDetails(input: LeadDetailsInput, current: Pick<LeadDetails, "ageGroup" | "childLevel" | "interest">, manual: boolean):
  | { ok: true; details: LeadDetails }
  | { ok: false; error: string } {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 120);
  if (name.length < 2) return { ok: false, error: "Enter the parent's name." };

  const countryCode = `+${input.countryCode.replace(/[^\d]/g, "") || "91"}`;
  const problem = exactPhoneNumberProblem(input.phone, countryCode);
  if (problem) return { ok: false, error: problem };
  const phone = exactNationalNumber(input.phone, countryCode);

  const email = input.email.trim().toLowerCase().slice(0, 160);
  if (email && !EMAIL_PATTERN.test(email)) return { ok: false, error: "That email address doesn't look right. Leave it empty if you don't have one." };

  const keep = (value: string, allowed: readonly string[], existing: string) => (!value || allowed.includes(value) || value === existing ? value : null);
  const ageGroup = keep(input.ageGroup, DEMO_AGE_GROUP_VALUES, current.ageGroup);
  const childLevel = keep(input.childLevel, DEMO_CHILD_LEVEL_VALUES, current.childLevel);
  const interest = keep(input.interest, CONTACT_INTEREST_VALUES, current.interest);
  if (ageGroup === null || childLevel === null || interest === null) return { ok: false, error: "One of the choices isn't on the list. Reload the page and try again." };
  if (!interest) return { ok: false, error: "Choose online classes or a centre." };

  const demoSlotDate = input.demoSlotDate.trim();
  const demoSlotTime = input.demoSlotTime.trim();
  if (Boolean(demoSlotDate) !== Boolean(demoSlotTime)) return { ok: false, error: "Give the demo slot both a date and a time, or clear both." };
  if (demoSlotDate && (!DATE_KEY.test(demoSlotDate) || !TIME.test(demoSlotTime))) return { ok: false, error: "The demo slot date or time isn't valid." };

  let manualSource = "";
  if (manual) {
    manualSource = MANUAL_LEAD_SOURCES.some((item) => item.value === input.manualSource) ? input.manualSource : "";
    if (!manualSource) return { ok: false, error: "Choose how the family reached us." };
  }

  return {
    ok: true,
    details: {
      name,
      email,
      countryCode,
      phone,
      ageGroup,
      childLevel,
      interest,
      preferredTime: input.preferredTime.trim().slice(0, 120),
      demoSlotDate,
      demoSlotTime,
      manualSource,
    },
  };
}

const EMPTY = "(empty)";

/** "Email: (empty) → a@b.com" for every field that changed, in form order. */
export function describeLeadDetailChanges(before: LeadDetails, after: LeadDetails): string[] {
  const show = (value: string) => value || EMPTY;
  const rows: Array<[string, string, string]> = [
    ["Name", before.name, after.name],
    ["Email", before.email, after.email],
    ["WhatsApp", before.phone ? contactDisplayPhone(before.countryCode, before.phone) : "", contactDisplayPhone(after.countryCode, after.phone)],
    ["Child's age", before.ageGroup ? demoAgeGroupLabel(before.ageGroup) : "", after.ageGroup ? demoAgeGroupLabel(after.ageGroup) : ""],
    ["Child's level", before.childLevel ? demoChildLevelLabel(before.childLevel) : "", after.childLevel ? demoChildLevelLabel(after.childLevel) : ""],
    ["Class", before.interest ? contactInterestLabel(before.interest) : "", contactInterestLabel(after.interest)],
    ["Time to call", before.preferredTime, after.preferredTime],
    ["Demo slot", demoSlotLabel(before.demoSlotDate, before.demoSlotTime), demoSlotLabel(after.demoSlotDate, after.demoSlotTime)],
    ["How they reached us", before.manualSource ? manualLeadSourceLabel(before.manualSource) : "", after.manualSource ? manualLeadSourceLabel(after.manualSource) : ""],
  ];
  return rows.filter(([, from, to]) => from !== to).map(([label, from, to]) => `${label}: ${show(from)} → ${show(to)}`);
}
