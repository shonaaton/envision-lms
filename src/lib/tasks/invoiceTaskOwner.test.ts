import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/tasks/taskService", () => ({
  cancelAutoTask: vi.fn(),
  ensureAutoTask: vi.fn(async (input: any) => input),
  reassignAutoTasks: vi.fn(),
  resolveAutoTask: vi.fn(),
  resolveAutoTasksWhere: vi.fn(),
}));
vi.mock("@/models/InternalTask", () => ({ InternalTask: { updateMany: vi.fn() } }));
vi.mock("@/models/User", () => ({ User: { findOne: vi.fn() } }));

import { moveInvoiceTasksToOwner, raiseCreditsExhaustedTask, raiseOverdueInvoiceTask } from "@/lib/tasks/taskTriggers";
import { ensureAutoTask } from "@/lib/tasks/taskService";
import { InternalTask } from "@/models/InternalTask";
import { User } from "@/models/User";

const SAPTARSHI = "64a000000000000000000001";
const INVOICE = "64b000000000000000000001";
const STUDENT = "64c000000000000000000001";

function owner(value: any) {
  const query: any = { lean: () => Promise.resolve(value) };
  query.select = () => query;
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.INVOICE_TASK_OWNER_EMAIL;
});

describe("invoice tasks belong to Saptarshi", () => {
  it("assigns Chase payment and Credits exhausted to Saptarshi, not the admin queue", async () => {
    (User.findOne as any).mockReturnValue(owner({ _id: SAPTARSHI }));
    await raiseOverdueInvoiceTask({ invoice: { _id: INVOICE, invoiceNumber: "INV-1" }, student: { _id: STUDENT, name: "Riya" }, daysOverdue: 3 });
    await raiseCreditsExhaustedTask({ student: { _id: STUDENT, name: "Riya" }, balance: 0 });
    const calls = (ensureAutoTask as any).mock.calls.map((call: any[]) => call[0]);
    expect(calls.map((input: any) => [input.kind, input.assignedTo, input.pool])).toEqual([
      ["invoice_overdue", SAPTARSHI, undefined],
      ["credits_exhausted", SAPTARSHI, undefined],
    ]);
    expect((User.findOne as any).mock.calls[0][0].email).toBe("saptarshi2856@gmail.com");
  });

  it("falls back to the admin queue if Saptarshi's account is missing, rather than dropping the task", async () => {
    (User.findOne as any).mockReturnValue(owner(null));
    await raiseCreditsExhaustedTask({ student: { _id: STUDENT }, balance: 0 });
    expect((ensureAutoTask as any).mock.calls[0][0]).toMatchObject({ pool: "admins" });
  });

  it("moves every open invoice task held by anyone else over to Saptarshi", async () => {
    (User.findOne as any).mockReturnValue(owner({ _id: SAPTARSHI }));
    (InternalTask.updateMany as any).mockResolvedValue({ modifiedCount: 4 });
    expect(await moveInvoiceTasksToOwner()).toEqual({ moved: 4 });
    const [filter, update] = (InternalTask.updateMany as any).mock.calls[0];
    expect(filter).toEqual({
      kind: { $in: ["invoice_overdue", "credits_exhausted"] },
      status: { $in: ["pending", "in_progress"] },
      assignedTo: { $ne: SAPTARSHI },
    });
    expect(update).toEqual({ $set: { assignedTo: SAPTARSHI, pool: null } });
  });

  it("moves nothing when Saptarshi's account cannot be found", async () => {
    (User.findOne as any).mockReturnValue(owner(null));
    expect(await moveInvoiceTasksToOwner()).toEqual({ moved: 0 });
    expect(InternalTask.updateMany).not.toHaveBeenCalled();
  });
});
