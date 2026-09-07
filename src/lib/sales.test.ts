import { afterEach, describe, expect, it } from "vitest";
import { crmCallsConfig, krayaCallStatus } from "@/lib/crm/client";
import { guessGroup } from "@/lib/crm/catalogue";
import { customAttributes } from "@/lib/crm/mirror";
import { parseCsv } from "@/lib/crm/import";
import { isIndividualBatch } from "@/lib/batchVacancy";

describe("isIndividualBatch", () => {
  it("treats the PIC prefix as an individual class", () => {
    expect(isIndividualBatch("PIC Aarav")).toBe(true);
    expect(isIndividualBatch("pic aarav")).toBe(true);
    expect(isIndividualBatch("  PIC Riya Mon 5pm")).toBe(true);
  });

  it("leaves group batches alone", () => {
    expect(isIndividualBatch("Sunday Morning A")).toBe(false);
    expect(isIndividualBatch("Advanced Batch 3")).toBe(false);
  });

  it("does not match a batch that merely starts with those letters", () => {
    // "Picasso" is a plausible batch name and is not an individual class.
    expect(isIndividualBatch("Picasso Beginners")).toBe(false);
    expect(isIndividualBatch("PICNIC Special")).toBe(false);
  });
});

describe("guessGroup", () => {
  it("classifies the academy's documented pipeline stages", () => {
    expect(guessGroup("New Leads")).toBe("new");
    expect(guessGroup("Qualified")).toBe("qualified");
    expect(guessGroup("Hot Leads")).toBe("hot");
    expect(guessGroup("Demo Requested")).toBe("demo_requested");
    expect(guessGroup("Demo Booked/Upcoming Demo")).toBe("demo_booked");
    expect(guessGroup("Demo Completed")).toBe("demo_completed");
    expect(guessGroup("Current Student")).toBe("converted");
    expect(guessGroup("No Response")).toBe("closed");
    expect(guessGroup("Deleted")).toBe("closed");
  });

  it("puts a demo no-show in the completed bucket, not the requested one", () => {
    // Every demo stage name contains "demo", so the specific phrases have to be
    // tested before the generic one or a no-show would read as a fresh request.
    expect(guessGroup("Demo Class No Shows/Missed")).toBe("demo_completed");
  });

  it("falls back to `other` rather than guessing, so nothing is miscounted", () => {
    expect(guessGroup("Sponsorship Enquiry")).toBe("other");
    expect(guessGroup("")).toBe("other");
  });
});

describe("customAttributes", () => {
  it("keeps every key the portal does not recognise", () => {
    const attributes = customAttributes({
      lead_id: 123,
      name: "Aarav",
      phone: "+91-9123456789",
      email: "a@example.com",
      stage: "Hot Leads",
      pipeline: "Leads",
      notes: "Wants weekend slots",
      event_type: "update",
      last_call_at: "2026-09-07T10:00:00Z",
      source: "Instagram",
    });
    expect(attributes).toEqual({ last_call_at: "2026-09-07T10:00:00Z", source: "Instagram" });
  });

  it("drops empty values so the detail view is not full of blank rows", () => {
    expect(customAttributes({ lead_id: 1, source: "", owner: null, city: "Kolkata" })).toEqual({ city: "Kolkata" });
  });
});

describe("parseCsv", () => {
  it("handles quoted fields, embedded commas and escaped quotes", () => {
    const rows = parseCsv('id,name,notes\r\n1,"Doe, Jane","said ""call back"""\r\n2,Ravi,\r\n');
    expect(rows).toEqual([
      ["id", "name", "notes"],
      ["1", "Doe, Jane", 'said "call back"'],
      ["2", "Ravi", ""],
    ]);
  });

  it("skips blank lines rather than importing empty leads", () => {
    expect(parseCsv("id,name\n\n1,Aarav\n\n")).toEqual([
      ["id", "name"],
      ["1", "Aarav"],
    ]);
  });
});

describe("krayaCallStatus", () => {
  it("counts only an answered call as done", () => {
    expect(krayaCallStatus("connected")).toBe("done");
  });

  it("maps every unanswered outcome to no_response", () => {
    // The CRM has no third state, so a busy line, a wrong number and a promised
    // callback all have to land in the same bucket.
    for (const outcome of ["no_answer", "busy", "wrong_number", "callback_requested", "not_interested"] as const) {
      expect(krayaCallStatus(outcome)).toBe("no_response");
    }
  });
});

describe("crmCallsConfig", () => {
  const KEYS = ["KRAYA_API_URL", "KRAYA_API_KEY", "KRAYA_CALLS_API_URL"];
  afterEach(() => {
    for (const key of KEYS) delete process.env[key];
  });

  it("derives the calls endpoint from the leads endpoint", () => {
    process.env.KRAYA_API_URL = "https://api.kraya-ai.com/api/external/ABC123/leads";
    process.env.KRAYA_API_KEY = "key";
    const config = crmCallsConfig();
    expect(config.url).toBe("https://api.kraya-ai.com/api/external/ABC123/calls");
    expect(config.configured).toBe(true);
  });

  it("prefers an explicit override", () => {
    process.env.KRAYA_API_URL = "https://api.kraya-ai.com/api/external/ABC123/leads";
    process.env.KRAYA_CALLS_API_URL = "https://elsewhere.example/calls/";
    process.env.KRAYA_API_KEY = "key";
    expect(crmCallsConfig().url).toBe("https://elsewhere.example/calls");
  });

  it("refuses to guess when the leads URL does not end in /leads", () => {
    // Deriving would otherwise POST call logs at the lead upsert endpoint.
    process.env.KRAYA_API_URL = "https://api.kraya-ai.com/api/external/ABC123";
    process.env.KRAYA_API_KEY = "key";
    expect(crmCallsConfig().configured).toBe(false);
  });

  it("is unconfigured without an API key", () => {
    process.env.KRAYA_API_URL = "https://api.kraya-ai.com/api/external/ABC123/leads";
    expect(crmCallsConfig().configured).toBe(false);
  });
});
