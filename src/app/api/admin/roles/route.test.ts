import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), superAdmin: vi.fn(), create: vi.fn(), update: vi.fn(), audit: vi.fn(), exists: vi.fn(), find: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/featureAccess", () => ({ isSuperAdminSession: mocks.superAdmin, canAccessFeature: vi.fn(), getFeatureAccessSnapshot: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/accessRoles", () => ({ ensureSalesRole: vi.fn() }));
vi.mock("@/models/AccessRole", () => ({ AccessRole: { create: mocks.create, findById: mocks.find, findOneAndUpdate: mocks.update } }));
vi.mock("@/models/User", () => ({ User: { exists: mocks.exists } }));
vi.mock("@/models/FeatureAccess", () => ({ PermissionAudit: { create: mocks.audit } }));
import { POST } from "./route";
import { PATCH, DELETE } from "./[id]/route";
const id = "123456789012345678901234";
const req = (body: unknown) => new Request("http://localhost/api/admin/roles", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id, role: "admin" } }); mocks.superAdmin.mockResolvedValue(true); mocks.find.mockReturnValue({ lean: vi.fn().mockResolvedValue({ name: "Previous" }) }); });

describe("role administration routes", () => {
  it("refuses unauthenticated and non-super-admin mutations", async () => {
    mocks.superAdmin.mockResolvedValue(false);
    expect((await POST(req({}))).status).toBe(403);
    expect((await PATCH(req({}), { params: { id } })).status).toBe(403);
    expect((await DELETE(req({}), { params: { id } })).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("creates a named role with explicit grants and an audit record", async () => {
    mocks.create.mockImplementation(async input => ({ ...input, _id: id, toObject: () => input }));
    const response = await POST(req({ name: "  Relationship Team  ", permissions: { salesDirectory: ["view"] } }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Relationship Team", nameKey: "relationship team", permissions: expect.objectContaining({ salesDirectory: ["view"], accountSettings: ["view", "edit", "security"] }) }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ targetType: "role", actor: id }));
  });
  it("handles duplicate names and invalid permissions without silently granting access", async () => {
    mocks.create.mockRejectedValue({ code: 11000 });
    expect((await POST(req({ name: "Sales", permissions: {} }))).status).toBe(409);
    expect((await POST(req({ name: "Sales", permissions: { featureAccess: ["full"] } }))).status).toBe(400);
  });
  it("rejects stale role edits", async () => {
    mocks.update.mockResolvedValue(null);
    expect((await PATCH(req({ name: "Sales", permissions: {}, updatedAt: "2026-09-08T00:00:00.000Z" }), { params: { id } })).status).toBe(409);
    expect(mocks.update.mock.calls[0][0]).toEqual(expect.objectContaining({ updatedAt: new Date("2026-09-08T00:00:00.000Z"), archivedAt: null }));
  });
  it("refuses removal while accounts still reference the role", async () => {
    mocks.exists.mockResolvedValue({ _id: id });
    expect((await DELETE(req({}), { params: { id } })).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("archives an unused role and preserves its history", async () => {
    mocks.exists.mockResolvedValue(null);
    mocks.update.mockResolvedValue({ name: "Sales", toObject: () => ({ name: "Sales" }) });
    expect((await DELETE(req({}), { params: { id } })).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ _id: id, archivedAt: null }, { $set: expect.objectContaining({ isActive: false, archivedAt: expect.any(Date) }) });
    expect(mocks.audit).toHaveBeenCalled();
  });
});
