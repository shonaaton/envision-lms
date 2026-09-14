import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { buildLeadStageEvent, metaLeadIdFrom, metaPhone } from "@/lib/metaCrmEvents";

const config = {
  enabled: true,
  datasetId: "924225047079586",
  accessToken: "token",
  leadEventSource: "Kraya",
  testEventCode: "",
  leadIdAttribute: "",
};

const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

describe("metaPhone", () => {
  it("adds the default country code to a bare national number", () => {
    expect(metaPhone("9123456789")).toBe("919123456789");
  });

  it("strips the formatting Kraya stores and keeps an existing country code", () => {
    expect(metaPhone("+91-9123456789")).toBe("919123456789");
    expect(metaPhone("+1 (415) 555-0100")).toBe("14155550100");
  });

  it("drops a trunk zero rather than hashing it", () => {
    expect(metaPhone("09123456789")).toBe("919123456789");
  });
});

describe("metaLeadIdFrom", () => {
  it("never mistakes Kraya's small lead id for Meta's", () => {
    expect(metaLeadIdFrom({ lead_id: "124" })).toBe("");
  });

  it("reads Meta's id from a known attribute or a configured one", () => {
    expect(metaLeadIdFrom({ fb_lead_id: "1234567890123456" })).toBe("1234567890123456");
    expect(metaLeadIdFrom({ ad_lead: "12345678901234567" }, "ad_lead")).toBe("12345678901234567");
  });
});

describe("buildLeadStageEvent", () => {
  const at = new Date();

  it("builds the Conversion Leads shape with the stage as the event name", () => {
    const built = buildLeadStageEvent(
      { crmLeadId: "124", stage: "Demo Booked", at, email: " Parent@Example.com ", phone: "+91-9123456789", attributes: {} },
      config,
    );
    if ("skip" in built) throw new Error(built.skip);
    const event = JSON.parse(built.body).data[0];
    expect(event.action_source).toBe("system_generated");
    expect(event.custom_data).toEqual({ event_source: "crm", lead_event_source: "Kraya" });
    expect(event.event_name).toBe("Demo Booked");
    expect(event.event_time).toBe(Math.floor(at.getTime() / 1000));
    expect(event.user_data.em).toEqual([sha("parent@example.com")]);
    expect(event.user_data.ph).toEqual([sha("919123456789")]);
    expect(event.user_data.lead_id).toBeUndefined();
  });

  it("writes Meta's lead id as a bare integer without losing precision", () => {
    const built = buildLeadStageEvent(
      { crmLeadId: "124", stage: "Qualified", at, phone: "9123456789", attributes: { meta_lead_id: "12345678901234567" } },
      config,
    );
    if ("skip" in built) throw new Error(built.skip);
    expect(built.body).toContain('"lead_id":12345678901234567');
  });

  it("skips a lead with nothing Meta can match on", () => {
    expect(buildLeadStageEvent({ crmLeadId: "124", stage: "Qualified", at, attributes: {} }, config)).toHaveProperty("skip");
  });

  it("skips a move older than Meta accepts", () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(buildLeadStageEvent({ crmLeadId: "124", stage: "Qualified", at: old, phone: "9123456789" }, config)).toHaveProperty("skip");
  });

  it("gives the same move the same event id so a retry is deduplicated", () => {
    const a = buildLeadStageEvent({ crmLeadId: "124", stage: "Qualified", at, phone: "9123456789" }, config);
    const b = buildLeadStageEvent({ crmLeadId: "124", stage: "Qualified", at, phone: "9123456789" }, config);
    if ("skip" in a || "skip" in b) throw new Error("unexpected skip");
    expect(a.eventId).toBe(b.eventId);
  });
});
