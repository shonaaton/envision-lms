import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ roles: vi.fn(), users: vi.fn() }));
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/demoNotificationRecipients", () => ({ SALES_ACCESS_ROLE_NAME_KEY: "sales" }));
vi.mock("@/models/AccessRole", () => ({ AccessRole: { find: mocks.roles } }));
vi.mock("@/models/User", () => ({ User: { find: mocks.users } }));

import { poolMembers, poolsForActor } from "@/lib/tasks/taskRecipients";

function query(rows: any[]) {
  return { select: () => ({ lean: async () => rows }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roles.mockReturnValue(query([{ _id: "sales-role" }]));
  mocks.users.mockReturnValue(query([]));
});

describe("shared admin tasks", () => {
  it("includes sub-admins with and without custom roles", async () => {
    for (const accessRoleId of [null, "operations-role"]) {
      expect(await poolsForActor({ id: "staff", role: "sub-admin", accessRoleId })).toEqual(["admins"]);
    }
    expect(await poolsForActor({ id: "admin", role: "admin" })).toEqual(["admins"]);
  });

  it("keeps sales and coaches out of the admin queue", async () => {
    expect(await poolsForActor({ id: "sales", role: "sub-admin", accessRoleId: "sales-role" })).toEqual(["sales"]);
    expect(await poolsForActor({ id: "coach", role: "instructor" })).toEqual([]);
  });

  it("includes active custom-role sub-admins in notifications and reminders", async () => {
    mocks.users.mockReturnValue(query([{ _id: "staff", name: "Operations", email: "ops@example.com" }]));
    expect(await poolMembers("admins")).toEqual([{ _id: "staff", name: "Operations", email: "ops@example.com" }]);
    expect(mocks.users).toHaveBeenCalledWith({
      isActive: { $ne: false },
      $or: [{ role: "admin" }, { role: "sub-admin", accessRole: { $nin: ["sales-role"] } }],
    });
  });
});
