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
vi.mock("@/models/MonthlyFeedback", () => ({ MonthlyFeedback: { find: vi.fn(), updateOne: vi.fn() } }));
vi.mock("@/models/User", () => ({ User: {} }));
vi.mock("@/models/Attendance", () => ({ Attendance: { aggregate: vi.fn() } }));
vi.mock("@/models/Classroom", () => ({ Classroom: { find: vi.fn() } }));
vi.mock("@/models/Course", () => ({ Course: {} }));
vi.mock("@/models/FeedbackCycle", () => ({ FeedbackCycle: {} }));
vi.mock("@/models/Fee", () => ({ Notification: {} }));
vi.mock("@/models/StudentPause", () => ({ StudentPause: {} }));

import { monthBounds } from "@/lib/feedback/feedbackCycleDates";
import { refreshOutdatedReportStats } from "@/lib/feedback/feedbackService";
import { STATS_VERSION, monthStatsFromRegisters } from "@/lib/feedback/feedbackStats";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { MonthlyFeedback } from "@/models/MonthlyFeedback";

const STUDENT = "64b000000000000000000001";
const OLD_ROOM = "64c000000000000000000001";
const MID_ROOM = "64c000000000000000000002";
const NEW_ROOM = "64c000000000000000000003";
const SEPTEMBER = monthBounds("2026-09");
const OCTOBER = monthBounds("2026-10");

const session = (iso: string, extra: Record<string, unknown> = {}) => ({ scheduledFor: new Date(iso), status: "completed", ...extra });

const stats = (rooms: any[], registers: any[], reportRoomId: string, bounds = SEPTEMBER) =>
  monthStatsFromRegisters({ reportRoomId, rooms, registers, studentId: STUDENT, bounds });

