import { describe, expect, it } from "vitest";
import { normalizeTemplateBodyParameters, sanitizeWhatsAppParameter } from "@/lib/whatsappAutomation";

describe("sanitizeWhatsAppParameter", () => {
  it("flattens a multi-slot schedule into one line", () => {
    // The exact parameter that failed: a batch meeting twice a week put a
    // newline inside {{7}} of class_assigned_coach, and Meta rejected the whole
    // message. The same template delivered for a once-a-week batch.
    const schedule = "Tuesday at 20:30 (60 min)\nThursday at 20:30 (60 min)";
    expect(sanitizeWhatsAppParameter(schedule)).toBe("Tuesday at 20:30 (60 min), Thursday at 20:30 (60 min)");
    expect(sanitizeWhatsAppParameter(schedule)).not.toMatch(/[\n\r\t]/);
  });

  it("leaves a single-line parameter alone", () => {
    expect(sanitizeWhatsAppParameter("Sunday at 18:30 (60 min)")).toBe("Sunday at 18:30 (60 min)");
  });

  it("strips every character Meta rejects in a parameter", () => {
    expect(sanitizeWhatsAppParameter("A\tB")).toBe("A B");
    expect(sanitizeWhatsAppParameter("A     B")).toBe("A B");
    expect(sanitizeWhatsAppParameter("Line one\r\n\r\nLine two")).toBe("Line one, Line two");
  });

  it("does not punctuate twice when a line already ends in a separator", () => {
    expect(sanitizeWhatsAppParameter("Rupang, Ansh,\nAmritkumar")).toBe("Rupang, Ansh, Amritkumar");
  });

  it("handles nothing at all", () => {
    expect(sanitizeWhatsAppParameter(undefined)).toBe("");
    expect(sanitizeWhatsAppParameter("\n\n")).toBe("");
  });
});

describe("normalizeTemplateBodyParameters", () => {
  it("keeps every placeholder in its own position", () => {
    // Dropping an empty value used to slide later parameters up a slot, so the
    // topic arrived where the schedule belonged and the count no longer matched.
    expect(normalizeTemplateBodyParameters(["Coach", "", "SP1-200"])).toEqual(["Coach", "-", "SP1-200"]);
  });

  it("still drops trailing placeholders the caller left out", () => {
    expect(normalizeTemplateBodyParameters(["Coach", "SP1-200", "", ""])).toEqual(["Coach", "SP1-200"]);
    expect(normalizeTemplateBodyParameters([])).toEqual([]);
  });

  it("sanitizes each parameter on the way through", () => {
    expect(normalizeTemplateBodyParameters(["Tue at 20:30\nThu at 20:30"])).toEqual(["Tue at 20:30, Thu at 20:30"]);
  });
});
