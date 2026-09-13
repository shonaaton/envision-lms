import { afterEach, describe, expect, it } from "vitest";
import { matchLeadOwner, ownerSignals, type LeadOwnerCandidate } from "@/lib/crm/leadOwner";

const staff: LeadOwnerCandidate[] = [
  { userId: "sayandeb", name: "Sayandeb", email: "sayanenvisionchess@gmail.com", isSales: true },
  { userId: "shahzib", name: "Mohammed Shahzib", email: "mohammedshazib@gmail.com", isSales: true },
  { userId: "sayan", name: "Sayan Bose", email: "sayanthsbose@gmail.com", isSales: false },
  { userId: "admin", name: "Sayantan", email: "sayantanchandra12@gmail.com", isSales: false },
];

afterEach(() => {
  delete process.env.CRM_LEAD_OWNER_ATTRIBUTES;
});

describe("matchLeadOwner", () => {
  it("reads the owner from Kraya's attribute name, not its value", () => {
    expect(matchLeadOwner({ "Sayandeb Lead": "40", city: "Kolkata" }, staff)?.owner.userId).toBe("sayandeb");
    expect(matchLeadOwner({ "Shazib Lead": "40" }, staff)?.owner.userId).toBe("shahzib");
  });

  it("accepts the key however the payload spells it", () => {
    expect(matchLeadOwner({ shazib_lead: 40 }, staff)?.owner.userId).toBe("shahzib");
    expect(matchLeadOwner({ SayandebLead: "40" }, staff)?.owner.userId).toBe("sayandeb");
  });

  it("does not route Sayandeb's lead to Sayan or Sayantan", () => {
    const match = matchLeadOwner({ "Sayandeb Lead": "40" }, staff);
    expect(match?.owner.userId).toBe("sayandeb");
    expect(match?.attributeKey).toBe("Sayandeb Lead");
  });

  it("ignores owner keys that are present but switched off", () => {
    expect(matchLeadOwner({ "Shazib Lead": "0" }, staff)).toBeNull();
    expect(matchLeadOwner({ "Shazib Lead": "" }, staff)).toBeNull();
    expect(ownerSignals({ "Lead Source": "Facebook", "Shazib Lead": null })).toEqual([
      expect.objectContaining({ key: "Lead Source" }),
    ]);
    expect(matchLeadOwner({ "Lead Source": "Facebook" }, staff)).toBeNull();
  });

  it("gives a reassigned lead to whoever was set most recently", () => {
    const attributes = { "Sayandeb Lead": "40", "Shazib Lead": "40" };
    const changedAt = { "Sayandeb Lead": "2026-09-01T10:00:00Z", "Shazib Lead": "2026-09-10T10:00:00Z" };
    expect(matchLeadOwner(attributes, staff, changedAt)?.owner.userId).toBe("shahzib");
  });

  it("refuses to guess when two owners were set at the same moment", () => {
    expect(matchLeadOwner({ "Sayandeb Lead": "40", "Shazib Lead": "40" }, staff)).toBeNull();
  });

  it("uses a pinned email from CRM_LEAD_OWNER_ATTRIBUTES", () => {
    process.env.CRM_LEAD_OWNER_ATTRIBUTES = "Priority Bucket=sayanenvisionchess@gmail.com";
    expect(matchLeadOwner({ priority_bucket: "40" }, staff)?.owner.userId).toBe("sayandeb");
  });
});