describe("monthStatsFromRegisters", () => {
  // A student moved through two rooms in September into a third: their report sat
  // on the first room and told the family 0 attended, when the registers say 5 of 6.
  const moved = [
    { _id: OLD_ROOM, status: "completed", completedAt: new Date("2026-09-05T00:00:00Z"), students: [STUDENT], generatedSessions: [session("2026-09-03T12:00:00Z"), session("2026-09-24T12:00:00Z", { status: "scheduled" })] },
    { _id: MID_ROOM, status: "completed", completedAt: new Date("2026-09-10T00:00:00Z"), students: [STUDENT], generatedSessions: [session("2026-09-08T12:00:00Z")] },
    { _id: NEW_ROOM, status: "scheduled", students: [STUDENT], generatedSessions: ["11", "15", "22", "29"].map((day) => session(`2026-09-${day}T12:00:00Z`)) },
  ];
  const registers = [
    { _id: OLD_ROOM, attended: 0, held: 1 },
    { _id: MID_ROOM, attended: 1, held: 1 },
    { _id: NEW_ROOM, attended: 4, held: 4 },
  ];

  it("counts every classroom the student was in that month", () => {
    const result = stats(moved, registers, OLD_ROOM);
    expect(result.classesAttended).toBe(5);
    expect(result.classesScheduled).toBe(6);
  });

  it("gives the same numbers whichever classroom the report sits on", () => {
    expect(stats(moved, registers, NEW_ROOM)).toEqual(stats(moved, registers, OLD_ROOM));
  });

  it("does not count ghost classes of a completed room", () => {
    const ghost = { _id: OLD_ROOM, status: "completed", completedAt: new Date("2026-10-01T02:53:00Z"), students: [STUDENT], generatedSessions: ["01", "08", "15"].map((day) => session(`2026-10-${day}T05:30:00Z`, { status: "scheduled" })) };
    const live = { _id: NEW_ROOM, status: "scheduled", students: [STUDENT], generatedSessions: ["01", "08", "15"].map((day) => session(`2026-10-${day}T05:30:00Z`)) };
    const result = stats([ghost, live], [{ _id: NEW_ROOM, attended: 3, held: 3 }], OLD_ROOM, OCTOBER);
    expect(result.classesAttended).toBe(3);
    expect(result.classesScheduled).toBe(3);
  });

  it("counts classes still to come only in a room the student is still in", () => {
    const running = { _id: NEW_ROOM, status: "scheduled", students: [STUDENT], generatedSessions: [session("2026-09-11T12:00:00Z"), session("2026-09-29T12:00:00Z", { status: "scheduled" })] };
    expect(stats([running], [{ _id: NEW_ROOM, attended: 1, held: 1 }], NEW_ROOM).classesScheduled).toBe(2);

    const left = { ...running, studentExits: [{ student: STUDENT, exitedAt: new Date("2026-09-15T00:00:00Z") }] };
    expect(stats([left], [{ _id: NEW_ROOM, attended: 1, held: 1 }], NEW_ROOM).classesScheduled).toBe(1);
  });

  it("leaves out demo and test classrooms", () => {
    const demo = { _id: MID_ROOM, classroomType: "demo", students: [STUDENT], generatedSessions: [] };
    const test = { _id: OLD_ROOM, isTestClassroom: true, students: [STUDENT], generatedSessions: [] };
    const live = { _id: NEW_ROOM, status: "scheduled", students: [STUDENT], generatedSessions: [session("2026-09-11T12:00:00Z")] };
    const result = stats([demo, test, live], [{ _id: MID_ROOM, attended: 1, held: 1 }, { _id: OLD_ROOM, attended: 2, held: 2 }, { _id: NEW_ROOM, attended: 1, held: 1 }], NEW_ROOM);
    expect(result).toEqual({ classesAttended: 1, classesScheduled: 1, topicsCovered: [] });
  });

  it("does not count a mirror's register again on top of its parent's class", () => {
    const parent = { _id: NEW_ROOM, status: "scheduled", students: [STUDENT], generatedSessions: [session("2026-09-11T12:00:00Z")] };
    const mirror = { _id: MID_ROOM, isSessionInstance: true, parentClassroom: NEW_ROOM, students: [STUDENT], generatedSessions: [] };
    const result = stats([parent, mirror], [{ _id: MID_ROOM, attended: 1, held: 1 }], NEW_ROOM);
    expect(result.classesAttended).toBe(1);
    expect(result.classesScheduled).toBe(1);
  });

  it("still counts the registers of a classroom that no longer exists", () => {
    const live = { _id: NEW_ROOM, status: "scheduled", students: [STUDENT], generatedSessions: [session("2026-09-11T12:00:00Z")] };
    const result = stats([live], [{ _id: OLD_ROOM, attended: 2, held: 2 }, { _id: NEW_ROOM, attended: 1, held: 1 }], NEW_ROOM);
    expect(result.classesAttended).toBe(3);
    expect(result.classesScheduled).toBe(3);
  });

  it("lists topics in class order, once each, and none from after the student left", () => {
    const first = { _id: OLD_ROOM, status: "completed", students: [STUDENT], studentExits: [{ student: STUDENT, exitedAt: new Date("2026-09-10T00:00:00Z") }], generatedSessions: [session("2026-09-03T12:00:00Z", { topicName: "Forks" }), session("2026-09-17T12:00:00Z", { topicName: "After leaving" })] };
    const second = { _id: NEW_ROOM, status: "scheduled", students: [STUDENT], generatedSessions: [session("2026-09-11T12:00:00Z", { topicName: "Pins" }), session("2026-09-18T12:00:00Z", { topicName: "Forks" })] };
    const result = stats([second, first], [{ _id: OLD_ROOM, attended: 1, held: 1 }, { _id: NEW_ROOM, attended: 2, held: 2 }], NEW_ROOM);
    expect(result.topicsCovered).toEqual(["Forks", "Pins"]);
  });
});

describe("refreshOutdatedReportStats", () => {
  function chain(value: any) {
    const query: any = { lean: () => Promise.resolve(value) };
    query.select = () => query;
    return query;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (MonthlyFeedback.find as any).mockReturnValue(chain([{ _id: "r1", month: "2026-09", student: STUDENT, classroom: OLD_ROOM }]));
    (MonthlyFeedback.updateOne as any).mockResolvedValue({ modifiedCount: 1 });
    (Classroom.find as any).mockReturnValue(chain([{ _id: NEW_ROOM, status: "scheduled", students: [STUDENT], generatedSessions: [] }]));
    (Attendance.aggregate as any).mockResolvedValue([{ _id: NEW_ROOM, attended: 4, held: 4 }]);
  });

  it("recomputes an unsent report and stamps it so it is not done again", async () => {
    expect(await refreshOutdatedReportStats()).toBe(1);

    const [filter, update] = (MonthlyFeedback.updateOne as any).mock.calls[0];
    expect(filter._id).toBe("r1");
    expect(update.$set.stats.classesAttended).toBe(4);
    expect(update.$set.statsVersion).toBe(STATS_VERSION);
  });

  it("never touches a sent report, even if it turned sent meanwhile", async () => {
    await refreshOutdatedReportStats();

    const query = (MonthlyFeedback.find as any).mock.calls[0][0];
    expect(query.status.$in).toEqual(["pending", "draft", "submitted", "changes_requested"]);
    expect(query.statsVersion).toEqual({ $ne: STATS_VERSION });
    expect((MonthlyFeedback.updateOne as any).mock.calls[0][0].status.$in).not.toContain("sent");
  });
});
