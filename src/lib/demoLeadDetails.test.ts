import { describe, expect, it } from "vitest";
import { describeLeadDetailChanges, normalizeLeadDetails, type LeadDetails, type LeadDetailsInput } from "@/lib/demoLeadDetails";

const saved: LeadDetails = {
  name: "Priya Sharma",
  email: "",
  countryCode: "+91",
  phone: "9000000001",
  ageGroup: "",
  childLevel: "beginner", // retired level, still on older leads
  interest: "online",
  preferredTime: "Evening",
  demoSlotDate: "",
  demoSlotTime: "",
  manualSource: "",
};

const form = (change: Partial<LeadDetailsInput> = {}): LeadDetailsInput => ({ ...saved, ...change });

describe("normalizeLeadDetails", () => {
  it("accepts the lead as it is, including a retired level it already has", () => {
    const result = normalizeLeadDetails(form(), saved, false);
    expect(result).toEqual({ ok: true, details: saved });
  });

  it("fills in empty fields and tidies the name and number", () => {
    const result = normalizeLeadDetails(form({ name: "  Priya   Sharma ", email: "Priya@Example.com ", phone: "+91 90000 00001", ageGroup: "9-12", childLevel: "fresher" }), saved, false);
    expect(result.ok && result.details).toMatchObject({ name: "Priya Sharma", email: "priya@example.com", phone: "9000000001", ageGroup: "9-12", childLevel: "fresher" });
  });

  it("refuses a missing name, a short number, a bad email or a half demo slot", () => {
    expect(normalizeLeadDetails(form({ name: " " }), saved, false).ok).toBe(false);
    expect(normalizeLeadDetails(form({ phone: "900000001" }), saved, false).ok).toBe(false);
    expect(normalizeLeadDetails(form({ email: "not-an-email" }), saved, false).ok).toBe(false);
    expect(normalizeLeadDetails(form({ demoSlotDate: "2026-11-20" }), saved, false).ok).toBe(false);
    expect(normalizeLeadDetails(form({ demoSlotDate: "2026-11-20", demoSlotTime: "25:00" }), saved, false).ok).toBe(false);
  });

  it("refuses a choice that is not on the list and is not the lead's own", () => {
    expect(normalizeLeadDetails(form({ childLevel: "grandmaster" }), saved, false).ok).toBe(false);
  });

  it("asks a hand-added lead how the family reached us, and ignores it on a form lead", () => {
    expect(normalizeLeadDetails(form(), saved, true).ok).toBe(false);
    const manual = normalizeLeadDetails(form({ manualSource: "walk_in" }), saved, true);
    expect(manual.ok && manual.details.manualSource).toBe("walk_in");
    const formLead = normalizeLeadDetails(form({ manualSource: "walk_in" }), saved, false);
    expect(formLead.ok && formLead.details.manualSource).toBe("");
  });
});

describe("describeLeadDetailChanges", () => {
  it("lists only what changed, with readable before and after", () => {
    const after = { ...saved, email: "p@example.com", ageGroup: "9-12", phone: "9123456789", demoSlotDate: "2026-11-21", demoSlotTime: "17:00" };
    expect(describeLeadDetailChanges(saved, after)).toEqual([
      "Email: (empty) → p@example.com",
      "WhatsApp: +91 9000000001 → +91 9123456789",
      "Child's age: (empty) → 9–12 years",
      expect.stringMatching(/^Demo slot: \(empty\) → .*21.*Nov.*5(:00)? ?PM IST$/i),
    ]);
  });

  it("is empty when nothing changed", () => {
    expect(describeLeadDetailChanges(saved, { ...saved })).toEqual([]);
  });
});
