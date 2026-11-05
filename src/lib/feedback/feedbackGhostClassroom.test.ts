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
vi.mock("@/models/MonthlyFeedback", () => ({ MonthlyFeedback: { find: vi.fn(), findOne: vi.fn() } }));
vi.mock("@/models/User", () => ({ User: {} }));
vi.mock("@/models/Attendance", () => ({ Attendance: { aggregate: vi.fn() } }));
vi.mock("@/models/Classroom", () => ({ Classroom: { find: vi.fn() } }));
vi.mock("@/models/Course", () => ({ Course: { find: vi.fn() } }));
vi.mock("@/models/FeedbackCycle", () => ({ FeedbackCycle: {} }));
vi.mock("@/models/Fee", () => ({ Notification: {} }));
vi.mock("@/models/StudentPause", () => ({ StudentPause: {} }));

import { classroomRanInMonth, liveClassroomForStudent } from "@/lib/feedback/feedbackCoach";
import { monthBounds } from "@/lib/feedback/feedbackCycleDates";
import { repointReportsToLiveClassrooms } from "@/lib/feedback/feedbackService";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { Course } from "@/models/Course";
import { MonthlyFeedback } from "@/models/MonthlyFeedback";

const OCTOBER = monthBounds("2026-10");
const STUDENT = "64b000000000000000000001";
const BATCH = "64d000000000000000000001";
const OLD_ROOM = "64c000000000000000000001";
const NEW_ROOM = "64c000000000000000000002";
const OLD_COACH = "64a000000000000000000001";
const NEW_COACH = "64a000000000000000000002";

const session = (iso: string, extra: Record<string, unknown> = {}) => ({ scheduledFor: new Date(iso), status: "scheduled", ...extra });

// A batch moved to a new classroom on 1 Oct: the old one is completed, and still
// has October classes marked scheduled under the old coach.
const oldRoom = {
  _id: OLD_ROOM,
  status: "completed",
  completedAt: new Date("2026-10-01T02:53:00Z"),
  coach: OLD_COACH,
  batches: [BATCH],
  students: [STUDENT],
  generatedSessions: [session("2026-09-24T05:30:00Z", { status: "completed", actualStartedAt: new Date("2026-09-24T05:30:00Z") }), session("2026-10-01T05:30:00Z"), session("2026-10-08T05:30:00Z")],
};
const newRoom = {
  _id: NEW_ROOM,
  status: "scheduled",
  coach: NEW_COACH,
  title: "PIC-1",
  courseName: "Beginner Course",
  levelName: "Level 1",
  level: "beginner",
  batches: [BATCH],
  students: [STUDENT],
  generatedSessions: [session("2026-10-01T05:30:00Z", { status: "completed", topicName: "Forks" }), session("2026-10-08T05:30:00Z", { status: "completed" })],
};

function chain(value: any) {
  const query: any = { lean: () => Promise.resolve(value) };
  query.select = () => query;
  return query;
}

describe("classroomRanInMonth", () => {
  it("rejects a completed classroom whose month holds only ghost classes", () => {
    expect(classroomRanInMonth(oldRoom, OCTOBER)).toBe(false);
  });

  it("keeps a completed classroom for a month it really taught", () => {
    expect(classroomRanInMonth(oldRoom, monthBounds("2026-09"))).toBe(true);
    const closedMidMonth = { ...oldRoom, completedAt: new Date("2026-10-05T00:00:00Z") };
    expect(classroomRanInMonth(closedMidMonth, OCTOBER)).toBe(true);
  });

  it("keeps a ghost date whose register was marked", () => {
    const marked = { ...oldRoom, generatedSessions: [session("2026-10-08T05:30:00Z", { attendanceMarkedAt: new Date("2026-10-08T06:30:00Z") })] };
    expect(classroomRanInMonth(marked, OCTOBER)).toBe(true);
  });

  it("never rejects a running classroom", () => {
    expect(classroomRanInMonth(newRoom, OCTOBER)).toBe(true);
  });
});

