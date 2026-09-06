import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyCrmStage, crmStageLabel, demoStatusToStage } from "@/lib/crm/stages";
import { crmClientConfig, pushLeadStage } from "@/lib/crm/client";
import { crmPhoneNumber, emailKey, phoneKey, phoneVariants } from "@/lib/crm/identity";

const ENV_KEYS = ["CRM_STAGE_DEMO_REQUESTED", "CRM_DEMO_STAGES", "CRM_CONVERTED_STAGES", "CRM_CLOSED_STAGES", "CRM_DEFAULT_COUNTRY_CODE"];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("demoStatusToStage", () => {
  it("keeps a lead at Demo Requested until an admin approves it", () => {
    expect(demoStatusToStage("REQUESTED")).toBe("DEMO_REQUESTED");
    expect(demoStatusToStage("COACH_ASSIGNED")).toBe("DEMO_REQUESTED");
    expect(demoStatusToStage("RESCHEDULE_REQUESTED")).toBe("DEMO_REQUESTED");
  });

  it("moves to Booked only once the classroom exists", () => {
    expect(demoStatusToStage("APPROVED")).toBe("DEMO_BOOKED");
    expect(demoStatusToStage("CLASSROOM_CREATED")).toBe("DEMO_BOOKED");
  });

  it("maps both absence states to the no-show stage", () => {
    expect(demoStatusToStage("STUDENT_NO_SHOW")).toBe("DEMO_NO_SHOW");
    expect(demoStatusToStage("ABSENT")).toBe("DEMO_NO_SHOW");
  });

  it("treats a delivered class as completed even before coach feedback lands", () => {
    expect(demoStatusToStage("ASSESSMENT_PENDING")).toBe("DEMO_COMPLETED");
    expect(demoStatusToStage("COMPLETED")).toBe("DEMO_COMPLETED");
  });

  it("maps conversion to Current Student", () => {
    expect(demoStatusToStage("CONVERTED")).toBe("CURRENT_STUDENT");
  });

  it("never pushes closures, since sales owns the dead reason", () => {
    expect(demoStatusToStage("CLOSED")).toBeNull();
    expect(demoStatusToStage("CANCELLED")).toBeNull();
    expect(demoStatusToStage(undefined)).toBeNull();
  });
});

describe("classifyCrmStage", () => {
  it("recognises demo stages despite renaming and truncation", () => {
    expect(classifyCrmStage("Demo Requested")).toBe("demo");
    expect(classifyCrmStage("Demo Booked/Upcoming Demo")).toBe("demo");
    expect(classifyCrmStage("Demo Class No Shows/Missed")).toBe("demo");
    expect(classifyCrmStage("demo  completed")).toBe("demo");
  });

  it("recognises the converted stage", () => {
    expect(classifyCrmStage("Current Student")).toBe("converted");
    expect(classifyCrmStage("Enrolled")).toBe("converted");
  });

  it("recognises the live Envision pipeline stage names", () => {
    expect(classifyCrmStage("Requested for Demo Class")).toBe("demo");
    expect(classifyCrmStage("Demo Booked")).toBe("demo");
    expect(classifyCrmStage("Demo Class Missed")).toBe("demo");
    expect(classifyCrmStage("Demo Class Taken")).toBe("demo");
    expect(classifyCrmStage("Current Student")).toBe("converted");
  });

  it("closes only on stages that actually mean the lead is dead", () => {
    expect(classifyCrmStage("No Response")).toBe("closed");
    expect(classifyCrmStage("Deleted")).toBe("closed");
    expect(classifyCrmStage("Dead")).toBe("closed");
    expect(classifyCrmStage("Not Interested")).toBe("closed");
    expect(classifyCrmStage("Wrong Number")).toBe("closed");
  });

  it("never closes a demo for ordinary early-funnel movement", () => {
    // Moving a lead forward through the funnel must not cancel a live demo.
    expect(classifyCrmStage("New Lead")).toBe("ignore");
    expect(classifyCrmStage("Qualified")).toBe("ignore");
    expect(classifyCrmStage("Hot Leads")).toBe("ignore");
    expect(classifyCrmStage("Fresh Lead")).toBe("ignore");
  });

  it("ignores an unrecognised stage rather than guessing", () => {
    expect(classifyCrmStage("Some New Stage")).toBe("ignore");
    expect(classifyCrmStage("")).toBe("ignore");
  });

  it("lets exact stage names be pinned from the environment", () => {
    process.env.CRM_DEMO_STAGES = "Trial Scheduled,Follow Up Demo";
    process.env.CRM_CONVERTED_STAGES = "Joined Batch";
    process.env.CRM_CLOSED_STAGES = "Archived";
    expect(classifyCrmStage("Trial Scheduled")).toBe("demo");
    expect(classifyCrmStage("Joined Batch")).toBe("converted");
    expect(classifyCrmStage("Archived")).toBe("closed");
  });

  it("makes a pinned closure list authoritative", () => {
    process.env.CRM_CLOSED_STAGES = "Archived";
    // "Dead" matches a built-in pattern, but an explicit list overrides it so
    // the closing stages are exactly the ones the academy chose.
    expect(classifyCrmStage("Dead")).toBe("ignore");
    expect(classifyCrmStage("Archived")).toBe("closed");
  });
});

