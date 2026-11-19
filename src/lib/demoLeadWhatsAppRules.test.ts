import { describe, expect, it } from "vitest";
import {
  BROCHURES,
  callLinkToken,
  callTimeOfDay,
  callbackButtonPayload,
  demoLeadBrochures,
  leadIdFromCallToken,
  leadIdFromCallbackPayload,
  nextCallTime,
} from "@/lib/demoLeadWhatsAppRules";

const LEAD = "6560f1a2b3c4d5e6f7a8b9c0";

describe("brochures by level", () => {
  it("sends the India PDF for the level, then the Global profile", () => {
    expect(demoLeadBrochures("fresher")).toEqual([BROCHURES.beginnerIntermediate, BROCHURES.global]);
    expect(demoLeadBrochures("intermediate")).toEqual([BROCHURES.beginnerIntermediate, BROCHURES.global]);
    expect(demoLeadBrochures("plays_tournaments")).toEqual([BROCHURES.semiProPro, BROCHURES.global]);
    expect(demoLeadBrochures("fide_rated")).toEqual([BROCHURES.masters, BROCHURES.global]);
  });

  it("maps retired and missing levels", () => {
    expect(demoLeadBrochures("beginner")[0]).toBe(BROCHURES.beginnerIntermediate);
    expect(demoLeadBrochures("advanced")[0]).toBe(BROCHURES.semiProPro);
    expect(demoLeadBrochures("")[0]).toBe(BROCHURES.beginnerIntermediate);
    expect(demoLeadBrochures(undefined)).toHaveLength(2);
  });
});

describe("Confirm call-back payload", () => {
  it("round-trips a lead id and ignores anything else", () => {
    expect(leadIdFromCallbackPayload(callbackButtonPayload(LEAD))).toBe(LEAD);
    expect(leadIdFromCallbackPayload("Confirm call-back")).toBe("");
    expect(leadIdFromCallbackPayload("demo_cb:not-an-id")).toBe("");
    expect(leadIdFromCallbackPayload(null)).toBe("");
  });
});

describe("Call sales person link", () => {
  it("accepts its own token and refuses a forged one", () => {
    const token = callLinkToken(LEAD);
    expect(leadIdFromCallToken(token)).toBe(LEAD);
    expect(leadIdFromCallToken(`${LEAD}.AAAAAAAAAAAA`)).toBe("");
    expect(leadIdFromCallToken(`6560f1a2b3c4d5e6f7a8b9c1.${token.split(".")[1]}`)).toBe("");
    expect(leadIdFromCallToken(LEAD)).toBe("");
  });
});

describe("reading the parent's call time", () => {
  it.each([
    ["4:00 PM - 5:00 PM", "16:00"],
    ["4pm", "16:00"],
    ["after 6 p.m.", "18:00"],
    ["5-6 pm", "17:00"],
    ["11 am to 12", "11:00"],
    ["10:30", "10:30"],
    ["16:30", "16:30"],
    ["7", "19:00"],
    ["12 pm", "12:00"],
    ["12am", "00:00"],
  ])("%s -> %s", (text, expected) => {
    expect(callTimeOfDay(text)).toBe(expected);
  });

  it.each(["evening", "any time", "", "25:00", "13 pm"])("no time in %j", (text) => {
    expect(callTimeOfDay(text)).toBe("");
  });

  it("picks today if still ahead, else tomorrow (IST)", () => {
    // 10:00 IST on 20 Nov 2026
    const morning = new Date("2026-11-20T04:30:00Z");
    expect(nextCallTime("4 pm", morning)?.toISOString()).toBe("2026-11-20T10:30:00.000Z");
    // 18:00 IST: 4 pm has passed
    const evening = new Date("2026-11-20T12:30:00Z");
    expect(nextCallTime("4 pm", evening)?.toISOString()).toBe("2026-11-21T10:30:00.000Z");
    expect(nextCallTime("evening", morning)).toBeNull();
  });
});
