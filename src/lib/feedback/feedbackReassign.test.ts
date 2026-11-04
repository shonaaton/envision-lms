import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/appUrl", () => ({ resolvePublicAppUrl: () => "https://example.test" }));
vi.mock("@/lib/emailAutomation", () => ({ sendAutomationEmail: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/tasks/taskService", () => ({ reassignAutoTasks: vi.fn() }));
vi.mock("@/lib/tasks/taskTriggers", () => ({
  raiseFeedbackReviewTask: vi.fn(),
  raiseMonthlyFeedbackTask: vi.fn(),
  reopenMonthlyFeedbackTask: vi.fn(),
  resolveFeedbackReviewTask: vi.fn(),
  resolveMonthlyFeedbackTask: vi.fn(),
  withdrawMonthlyFeedbackTask: vi.fn(),
}));
vi.mock("@/models/MonthlyFeedback", () => ({
  MonthlyFeedback: { findById: vi.fn(), exists: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("@/models/User", () => ({ User: { findById: vi.fn(), find: vi.fn() } }));
vi.mock("@/models/Attendance", () => ({ Attendance: {} }));
vi.mock("@/models/Classroom", () => ({ Classroom: { findById: vi.fn() } }));
vi.mock("@/models/Course", () => ({ Course: {} }));
vi.mock("@/models/FeedbackCycle", () => ({ FeedbackCycle: {} }));
vi.mock("@/models/Fee", () => ({ Notification: { create: vi.fn().mockResolvedValue({}) } }));
vi.mock("@/models/StudentPause", () => ({ StudentPause: {} }));

import { reassignFeedback } from "@/lib/feedback/feedbackService";
import { reassignAutoTasks } from "@/lib/tasks/taskService";
import { raiseMonthlyFeedbackTask } from "@/lib/tasks/taskTriggers";
import { Classroom } from "@/models/Classroom";
import { Notification } from "@/models/Fee";
import { MonthlyFeedback } from "@/models/MonthlyFeedback";
import { User } from "@/models/User";

const ADMIN = { id: "64d000000000000000000001", role: "admin", canApprove: true };
const ROOM = "64c000000000000000000001";
const TAUGHT = "64a000000000000000000001";
const OTHER = "64a000000000000000000002";
const REPORT = "64b000000000000000000001";

function chain(value: any) {
  const query: any = { lean: () => Promise.resolve(value) };
  query.select = () => query;
  return query;
}

const people: Record<string, any> = {
  [ADMIN.id]: { _id: ADMIN.id, name: "Admin Person", role: "admin" },
  [TAUGHT]: { _id: TAUGHT, name: "Taught Coach", role: "instructor", isActive: true },
  [OTHER]: { _id: OTHER, name: "Other Coach", email: "other@example.test", role: "instructor", isActive: true },
};

// TAUGHT taught all of October in the classroom.
const classroom = { _id: ROOM, coach: TAUGHT, generatedSessions: [{ scheduledFor: new Date("2026-10-08T12:00:00Z"), status: "completed" }] };

function report(extra: Record<string, unknown> = {}) {
  return { _id: REPORT, month: "2026-10", student: "s1", studentName: "Aarav Sen", coach: TAUGHT, coachName: "Taught Coach", classroom: ROOM, status: "draft", ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  (User.findById as any).mockImplementation((id: string) => chain(people[id] || null));
  (Classroom.findById as any).mockReturnValue(chain(classroom));
  (MonthlyFeedback.exists as any).mockResolvedValue(null);
  (MonthlyFeedback.updateOne as any).mockResolvedValue({ modifiedCount: 1 });
});

describe("reassignFeedback", () => {
  it("moves an unsubmitted report to another coach, pins it, and moves its task quietly", async () => {
    (MonthlyFeedback.findById as any).mockReturnValue(chain(report()));

    const result = await reassignFeedback({ ids: [REPORT], coachId: OTHER, note: "Covering while on leave" }, ADMIN);

    expect(result).toEqual({ moved: 1, results: [{ id: REPORT, ok: true }] });
    const [filter, update] = (MonthlyFeedback.updateOne as any).mock.calls[0];
    expect(filter.status.$in).toEqual(["pending", "draft", "changes_requested"]);
    expect(update.$set).toMatchObject({ coach: OTHER, coachName: "Other Coach", coachPinned: true, reassignedFromName: "Taught Coach", reassignNote: "Covering while on leave" });
    expect(reassignAutoTasks).toHaveBeenCalledWith("MonthlyFeedback", [REPORT], OTHER, "Admin Person", { notify: false });
    expect((raiseMonthlyFeedbackTask as any).mock.calls[0][0].silent).toBe(true);
    // One notice to the new coach, one to the previous coach.
    expect((Notification.create as any).mock.calls.map((call: any[]) => call[0].user)).toEqual([OTHER, TAUGHT]);
  });

  it("refuses a report the coach has already submitted", async () => {
    (MonthlyFeedback.findById as any).mockReturnValue(chain(report({ status: "submitted" })));

    const result = await reassignFeedback({ ids: [REPORT], coachId: OTHER, note: "" }, ADMIN);

    expect(result.moved).toBe(0);
    expect(result.results[0]).toMatchObject({ ok: false });
    expect(result.results[0].error).toMatch(/already been submitted/);
    expect(MonthlyFeedback.updateOne).not.toHaveBeenCalled();
    expect(reassignAutoTasks).not.toHaveBeenCalled();
  });

  it("handing a report back to the month's coach removes the pin", async () => {
    (MonthlyFeedback.findById as any).mockReturnValue(chain(report({ coach: OTHER, coachName: "Other Coach", coachPinned: true })));

    await reassignFeedback({ ids: [REPORT], coachId: TAUGHT, note: "" }, ADMIN);

    expect((MonthlyFeedback.updateOne as any).mock.calls[0][1].$set.coachPinned).toBe(false);
  });

  it("refuses when the target coach already has that student's report", async () => {
    (MonthlyFeedback.findById as any).mockReturnValue(chain(report()));
    (MonthlyFeedback.exists as any).mockResolvedValue({ _id: "dup" });

    const result = await reassignFeedback({ ids: [REPORT], coachId: OTHER, note: "" }, ADMIN);

    expect(result.moved).toBe(0);
    expect(MonthlyFeedback.updateOne).not.toHaveBeenCalled();
  });

  it("is admin-only", async () => {
    await expect(reassignFeedback({ ids: [REPORT], coachId: OTHER, note: "" }, { id: TAUGHT, role: "instructor" })).rejects.toThrow(/Only admins/);
  });
});
