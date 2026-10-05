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
  withdrawMonthlyFeedbackTask: vi.fn(),
}));
vi.mock("@/models/MonthlyFeedback", () => ({
  MonthlyFeedback: { find: vi.fn(), exists: vi.fn(), updateOne: vi.fn(), distinct: vi.fn(), countDocuments: vi.fn() },
}));
vi.mock("@/models/User", () => ({ User: { findById: vi.fn(), find: vi.fn() } }));
vi.mock("@/models/Attendance", () => ({ Attendance: {} }));
vi.mock("@/models/Classroom", () => ({ Classroom: { findById: vi.fn() } }));
vi.mock("@/models/Course", () => ({ Course: {} }));
vi.mock("@/models/FeedbackCycle", () => ({ FeedbackCycle: {} }));
vi.mock("@/models/Fee", () => ({ Notification: {} }));
vi.mock("@/models/StudentPause", () => ({ StudentPause: {} }));

import { transferPendingFeedbackToCoach } from "@/lib/feedback/feedbackService";
import { reassignAutoTasks } from "@/lib/tasks/taskService";
import { Classroom } from "@/models/Classroom";
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

const session = (iso: string, extra: Record<string, unknown> = {}) => ({ scheduledFor: new Date(iso), status: "completed", ...extra });

// Handed from OLD to NEW on 1 Oct: September pinned to OLD, October with NEW.
const classroom = {
  _id: CLASSROOM,
  coach: NEW,
  generatedSessions: [
    session("2026-09-03T12:00:00Z", { conductedBy: OLD }),
    session("2026-09-17T12:00:00Z", { conductedBy: OLD }),
    session("2026-10-01T12:00:00Z"),
    session("2026-10-15T12:00:00Z", { status: "scheduled" }),
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  (Classroom.findById as any).mockReturnValue(chain(classroom));
  (User.find as any).mockReturnValue(chain([
    { _id: OLD, name: "Old Coach", isActive: true, role: "instructor" },
    { _id: NEW, name: "New Coach", isActive: true, role: "instructor" },
  ]));
  (MonthlyFeedback.exists as any).mockResolvedValue(null);
  (MonthlyFeedback.updateOne as any).mockResolvedValue({ modifiedCount: 1 });
  (MonthlyFeedback.countDocuments as any).mockResolvedValue(2);
});

describe("transferPendingFeedbackToCoach", () => {
  it("leaves last month's reports with the coach who taught that month", async () => {
    (MonthlyFeedback.distinct as any).mockResolvedValue(["2026-09"]);

    const result = await transferPendingFeedbackToCoach({ classroomId: CLASSROOM, fromCoachId: OLD, toCoachId: NEW });

    expect(result).toEqual({ moved: 0, kept: 2 });
    expect(MonthlyFeedback.updateOne).not.toHaveBeenCalled();
    expect(reassignAutoTasks).not.toHaveBeenCalled();
  });

  it("moves a month the new coach is teaching, with its tasks", async () => {
    (MonthlyFeedback.distinct as any).mockResolvedValue(["2026-10"]);
    (MonthlyFeedback.find as any).mockReturnValue(chain([
      { _id: "r1", month: "2026-10", student: "s1", coach: OLD, status: "pending" },
      { _id: "r2", month: "2026-10", student: "s2", coach: OLD, status: "draft" },
    ]));

    const result = await transferPendingFeedbackToCoach({ classroomId: CLASSROOM, fromCoachId: OLD, toCoachId: NEW });

    expect(result).toEqual({ moved: 2, kept: 0 });
    // Submitted, approved and sent reports stay with the coach who wrote them.
    expect((MonthlyFeedback.find as any).mock.calls[0][0].status.$in).toEqual(["pending", "draft", "changes_requested"]);
    expect((MonthlyFeedback.updateOne as any).mock.calls[0][1]).toEqual({ $set: { coach: NEW, coachName: "New Coach" } });
    expect(reassignAutoTasks).toHaveBeenCalledWith("MonthlyFeedback", ["r1", "r2"], NEW, "Report follows the coach who taught the month");
  });

  it("does nothing when the coach did not actually change", async () => {
    expect(await transferPendingFeedbackToCoach({ classroomId: CLASSROOM, fromCoachId: OLD, toCoachId: OLD })).toEqual({ moved: 0, kept: 0 });
    expect(MonthlyFeedback.distinct).not.toHaveBeenCalled();
  });
});
