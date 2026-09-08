import { describe, expect, it } from "vitest";
import { hasClassesLeftToTeach, isReadyToComplete } from "@/lib/classroomLifecycle";
import { dueCourseCompletionFilter } from "@/lib/courseCompletionSweep";

function taught(topicName: string) {
  return { topicName, status: "completed", summary: { topicCompleted: true } };
}

function neverHappened(topicName: string, status: string) {
  return { topicName, status, summary: { topicCompleted: false } };
}

const plan = [
  { sessionNumber: 1, topicName: "The Pin" },
  { sessionNumber: 2, topicName: "The Fork" },
  { sessionNumber: 3, topicName: "The Skewer" },
];

describe("isReadyToComplete", () => {
  it("is ready once every planned topic has actually been taught", () => {
    expect(
      isReadyToComplete({ sessionPlan: plan, generatedSessions: [taught("The Pin"), taught("The Fork"), taught("The Skewer")] }),
    ).toBe(true);
  });

  it("is NOT ready when a topic was only no-showed or cancelled", () => {
    // The whole point of the change: these sessions are terminal but taught
    // nothing, and the old rule counted them as course completion.
    expect(
      isReadyToComplete({
        sessionPlan: plan,
        generatedSessions: [taught("The Pin"), neverHappened("The Fork", "coach_no_show"), neverHappened("The Skewer", "cancelled")],
      }),
    ).toBe(false);
  });

  it("is not ready while a topic is still scheduled", () => {
    expect(
      isReadyToComplete({
        sessionPlan: plan,
        generatedSessions: [taught("The Pin"), taught("The Fork"), { topicName: "The Skewer", status: "scheduled" }],
      }),
    ).toBe(false);
  });

  it("does not let a continuation class close its topic early", () => {
    // A class marked "completed, continue topic" carries topicCompleted: false.
    expect(
      isReadyToComplete({
        sessionPlan: [{ sessionNumber: 1, topicName: "The Pin" }],
        generatedSessions: [{ topicName: "The Pin", status: "completed", summary: { topicCompleted: false } }],
      }),
    ).toBe(false);
  });

  it("counts a topic once even when it ran over two classes", () => {
    expect(
      isReadyToComplete({
        sessionPlan: [{ sessionNumber: 1, topicName: "The Pin" }],
        generatedSessions: [
          { topicName: "The Pin", status: "completed", summary: { topicCompleted: false } },
          taught("The Pin"),
        ],
      }),
    ).toBe(true);
  });

  it("ignores topic name casing and padding", () => {
    expect(
      isReadyToComplete({ sessionPlan: [{ sessionNumber: 1, topicName: "The Pin" }], generatedSessions: [taught("  the pin ")] }),
    ).toBe(true);
  });

  it("falls back to every session being finished when there is no session plan", () => {
    expect(isReadyToComplete({ sessionPlan: [], generatedSessions: [{ status: "completed" }, { status: "cancelled" }] })).toBe(true);
    expect(isReadyToComplete({ sessionPlan: [], generatedSessions: [{ status: "completed" }, { status: "scheduled" }] })).toBe(false);
  });

  it("is never ready with no sessions at all", () => {
    expect(isReadyToComplete({ sessionPlan: plan, generatedSessions: [] })).toBe(false);
    expect(isReadyToComplete({})).toBe(false);
  });
});

describe("hasClassesLeftToTeach", () => {
  it("is true while any class is still scheduled", () => {
    expect(hasClassesLeftToTeach({ generatedSessions: [{ status: "completed" }, { status: "scheduled" }] })).toBe(true);
  });

  it("is true for a class in progress", () => {
    expect(hasClassesLeftToTeach({ generatedSessions: [{ status: "ongoing" }] })).toBe(true);
  });

  it("is false once every class has reached an end state", () => {
    // Cancelled and no-showed classes are behind us even though they taught
    // nothing - there is no register left to mark, which is what this gates.
    expect(
      hasClassesLeftToTeach({ generatedSessions: [{ status: "completed" }, { status: "cancelled" }, { status: "coach_no_show" }] }),
    ).toBe(false);
  });

  it("treats a session with no status as still to teach", () => {
    expect(hasClassesLeftToTeach({ generatedSessions: [{}] })).toBe(true);
  });

  it("is false with no sessions at all", () => {
    expect(hasClassesLeftToTeach({ generatedSessions: [] })).toBe(false);
    expect(hasClassesLeftToTeach({})).toBe(false);
  });
});

describe("dueCourseCompletionFilter", () => {
  const filter: any = dueCourseCompletionFilter();

  it("only ever picks up courses an admin armed", () => {
    // The guard against reintroducing the old silent auto-completion.
    expect(filter.completeAfterLastSession).toBe(true);
  });

  it("skips courses that are already finished or cancelled", () => {
    expect(filter.status).toEqual({ $nin: ["completed", "cancelled"] });
  });

  it("skips per-session mirror classrooms", () => {
    expect(filter.isSessionInstance).toEqual({ $ne: true });
  });

  it("requires that no session is still open", () => {
    const statuses = filter.generatedSessions.$not.$elemMatch.status.$nin;
    expect(statuses).toContain("completed");
    expect(statuses).toContain("cancelled");
    expect(statuses).not.toContain("scheduled");
    expect(statuses).not.toContain("ongoing");
  });
});