describe("crmStageLabel", () => {
  it("falls back to the default pipeline label", () => {
    expect(crmStageLabel("DEMO_REQUESTED")).toBe("Demo Requested");
  });

  it("is overridable without a redeploy", () => {
    process.env.CRM_STAGE_DEMO_REQUESTED = "Requested For Demo Class";
    expect(crmStageLabel("DEMO_REQUESTED")).toBe("Requested For Demo Class");
  });
});

describe("contact matching", () => {
  it("reduces every phone spelling the two systems produce to one key", () => {
    expect(phoneKey("+91-9123456789")).toBe("9123456789");
    expect(phoneKey("9123456789")).toBe("9123456789");
    expect(phoneKey("919123456789")).toBe("9123456789");
    expect(phoneKey("+91 91234 56789")).toBe("9123456789");
    expect(phoneKey("91", "9123456789")).toBe("9123456789");
  });

  it("returns an empty key rather than a false match for junk input", () => {
    expect(phoneKey("")).toBe("");
    expect(phoneKey("not a phone")).toBe("");
  });

  it("lowercases and trims emails", () => {
    expect(emailKey("  John.Doe@Example.COM ")).toBe("john.doe@example.com");
  });

  it("offers every stored spelling when searching portal accounts", () => {
    const variants = phoneVariants("+91-9123456789");
    expect(variants).toContain("9123456789");
    expect(variants).toContain("+919123456789");
    expect(variants).toContain("919123456789");
  });

  it("builds a CRM phone without doubling the country code", () => {
    expect(crmPhoneNumber({ phone: "9123456789", countryCode: "+91" })).toBe("+919123456789");
    expect(crmPhoneNumber({ phone: "919123456789", countryCode: "91" })).toBe("+919123456789");
    expect(crmPhoneNumber({ phone: "9123456789" })).toBe("+919123456789");
    expect(crmPhoneNumber({ phone: "" })).toBe("");
  });
});

describe("Kraya Leads API contract", () => {
  const API_URL = "https://api.kraya-ai.com/api/external/testworkspace/leads";
  let calls: Array<{ url: string; init: any }>;

  beforeEach(() => {
    calls = [];
    process.env.KRAYA_API_URL = API_URL;
    process.env.KRAYA_API_KEY = "test-api-key";
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ lead_id: 124, message: "Lead added successfully" }),
      } as any;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KRAYA_API_URL;
    delete process.env.KRAYA_API_KEY;
    delete process.env.KRAYA_LEAD_UPSERT_PATH;
  });

  it("uses the API URL verbatim, because it is already the upsert endpoint", async () => {
    await pushLeadStage({ name: "Asha Roy", phone: "+919123456789", stage: "DEMO_REQUESTED" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API_URL);
    expect(calls[0].init.method).toBe("POST");
  });

  it("sends the API key in the documented header", () => {
    const config = crmClientConfig();
    expect(config.keyHeader).toBe("X-KRAYA-API-KEY");
    expect(config.upsertPath).toBe("");
    expect(config.upsertMethod).toBe("POST");
  });

  it("sends every field the Leads API documents", async () => {
    await pushLeadStage({
      name: "Asha Roy",
      phone: "+919123456789",
      email: "asha@example.com",
      stage: "DEMO_BOOKED",
      note: "Portal demo update",
    });
    const body = JSON.parse(calls[0].init.body);
    expect(body).toMatchObject({
      name: "Asha Roy",
      phone: "+919123456789",
      email: "asha@example.com",
      stage: "Demo Booked/Upcoming Demo",
      pipeline: "Leads",
      notes: "Portal demo update",
    });
    expect(calls[0].init.headers["X-KRAYA-API-KEY"]).toBe("test-api-key");
  });

  it("returns the lead_id so it can be stored against the portal user", async () => {
    const result = await pushLeadStage({ name: "Asha Roy", phone: "+919123456789", stage: "DEMO_COMPLETED" });
    expect(result).toMatchObject({ ok: true, status: 200, leadId: "124" });
  });

  it("skips instead of sending a request the CRM would reject", async () => {
    const result = await pushLeadStage({ name: "No Phone", email: "x@example.com", stage: "DEMO_REQUESTED" });
    expect(result).toMatchObject({ ok: false, skipped: true });
    expect(calls).toHaveLength(0);
  });

  it("does not retry a 400 validation error", async () => {
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      calls.push({ url, init });
      return { ok: false, status: 400, text: async () => "phone is required" } as any;
    });
    const result = await pushLeadStage({ name: "Asha Roy", phone: "+919123456789", stage: "DEMO_REQUESTED" });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("stays inert when the integration is not configured", async () => {
    delete process.env.KRAYA_API_URL;
    const result = await pushLeadStage({ name: "Asha Roy", phone: "+919123456789", stage: "DEMO_REQUESTED" });
    expect(result).toMatchObject({ ok: false, skipped: true });
    expect(calls).toHaveLength(0);
  });
});
