import { describe, expect, it } from "vitest";
import { offlineLeadOutcomePayload, parseOfflineLeadOutcomePayload } from "./offlineLeadRules";

describe("offline lead WhatsApp outcomes", () => {
  const id = "64b8f1f1a1b2c3d4e5f60718";

  it("round trips the two supported outcomes", () => {
    expect(parseOfflineLeadOutcomePayload(offlineLeadOutcomePayload(id, "converted"))).toEqual({ outcome: "converted", leadId: id });
    expect(parseOfflineLeadOutcomePayload(offlineLeadOutcomePayload(id, "lost"))).toEqual({ outcome: "lost", leadId: id });
  });

  it("rejects unrelated and malformed replies", () => {
    expect(parseOfflineLeadOutcomePayload("Admission taken")).toBeNull();
    expect(parseOfflineLeadOutcomePayload("offline_lead:open:64b8f1f1a1b2c3d4e5f60718")).toBeNull();
    expect(parseOfflineLeadOutcomePayload("offline_lead:lost:123")).toBeNull();
  });
});

