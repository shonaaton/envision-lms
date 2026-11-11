import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { buildDemoLeadMetaEvent, demoConvertedEventId, demoSlotEventId, metaBrowserIds } from "@/lib/demoLeadMetaEvents";

const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const lead = { name: "Asha  Sen Gupta", countryCode: "+91", phone: "9000000001", metaFbp: "fb.1.111.222", metaFbc: "fb.1.111.click" };
const at = new Date("2026-11-11T10:00:00Z");

function onlyEvent(payload: Record<string, unknown>) {
  return (payload.data as Array<Record<string, any>>)[0];
}

describe("campaign pixel events for demo leads", () => {
  it("sends a salesperson's stage change as a CRM event, matched on what the form saved", () => {
    const event = onlyEvent(buildDemoLeadMetaEvent({ lead, eventName: "CompleteRegistration", eventId: demoConvertedEventId("abc"), at }));
    expect(event).toMatchObject({
      event_name: "CompleteRegistration",
      event_id: "demo_converted_abc",
      event_time: 1794391200,
      action_source: "system_generated",
      custom_data: { event_source: "crm" },
    });
    expect(event.user_data).toEqual({
      ph: sha("919000000001"),
      fn: sha("asha"),
      ln: sha("sen gupta"),
      fbp: "fb.1.111.222",
      fbc: "fb.1.111.click",
    });
  });

  it("sends the family's own action as a website event with their browser's details", () => {
    const event = onlyEvent(
      buildDemoLeadMetaEvent({
        lead,
        eventName: "Schedule",
        eventId: demoSlotEventId("abc"),
        at,
        browser: { userAgent: "UA", ip: "1.2.3.4", sourceUrl: "https://x.test/book-free-demo-class/thank-you", fbp: "fb.1.new", fbc: "" },
      }),
    );
    expect(event.action_source).toBe("website");
    expect(event.event_id).toBe("demo_slot_abc");
    expect(event.event_source_url).toBe("https://x.test/book-free-demo-class/thank-you");
    expect(event.custom_data).toBeUndefined();
    // The live cookie wins; the click id falls back to the one saved with the form.
    expect(event.user_data).toMatchObject({ client_user_agent: "UA", client_ip_address: "1.2.3.4", fbp: "fb.1.new", fbc: "fb.1.111.click" });
  });

  it("never sends the phone number or name in the clear, and leaves out what it does not have", () => {
    const payload = buildDemoLeadMetaEvent({ lead: { name: "Asha", countryCode: "+91", phone: "9000000001" }, eventName: "Lead", eventId: "x", at });
    const text = JSON.stringify(payload);
    expect(text).not.toContain("9000000001");
    expect(text.toLowerCase()).not.toContain("asha");
    const userData = onlyEvent(payload).user_data;
    expect(userData.ln).toBeUndefined();
    expect("fbp" in userData).toBe(false);
    expect(payload.test_event_code).toBeUndefined();
  });

  it("adds the test code only when one is set", () => {
    expect(buildDemoLeadMetaEvent({ lead, eventName: "Lead", eventId: "x", testEventCode: "TEST123" }).test_event_code).toBe("TEST123");
  });

  it("reads the pixel's cookies off a request", () => {
    const request = new Request("https://x.test", { headers: { cookie: "a=1; _fbp=fb.1.9.9; _fbc=fb.1.9.click; b=2" } });
    expect(metaBrowserIds(request)).toEqual({ fbp: "fb.1.9.9", fbc: "fb.1.9.click" });
    expect(metaBrowserIds(new Request("https://x.test"))).toEqual({ fbp: "", fbc: "" });
  });
});
