import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pushLeadStageLabel } from "@/lib/crm/client";
import { ownerKeyToRestore } from "@/lib/crm/ownerRestore";

describe("ownerKeyToRestore", () => {
  const remembered = {
    attributes: { "Sayandeb Lead": "Yes", city: "Kolkata" },
    attributeChangedAt: { "Sayandeb Lead": "2026-09-14T10:00:00Z", city: "2026-09-14T09:00:00Z" },
  };

  it("restores the owner Kraya dropped when the lead moved on", () => {
    const payload = { lead_id: 124, name: "Asha", phone: "+919123456789", stage: "Qualified", city: "Kolkata" };
    expect(ownerKeyToRestore(remembered, payload)).toBe("Sayandeb Lead");
  });

  it("does nothing while Kraya still carries the owner", () => {
    const payload = { lead_id: 124, stage: "Qualified", "Sayandeb Lead": "Yes" };
    expect(ownerKeyToRestore(remembered, payload)).toBe("");
  });

  it("never undoes a reassignment to another salesperson", () => {
    const payload = { lead_id: 124, stage: "Mohammed Leads", "Shazib Lead": "Yes" };
    expect(ownerKeyToRestore(remembered, payload)).toBe("");
  });

  it("restores the newest owner when the lead was reassigned before", () => {
    const record = {
      attributes: { "Sayandeb Lead": "Yes", "Shazib Lead": "Yes" },
      attributeChangedAt: { "Sayandeb Lead": "2026-09-13T10:00:00Z", "Shazib Lead": "2026-09-14T10:00:00Z" },
    };
    expect(ownerKeyToRestore(record, { lead_id: 124, stage: "Qualified" })).toBe("Shazib Lead");
  });

  it("does not guess between two owners set at the same moment", () => {
    const record = {
      attributes: { "Sayandeb Lead": "Yes", "Shazib Lead": "Yes" },
      attributeChangedAt: { "Sayandeb Lead": "2026-09-14T10:00:00Z", "Shazib Lead": "2026-09-14T10:00:00Z" },
    };
    expect(ownerKeyToRestore(record, { lead_id: 124, stage: "Qualified" })).toBe("");
  });

  it("respects an owner Kraya switched off explicitly", () => {
    // The mirror stores "No" once Kraya sends it, so the key no longer names an owner.
    const record = { attributes: { "Sayandeb Lead": "No" }, attributeChangedAt: {} };
    expect(ownerKeyToRestore(record, { lead_id: 124, stage: "Qualified", "Sayandeb Lead": "No" })).toBe("");
  });

  it("has nothing to restore for a lead that never had an owner", () => {
    expect(ownerKeyToRestore({ attributes: { city: "Kolkata" } }, { lead_id: 124, stage: "Qualified" })).toBe("");
  });
});

describe("pushLeadStageLabel with attributes", () => {
  let bodies: any[];

  beforeEach(() => {
    bodies = [];
    process.env.KRAYA_API_URL = "https://api.kraya-ai.com/api/external/testworkspace/leads";
    process.env.KRAYA_API_KEY = "test-api-key";
    vi.stubGlobal("fetch", async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => "{}" } as any;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KRAYA_API_URL;
    delete process.env.KRAYA_API_KEY;
    delete process.env.KRAYA_LEAD_ATTRIBUTES_FIELD;
  });

  const input = {
    crmLeadId: "124",
    name: "Asha",
    phone: "+919123456789",
    stageLabel: "Qualified",
    pipeline: "Leads",
    attributes: { "Sayandeb Lead": "Yes" },
  };

  it("nests attributes under `attributes` by default", async () => {
    await pushLeadStageLabel(input);
    expect(bodies[0]).toMatchObject({ stage: "Qualified", pipeline: "Leads", attributes: { "Sayandeb Lead": "Yes" } });
  });

  it("sends them as plain keys when configured top-level, without clobbering core fields", async () => {
    process.env.KRAYA_LEAD_ATTRIBUTES_FIELD = "top-level";
    await pushLeadStageLabel({ ...input, attributes: { "Sayandeb Lead": "Yes", stage: "Hijack" } });
    expect(bodies[0]["Sayandeb Lead"]).toBe("Yes");
    expect(bodies[0].stage).toBe("Qualified");
    expect(bodies[0].attributes).toBeUndefined();
  });

  it("keeps the lead in its own pipeline instead of the default one", async () => {
    await pushLeadStageLabel({ ...input, pipeline: "Renewals" });
    expect(bodies[0].pipeline).toBe("Renewals");
  });
});
