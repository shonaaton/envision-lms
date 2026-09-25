import { describe, expect, it } from "vitest";
import { canActOnTask, canManageTask, isOverdue, sortForDigest, taskActionSchema, taskCreateSchema } from "@/lib/tasks/taskRules";

const me = "aaaaaaaaaaaaaaaaaaaaaaa1";
const other = "aaaaaaaaaaaaaaaaaaaaaaa2";
const creator = "aaaaaaaaaaaaaaaaaaaaaaa3";

describe("canActOnTask", () => {
  const staff = { id: me, role: "sub-admin", pools: ["sales"] };

  it("lets the assignee and the creator act, but not a bystander", () => {
    expect(canActOnTask({ assignedTo: me }, staff)).toBe(true);
    expect(canActOnTask({ assignedTo: { _id: me } }, staff)).toBe(true);
    expect(canActOnTask({ assignedTo: other, createdBy: me }, staff)).toBe(true);
    expect(canActOnTask({ assignedTo: other, createdBy: creator }, staff)).toBe(false);
  });

  it("opens an unassigned task to its pool only", () => {
    expect(canActOnTask({ assignedTo: null, pool: "sales" }, staff)).toBe(true);
    expect(canActOnTask({ assignedTo: null, pool: "admins" }, staff)).toBe(false);
    // A pool task someone has already picked up is theirs.
    expect(canActOnTask({ assignedTo: other, pool: "sales" }, staff)).toBe(false);
  });

  it("treats an unassigned task with no pool as the admin team's", () => {
    expect(canActOnTask({ assignedTo: null, pool: null }, { id: me, role: "sub-admin", pools: ["admins"] })).toBe(true);
    expect(canActOnTask({ assignedTo: null, pool: null }, staff)).toBe(false);
  });

  it("lets admins see everything", () => {
    expect(canActOnTask({ assignedTo: other }, { id: me, role: "admin", pools: [] })).toBe(true);
    expect(canActOnTask({ assignedTo: other }, { id: me, role: "sub-admin", isSuperAdmin: true, pools: [] })).toBe(true);
  });
});

describe("canManageTask", () => {
  it("is the assigner's (or an admin's) call, not the assignee's", () => {
    expect(canManageTask({ assignedTo: me, createdBy: creator }, { id: me, role: "sub-admin", pools: [] })).toBe(false);
    expect(canManageTask({ assignedTo: me, createdBy: creator }, { id: creator, role: "sub-admin", pools: [] })).toBe(true);
    expect(canManageTask({ assignedTo: me }, { id: other, role: "admin", pools: [] })).toBe(true);
    // Automatic tasks have no creator: only admins manage them.
    expect(canManageTask({ assignedTo: me, createdBy: null }, { id: me, role: "sub-admin", pools: [] })).toBe(false);
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-09-25T10:00:00Z");
  it("only counts open tasks past their due date", () => {
    expect(isOverdue({ dueAt: "2026-09-25T09:00:00Z", status: "pending" }, now)).toBe(true);
    expect(isOverdue({ dueAt: "2026-09-25T09:00:00Z", status: "in_progress" }, now)).toBe(true);
    expect(isOverdue({ dueAt: "2026-09-25T09:00:00Z", status: "completed" }, now)).toBe(false);
    expect(isOverdue({ dueAt: "2026-09-25T11:00:00Z", status: "pending" }, now)).toBe(false);
    expect(isOverdue({ dueAt: null, status: "pending" }, now)).toBe(false);
  });
});

describe("sortForDigest", () => {
  it("puts overdue first, then high priority, then soonest due", () => {
    const now = new Date("2026-09-25T10:00:00Z");
    const sorted = sortForDigest(
      [
        { title: "no due", priority: "normal", status: "pending" },
        { title: "due later", priority: "normal", dueAt: "2026-09-27T00:00:00Z", status: "pending" },
        { title: "high", priority: "high", status: "pending" },
        { title: "overdue", priority: "low", dueAt: "2026-09-24T00:00:00Z", status: "pending" },
        { title: "due sooner", priority: "normal", dueAt: "2026-09-26T00:00:00Z", status: "pending" },
      ],
      now
    );
    expect(sorted.map((task) => task.title)).toEqual(["overdue", "high", "due sooner", "due later", "no due"]);
  });
});

describe("task schemas", () => {
  it("requires a title and a real person", () => {
    expect(taskCreateSchema.safeParse({ title: "ok", assignedTo: me }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ title: "Call the parent", assignedTo: "someone" }).success).toBe(false);
    const parsed = taskCreateSchema.parse({ title: "  Call the parent  ", assignedTo: me, details: "", dueAt: "" });
    expect(parsed).toMatchObject({ title: "Call the parent", priority: "normal", details: undefined, dueAt: undefined });
  });

  it("accepts only known actions", () => {
    expect(taskActionSchema.safeParse({ action: "complete", notes: "Called, enrolled for Saturday batch" }).success).toBe(true);
    expect(taskActionSchema.safeParse({ action: "delete" }).success).toBe(false);
    expect(taskActionSchema.safeParse({ action: "reassign", assignedTo: "x" }).success).toBe(false);
    expect(taskActionSchema.parse({ action: "update", dueAt: "" })).toMatchObject({ action: "update", dueAt: null });
  });
});
