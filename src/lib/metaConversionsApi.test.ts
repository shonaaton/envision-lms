import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMetaLeadEvent, fbcFromClickId, metaRequestContext, sendMetaLead } from "@/lib/metaConversionsApi";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const base = {
  eventId: "demo_request_abc",
  eventTime: 1_763_000_000,
  eventSourceUrl: "https://envisionchessacademy.com/book-free-demo-class/thank-you",
  context: {},
};

describe("metaRequestContext", () => {
  it("reads the pixel cookies, user agent and a real IP", () => {
    const request = new Request("https://example.com", {
      headers: { cookie: "a=1; _fbp=fb.1.111.222; _fbc=fb.1.333.CLICK", "user-agent": "Phone" },
    });
    expect(metaRequestContext(request, "49.37.1.2")).toEqual({ ip: "49.37.1.2", userAgent: "Phone", fbp: "fb.1.111.222", fbc: "fb.1.333.CLICK" });
  });

  it("drops the 'unknown' placeholder IP", () => {
    expect(metaRequestContext(new Request("https://example.com"), "unknown").ip).toBe("");
  });
});

describe("buildMetaLeadEvent", () => {
  it("hashes email, phone and first name as Meta requires", async () => {
    const event = await buildMetaLeadEvent({ ...base, email: " Mina@Gmail.com ", phone: "+91 98765 43210", name: "Mina Madaan" });
    expect(event.user_data.em).toEqual([hash("mina@gmail.com")]);
    expect(event.user_data.ph).toEqual([hash("919876543210")]);
    expect(event.user_data.fn).toEqual([hash("mina")]);
    expect(event).toMatchObject({ event_name: "Lead", event_id: "demo_request_abc", action_source: "website" });
  });

  it("builds fbc from the saved fbclid when the browser had no _fbc cookie", async () => {
    const event = await buildMetaLeadEvent({ ...base, fbclid: "CLICK", clickedAt: 1_763_000_000_000 });
    expect(event.user_data.fbc).toBe("fb.1.1763000000000.CLICK");
  });

  it("prefers the browser's own _fbc cookie", async () => {
    const event = await buildMetaLeadEvent({ ...base, fbclid: "OLD", context: { fbc: "fb.1.5.NEW" } });
    expect(event.user_data.fbc).toBe("fb.1.5.NEW");
  });

  it("leaves out what it does not have", async () => {
    const event = await buildMetaLeadEvent({ ...base, email: "", phone: "", name: "" });
    expect(event.user_data).toEqual({});
    expect(fbcFromClickId("")).toBe("");
  });
});

describe("sendMetaLead", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends nothing without an access token", async () => {
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await sendMetaLead({ ...base, phone: "919876543210" })).toMatchObject({ ok: false, skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts one Lead to the campaign dataset, with the test code when set", async () => {
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "token");
    vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "TEST123");
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await sendMetaLead({ ...base, phone: "919876543210" })).toEqual({ ok: true, eventsReceived: 1 });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/graph\.facebook\.com\/v\d+\.\d+\/1084805421260422\/events$/);
    const body = JSON.parse(String(init.body));
    expect(body.test_event_code).toBe("TEST123");
    expect(body.data).toHaveLength(1);
    expect(body.data[0].event_id).toBe("demo_request_abc");
  });

  it("reports Meta's refusal", async () => {
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "token");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid token" } }), { status: 400 })));
    expect(await sendMetaLead(base)).toEqual({ ok: false, reason: "Invalid token" });
  });
});
