import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  userFindById: vi.fn(),
  notifyTaskCreated: vi.fn(),
  notifyTaskCompleted: vi.fn(),
  notifyTaskReassigned: vi.fn(),
  notifyTaskCancelled: vi.fn(),
  poolsForActor: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/models/InternalTask", () => ({
  InternalTask: { findOneAndUpdate: mocks.findOneAndUpdate, findById: mocks.findById, create: mocks.create },
}));
vi.mock("@/models/User", () => ({ User: { findById: mocks.userFindById } }));
vi.mock("@/lib/tasks/taskNotifications", () => ({
  notifyTaskCreated: mocks.notifyTaskCreated,
  notifyTaskCompleted: mocks.notifyTaskCompleted,
  notifyTaskReassigned: mocks.notifyTaskReassigned,
  notifyTaskCancelled: mocks.notifyTaskCancelled,
}));
vi.mock("@/lib/tasks/taskRecipients", () => ({ poolsForActor: mocks.poolsForActor }));

import { TaskError, applyTaskAction, createManualTask, ensureAutoTask, resolveAutoTask } from "@/lib/tasks/taskService";

const ME = "aaaaaaaaaaaaaaaaaaaaaaa1";
const BOSS = "aaaaaaaaaaaaaaaaaaaaaaa2";
const TASK = "bbbbbbbbbbbbbbbbbbbbbbb1";
const REF = "ccccccccccccccccccccccc1";

/** A chainable stand-in for `findById(...).populate(...)...lean()`. */
function chain(value: any) {
  const query: any = { populate: () => query, select: () => query, lean: () => Promise.resolve(value) };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notifyTaskCreated.mockResolvedValue(undefined);
  mocks.notifyTaskCompleted.mockResolvedValue(undefined);
  mocks.poolsForActor.mockResolvedValue([]);
});

