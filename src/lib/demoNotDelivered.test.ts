import { describe, expect, it } from "vitest";
import { canWriteOffDemo, demoNotDeliveredOutcome } from "@/lib/demoNotDelivered";

describe("demoNotDeliveredOutcome", () => {
  it("maps the never-attended outcomes onto a demo write-off", () => {
    expect(demoNotDeliveredOutcome("student_no_show")).toBe("student_no_show");
    for (const outcome of ["absent", "missed", "abandoned"]) expect(demoNotDeliveredOutcome(outcome)).toBe("absent");
  });

  it("leaves attended, cancelled and unknown outcomes alone", () => {
    for (const outcome of ["completed", "completed_continue_topic", "cancelled", "technical_issue", "coach_no_show", "", undefined]) {
      expect(demoNotDeliveredOutcome(outcome)).toBeNull();
    }
  });
});

describe("canWriteOffDemo", () => {
  it("writes off a demo still waiting on its assessment", () => {
    // Regression: a demo first saved as Present and then corrected to No Show
    // stayed ASSESSMENT_PENDING, so the coach kept being asked to assess it.
    expect(canWriteOffDemo({ status: "confirmed", demoStatus: "ASSESSMENT_PENDING", feedbackStatus: "pending" })).toBe(true);
    expect(canWriteOffDemo({ status: "confirmed", demoStatus: "CLASSROOM_CREATED" })).toBe(true);
  });

  it("never undoes a submitted assessment", () => {
    expect(canWriteOffDemo({ status: "confirmed", demoStatus: "ASSESSMENT_PENDING", feedbackStatus: "submitted" })).toBe(false);
    expect(canWriteOffDemo({ status: "confirmed", demoStatus: "COMPLETED", feedbackStatus: "submitted" })).toBe(false);
  });

  it("does nothing to a demo already written off, closed or converted", () => {
    expect(canWriteOffDemo({ status: "pending", demoStatus: "STUDENT_NO_SHOW" })).toBe(false);
    expect(canWriteOffDemo({ status: "pending", demoStatus: "ABSENT" })).toBe(false);
    expect(canWriteOffDemo({ status: "cancelled", demoStatus: "CLOSED" })).toBe(false);
    expect(canWriteOffDemo({ status: "confirmed", demoStatus: "CONVERTED" })).toBe(false);
    expect(canWriteOffDemo(null)).toBe(false);
  });
});
