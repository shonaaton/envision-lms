import { describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
vi.mock("@/models/User", () => ({ User: {} }));
import { onlineActivityFilter } from "./hideFromOnline";

describe("online activity leaves Bowbazar out", () => {
  it("drops rows by or about a branch account, and branch-typed rows", () => {
    const id = new Types.ObjectId();
    const filter: any = onlineActivityFilter([id]);
    expect(filter.actor.$nin).toEqual([id]);
    expect(filter.targetUser.$nin).toEqual([id]);
    expect(filter.type.$not.test("branch.achievement_added")).toBe(true);
    expect(filter.type.$not.test("fees.invoice.paid")).toBe(false);
  });
});
