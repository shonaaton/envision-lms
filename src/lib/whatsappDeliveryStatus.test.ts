import { describe, expect, it } from "vitest";
import { whatsAppDeliveryUpdate } from "./whatsappDeliveryStatus";
describe("WhatsApp delivery receipts", () => {
  it("ignores late sent/failed receipts after delivery or read", () => {
    expect(whatsAppDeliveryUpdate({ id: "wamid-1", status: "sent" })?.filter.status.$nin).toEqual(["delivered", "read", "failed"]);
    expect(whatsAppDeliveryUpdate({ id: "wamid-1", status: "failed" })?.filter.status.$nin).toEqual(["delivered", "read"]);
  });
  it("stores the actual failure reason while preserving original attachment data", () => {
    expect(whatsAppDeliveryUpdate({ id: "wamid-1", status: "failed", errors: [{ message: "Recipient unavailable" }] })?.update.$set).toMatchObject({ status: "failed", uncertain: false, error: "Recipient unavailable", "rawPayload.deliveryStatus": { id: "wamid-1" } });
    expect(whatsAppDeliveryUpdate({ id: "wamid-1", status: "read" })?.update.$set).not.toHaveProperty("rawPayload");
  });
  it("ignores missing ids and unknown receipt types", () => {
    expect(whatsAppDeliveryUpdate({ status: "read" })).toBeNull();
    expect(whatsAppDeliveryUpdate({ id: "wamid-1", status: "other" })).toBeNull();
  });
});