describe("liveClassroomForStudent", () => {
  it("prefers the running classroom of the same batch", () => {
    const other = { ...newRoom, _id: "64c000000000000000000003", batches: ["64d000000000000000000002"] };
    expect(liveClassroomForStudent(oldRoom, [other, newRoom], STUDENT, OCTOBER)?._id).toBe(NEW_ROOM);
  });

  it("skips a classroom the student has left or was closed for", () => {
    expect(liveClassroomForStudent(oldRoom, [{ ...newRoom, closedForStudents: [STUDENT] }], STUDENT, OCTOBER)).toBeNull();
    expect(liveClassroomForStudent(oldRoom, [{ ...newRoom, studentExits: [{ student: STUDENT, exitedAt: new Date("2026-10-20T00:00:00Z") }] }], STUDENT, OCTOBER)).toBeNull();
  });

  it("skips a classroom with no classes that month", () => {
    expect(liveClassroomForStudent(oldRoom, [newRoom], STUDENT, monthBounds("2026-12"))).toBeNull();
  });
});

describe("repointReportsToLiveClassrooms", () => {
  const makeDoc = (status: string, tier = "beginner") => ({ status, tier, classroom: OLD_ROOM, stats: { classesAttended: 0, classesScheduled: 2, topicsCovered: [] }, save: vi.fn() });

  beforeEach(() => {
    vi.clearAllMocks();
    (MonthlyFeedback.find as any).mockReturnValue(chain([{ _id: "r1", month: "2026-10", student: STUDENT, classroom: OLD_ROOM }]));
    (Classroom.find as any).mockImplementation((query: any) => {
      if (query.status === "completed") return chain([oldRoom]);
      if (query.parentClassroom) return chain([]);
      return chain([newRoom]);
    });
    (Course.find as any).mockReturnValue(chain([]));
    (Attendance.aggregate as any).mockResolvedValue([{ _id: NEW_ROOM, attended: 2, held: 2 }]);
  });

  it("moves the report to the running classroom and corrects its numbers", async () => {
    const doc = makeDoc("pending");
    (MonthlyFeedback.findOne as any).mockResolvedValue(doc);

    expect(await repointReportsToLiveClassrooms()).toBe(1);

    expect(doc.classroom).toBe(NEW_ROOM);
    expect(doc.stats).toEqual({ classesAttended: 2, classesScheduled: 2, topicsCovered: ["Forks"] });
    expect(doc.save).toHaveBeenCalledOnce();
  });

  it("does not touch the coach, so an admin's pin survives", async () => {
    const doc: any = { ...makeDoc("pending"), coach: NEW_COACH, coachName: "Pinned", coachPinned: true };
    (MonthlyFeedback.findOne as any).mockResolvedValue(doc);

    await repointReportsToLiveClassrooms();

    expect(doc.coach).toBe(NEW_COACH);
    expect(doc.coachName).toBe("Pinned");
    expect(doc.coachPinned).toBe(true);
  });

  it("only ever looks at reports not yet sent", async () => {
    (MonthlyFeedback.findOne as any).mockResolvedValue(makeDoc("pending"));

    await repointReportsToLiveClassrooms();

    const statuses = (MonthlyFeedback.find as any).mock.calls[0][0].status.$in;
    expect(statuses).toEqual(["pending", "draft", "submitted", "changes_requested"]);
    expect(statuses).not.toContain("sent");
  });

  it("keeps a submitted report's tier", async () => {
    const doc = makeDoc("submitted", "intermediate");
    (MonthlyFeedback.findOne as any).mockResolvedValue(doc);

    await repointReportsToLiveClassrooms();

    expect(doc.classroom).toBe(NEW_ROOM);
    expect(doc.tier).toBe("intermediate");
  });

  it("leaves a report alone when the completed classroom really taught that month", async () => {
    (MonthlyFeedback.find as any).mockReturnValue(chain([{ _id: "r1", month: "2026-09", student: STUDENT, classroom: OLD_ROOM }]));

    expect(await repointReportsToLiveClassrooms()).toBe(0);
    expect(MonthlyFeedback.findOne).not.toHaveBeenCalled();
  });
});