describe("ensureAutoTask", () => {
  const input = { kind: "attendance_unmarked", referenceType: "AttendanceSession", referenceId: REF, title: "Mark attendance", assignedTo: ME };

  it("notifies only when the task is new", async () => {
    mocks.findOneAndUpdate.mockResolvedValueOnce({ value: { _id: TASK, status: "pending" }, lastErrorObject: { upserted: TASK } });
    await ensureAutoTask(input);
    expect(mocks.notifyTaskCreated).toHaveBeenCalledTimes(1);

    mocks.findOneAndUpdate.mockResolvedValueOnce({ value: { _id: TASK, status: "pending" }, lastErrorObject: {} });
    await ensureAutoTask(input);
    expect(mocks.notifyTaskCreated).toHaveBeenCalledTimes(1);
  });

  it("never reopens a task a person closed unless asked to", async () => {
    mocks.findOneAndUpdate.mockResolvedValueOnce({ value: { _id: TASK, status: "completed" }, lastErrorObject: {} });
    await ensureAutoTask(input);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.notifyTaskCreated).not.toHaveBeenCalled();
  });

  it("reopens a recurring condition and tells the owner again", async () => {
    mocks.findOneAndUpdate
      .mockResolvedValueOnce({ value: { _id: TASK, status: "completed", metadata: {} }, lastErrorObject: {} })
      .mockReturnValueOnce({ lean: () => Promise.resolve({ _id: TASK, status: "pending" }) });
    const task = await ensureAutoTask({ ...input, reopenIfClosed: true });
    expect(task.status).toBe("pending");
    const [filter, update] = mocks.findOneAndUpdate.mock.calls[1];
    expect(filter).toMatchObject({ status: "completed" });
    expect(update.$set).toMatchObject({ status: "pending", completedAt: null, completionNotes: "" });
    expect(mocks.notifyTaskCreated).toHaveBeenCalledTimes(1);
  });

  it("falls back to the admin pool when nobody is assigned", async () => {
    mocks.findOneAndUpdate.mockResolvedValueOnce({ value: null, lastErrorObject: {} });
    await ensureAutoTask({ ...input, assignedTo: undefined });
    expect(mocks.findOneAndUpdate.mock.calls[0][1].$setOnInsert).toMatchObject({ assignedTo: null, pool: "admins", source: "auto" });
  });

  it("ignores a missing reference instead of writing a broken task", async () => {
    expect(await ensureAutoTask({ ...input, referenceId: "" })).toBeNull();
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("resolveAutoTask", () => {
  it("only closes a task that is still open, and marks it automatic", async () => {
    mocks.findOneAndUpdate.mockReturnValueOnce({ lean: () => Promise.resolve(null) });
    await resolveAutoTask("AttendanceSession", REF, { by: ME });
    const [filter, update] = mocks.findOneAndUpdate.mock.calls[0];
    expect(filter.status).toEqual({ $in: ["pending", "in_progress"] });
    expect(update.$set).toMatchObject({ status: "completed", completionAuto: true });
  });
});

describe("manual tasks", () => {
  it("refuses to assign to a coach", async () => {
    mocks.userFindById.mockReturnValueOnce(chain({ _id: BOSS, role: "instructor", isActive: true }));
    await expect(createManualTask({ title: "Call parent", assignedTo: BOSS, priority: "normal" }, { id: ME, name: "Me", role: "sub-admin" })).rejects.toThrow(TaskError);
  });

  it("creates a self-referencing manual task and tells the assignee", async () => {
    mocks.userFindById.mockReturnValueOnce(chain({ _id: BOSS, role: "sub-admin", isActive: true }));
    mocks.create.mockImplementationOnce(async (doc: any) => ({ toObject: () => doc }));
    const task = await createManualTask({ title: "Call parent", assignedTo: BOSS, priority: "high" }, { id: ME, name: "Me", role: "admin" });
    expect(task.referenceType).toBe("Manual");
    expect(String(task.referenceId)).toBe(String(task._id));
    expect(task).toMatchObject({ source: "manual", kind: "manual" });
    expect(mocks.notifyTaskCreated).toHaveBeenCalledWith(expect.objectContaining({ title: "Call parent" }), "Me");
  });

  const manualTask = { _id: TASK, title: "Call parent", status: "pending", source: "manual", assignedTo: { _id: ME, name: "Me" }, createdBy: { _id: BOSS, name: "Boss" } };

  it("needs completion notes so the assigner hears what was done", async () => {
    mocks.findById.mockReturnValue(chain(manualTask));
    await expect(applyTaskAction(TASK, { action: "complete" }, { id: ME, role: "sub-admin" })).rejects.toThrow(/note/);
  });

  it("completes with notes and reports back to the assigner", async () => {
    mocks.findById.mockReturnValue(chain(manualTask));
    const saved = { ...manualTask, status: "completed", completionNotes: "Spoke to the mother", completedBy: ME };
    mocks.findOneAndUpdate.mockReturnValueOnce({ lean: () => Promise.resolve(saved) });
    await applyTaskAction(TASK, { action: "complete", notes: "Spoke to the mother" }, { id: ME, name: "Me", role: "sub-admin" });
    const [filter, update] = mocks.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ status: "pending" });
    expect(update.$set).toMatchObject({ status: "completed", completionNotes: "Spoke to the mother", completionAuto: false });
    expect(mocks.notifyTaskCompleted).toHaveBeenCalledWith(saved, "Me");
  });

  it("reports a clash when someone else closed it first", async () => {
    mocks.findById.mockReturnValue(chain(manualTask));
    mocks.findOneAndUpdate.mockReturnValueOnce({ lean: () => Promise.resolve(null) });
    await expect(applyTaskAction(TASK, { action: "complete", notes: "done" }, { id: ME, role: "sub-admin" })).rejects.toMatchObject({ status: 409 });
  });

  it("does not let the assignee cancel what they were asked to do", async () => {
    mocks.findById.mockReturnValue(chain(manualTask));
    await expect(applyTaskAction(TASK, { action: "cancel" }, { id: ME, role: "sub-admin" })).rejects.toMatchObject({ status: 403 });
  });

  it("hides a task from people it has nothing to do with", async () => {
    mocks.findById.mockReturnValue(chain(manualTask));
    await expect(applyTaskAction(TASK, { action: "start" }, { id: "ddddddddddddddddddddddd1", role: "sub-admin" })).rejects.toMatchObject({ status: 404 });
  });

  it("gives a pool task to whoever completes it", async () => {
    const poolTask = { _id: TASK, title: "Review duplicate", status: "pending", source: "auto", assignedTo: null, pool: "admins" };
    mocks.poolsForActor.mockResolvedValue(["admins"]);
    mocks.findById.mockReturnValue(chain(poolTask));
    mocks.findOneAndUpdate.mockReturnValueOnce({ lean: () => Promise.resolve({ ...poolTask, status: "completed" }) });
    await applyTaskAction(TASK, { action: "complete" }, { id: ME, role: "sub-admin" });
    expect(String(mocks.findOneAndUpdate.mock.calls[0][1].$set.assignedTo)).toBe(ME);
  });
});
