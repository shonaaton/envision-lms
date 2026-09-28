import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/emailAutomation", () => ({ sendAutomationEmail: vi.fn() }));
vi.mock("@/lib/tasks/taskService", () => ({ reassignAutoTasks: vi.fn() }));
vi.mock("@/lib/tasks/taskTriggers", () => ({
  raiseFeedbackReviewTask: vi.fn(),
  raiseMonthlyFeedbackTask: vi.fn(),
  reopenMonthlyFeedbackTask: vi.fn(),
  resolveFeedbackReviewTask: vi.fn(),
  resolveMonthlyFeedbackTask: vi.fn(),
}));
vi.mock("@/models/MonthlyFeedback", () => ({ MonthlyFeedback: { find: vi.fn(), exists: vi.fn(), updateOne: vi.fn() } }));
vi.mock("@/models/User", () => ({ User: { findById: vi.fn() } }));
vi.mock("@/models/Attendance", () => ({ Attendance: {} }));
vi.mock("@/models/Classroom", () => ({ Classroom: {} }));
vi.mock("@/models/FeedbackCycle", () => ({ FeedbackCycle: {} }));
vi.mock("@/models/Fee", () => ({ Notification: {} }));
vi.mock("@/models/StudentPause", () => ({ StudentPause: {} }));

import { transferPendingFeedbackToCoach } from "@/lib/feedback/feedbackService";
import { reassignAutoTasks } from "@/lib/tasks/taskService";
import { MonthlyFeedback } from "@/models/MonthlyFeedback";
import { User } from "@/models/User";

const CLASSROOM = "64c000000000000000000001";
const OLD = "64a000000000000000000001";
const NEW = "64a000000000000000000002";

function chain(value: any) {
  const query: any = { lean: () => Promise.resolve(value) };
  query.select = () => query;
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  (User.findById as any).mockReturnValue(chain({ name: "New Coach" }));
});

describe("transferPendingFeedbackToCoach", () => {
  it("moves unfinished reports and their tasks to the new coach", async () => {
    (MonthlyFeedback.find as any).mockReturnValue(chain([{ _id: "r1", month: "2026-09", student: "s1" }, { _id: "r2", month: "2026-09", student: "s2" }]));
    (MonthlyFeedback.exists as any).mockResolvedValue(null);
    (MonthlyFeedback.updateOne as any).mockResolvedValue({ modifiedCount: 1 });

    const result = await transferPendingFeedbackToCoach({ classroomId: CLASSROOM, fromCoachId: OLD, toCoachId: NEW });

    expect(result).toEqual({ moved: 2, kept: 0 });
    const filter = (MonthlyFeedback.find as any).mock.calls[0][0];
    expect(filter).toMatchObject({ classroom: CLASSROOM, coach: OLD });
    // Submitted, approved and sent reports stay with the coach who wrote them.
    expect(filter.status.$in).toEqual(["pending", "draft", "changes_requested"]);
    expect((MonthlyFeedback.updateOne as any).mock.calls[0][1]).toEqual({ $set: { coach: NEW, coachName: "New Coach" } });
    expect(reassignAutoTasks).toHaveBeenCalledWith("MonthlyFeedback", ["r1", "r2"], NEW, "Classroom coach change");
  });

  it("leaves a report where it is when the new coach already has one for that student and month", async () => {
    (MonthlyFeedback.find as any).mockReturnValue(chain([{ _id: "r1", month: "2026-09", student: "s1" }]));
    (MonthlyFeedback.exists as any).mockResolvedValue({ _id: "theirs" });

    const result = await transferPendingFeedbackToCoach({ classroomId: CLASSROOM, fromCoachId: OLD, toCoachId: NEW });

    expect(result).toEqual({ moved: 0, kept: 1 });
    expect(MonthlyFeedback.updateOne).not.toHaveBeenCalled();
    expect(reassignAutoTasks).not.toHaveBeenCalled();
  });

  it("does nothing when the coach did not actually change", async () => {
    expect(await transferPendingFeedbackToCoach({ classroomId: CLASSROOM, fromCoachId: OLD, toCoachId: OLD })).toEqual({ moved: 0, kept: 0 });
    expect(MonthlyFeedback.find).not.toHaveBeenCalled();
  });
});
