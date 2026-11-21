import { describe, expect, it } from "vitest";
import { monthTaskReferenceId, placeIncomplete, placeLabel, recentMonthKeys, suggestState, tidyPlace, tournamentActionSchema } from "./tournamentDetailsRules";

describe("tournament details rules", () => {
  it("builds a valid, month-unique task reference id", () => {
    expect(monthTaskReferenceId("2026-11")).toBe("7d0000000000000000202611");
    expect(monthTaskReferenceId("2026-11")).toMatch(/^[a-f0-9]{24}$/);
    expect(monthTaskReferenceId("2026-12")).not.toBe(monthTaskReferenceId("2026-11"));
  });

  it("lists months back across a year end", () => {
    expect(recentMonthKeys("2026-02", 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });

  it("tidies place names without breaking mixed case", () => {
    expect(tidyPlace("  kolkata ")).toBe("Kolkata");
    expect(tidyPlace("NEW   DELHI")).toBe("New Delhi");
    expect(tidyPlace("McLeod Ganj")).toBe("McLeod Ganj");
    expect(tidyPlace("UAE")).toBe("UAE");
    expect(tidyPlace("uae")).toBe("Uae");
  });

  it("suggests a state only for known Indian cities", () => {
    expect(suggestState("Kolkata", "India")).toBe("West Bengal");
    expect(suggestState("bengaluru", "")).toBe("Karnataka");
    expect(suggestState("Kolkata", "UAE")).toBe("");
    expect(suggestState("Nowhere", "India")).toBe("");
  });

  it("needs a state only for Indian families", () => {
    expect(placeIncomplete({ city: "Dubai", state: "", country: "UAE" })).toBe(false);
    expect(placeIncomplete({ city: "Kolkata", state: "", country: "India" })).toBe(true);
    expect(placeIncomplete({ city: "", state: "Goa", country: "India" })).toBe(true);
  });

  it("labels places and validates actions", () => {
    expect(placeLabel({ city: "Pune", state: "", country: "India" })).toBe("Pune, India");
    expect(tournamentActionSchema.safeParse({ action: "mark_sent", monthKey: "2026-13", studentIds: ["a".repeat(24)] }).success).toBe(false);
    expect(tournamentActionSchema.safeParse({ action: "mark_sent", monthKey: "2026-11", studentIds: [] }).success).toBe(false);
    expect(tournamentActionSchema.safeParse({ action: "answer_request", requestId: "b".repeat(24), reply: "  " }).success).toBe(false);
  });
});
