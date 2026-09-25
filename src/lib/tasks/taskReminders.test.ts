import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  taskFind: vi.fn(),
  taskUpdateOne: vi.fn(),
  userFind: vi.fn(),
  poolMembers: vi.fn(),
  sendTaskDigest: vi.fn(),
  notifyTaskOverdue: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/models/InternalTask", () => ({ InternalTask: { find: mocks.taskFind, updateOne: mocks.taskUpdateOne } }));
vi.mock("@/models/User", () => ({ User: { find: mocks.userFind } }));
vi.mock("@/lib/tasks/taskRecipients", () => ({ poolMembers: mocks.poolMembers }));
vi.mock("@/lib/tasks/taskNotifications", () => ({ sendTaskDigest: mocks.sendTaskDigest, notifyTaskOverdue: mocks.notifyTaskOverdue }));

import { digestMessage, processDailyTaskReminders } from "@/lib/tasks/taskReminders";

const COACH = "aaaaaaaaaaaaaaaaaaaaaaa1";
const ADMIN = "aaaaaaaaaaaaaaaaaaaaaaa2";

function query(rows: any[]) {
  const q: any = { select: () => q, limit: () => q, lean: () => Promise.resolve(rows) };
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendTaskDigest.mockResolvedValue(true);
  mocks.notifyTaskOverdue.mockResolvedValue(undefined);
  mocks.poolMembers.mockResolvedValue([{ _id: ADMIN, name: "Admin", email: "admin@example.com" }]);
  mocks.userFind.mockReturnValue(query([{ _id: COACH, name: "Coach", email: "coach@example.com" }]));
});

describe("processDailyTaskReminders", () => {
  it("waits until the reminder hour in academy time", async () => {
    // 02:30 UTC = 08:00 IST — before 09:00.
    mocks.taskFind.mockReturnValueOnce(query([]));
    const result = await processDailyTaskReminders(new Date("2026-09-25T02:30:00Z"));
    expect(result.skipped).toBe("before_reminder_hour");
    expect(mocks.sendTaskDigest).not.toHaveBeenCalled();
  });

  it("does not mistake IST midnight for the reminder hour", async () => {
    // 18:45 UTC = 00:15 IST the next day — the hour some ICU builds print as "24".
    mocks.taskFind.mockReturnValueOnce(query([]));
    const result = await processDailyTaskReminders(new Date("2026-09-25T18:45:00Z"));
    expect(result.skipped).toBe("before_reminder_hour");
  });

  it("sends one digest per person, pool tasks going to every member", async () => {
    mocks.taskFind
      .mockReturnValueOnce(query([])) // overdue sweep
      .mockReturnValueOnce(
        query([
          { title: "Mark attendance", assignedTo: COACH, status: "pending", priority: "high" },
          { title: "Fill assessment", assignedTo: COACH, status: "pending", priority: "normal" },
          { title: "Review duplicate", assignedTo: null, pool: "admins", status: "pending", priority: "normal" },
        ])
      );
    // 04:00 UTC = 09:30 IST.
    const result = await processDailyTaskReminders(new Date("2026-09-25T04:00:00Z"));
    expect(result.digests).toBe(2);
    const byPerson = Object.fromEntries(mocks.sendTaskDigest.mock.calls.map(([person, input]) => [person._id, input]));
    expect(byPerson[COACH].title).toBe("Daily tasks: 2 pending");
    expect(byPerson[COACH].dateKey).toBe("2026-09-25");
    expect(byPerson[ADMIN].message).toContain("Review duplicate");
  });

  it("claims each overdue task before notifying, so a second sweep stays quiet", async () => {
    const overdue = { _id: "t1", title: "Call parent", dueAt: new Date("2026-09-24T00:00:00Z"), status: "pending" };
    mocks.taskFind.mockReturnValueOnce(query([overdue])).mockReturnValueOnce(query([]));
    mocks.taskUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 });
    const first = await processDailyTaskReminders(new Date("2026-09-25T02:30:00Z"));
    expect(first.overdueSent).toBe(1);

    mocks.taskFind.mockReturnValueOnce(query([overdue])).mockReturnValueOnce(query([]));
    mocks.taskUpdateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    const second = await processDailyTaskReminders(new Date("2026-09-25T02:40:00Z"));
    expect(second.overdueSent).toBe(0);
    expect(mocks.notifyTaskOverdue).toHaveBeenCalledTimes(1);
  });
});

describe("digestMessage", () => {
  it("leads with the count and flags overdue work", () => {
    const now = new Date("2026-09-25T04:00:00Z");
    const text = digestMessage(
      [
        { title: "Later", status: "pending", priority: "normal" },
        { title: "Late one", status: "pending", priority: "normal", dueAt: new Date("2026-09-24T04:00:00Z") },
      ],
      now
    );
    expect(text.startsWith("You have 2 pending tasks, 1 overdue.")).toBe(true);
    expect(text.indexOf("Late one")).toBeLessThan(text.indexOf("Later"));
    expect(text).toContain("OVERDUE");
  });
});
