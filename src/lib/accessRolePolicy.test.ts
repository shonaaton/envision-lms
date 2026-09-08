import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/accessRoles", () => ({ resolveAccessRole: vi.fn() }));
import { FEATURE_DEFINITIONS } from "@/lib/featureRegistry";
import { evaluateFeatureState, type FeatureAccessSnapshot } from "@/lib/featureAccess";
import { ESSENTIAL_ROLE_GRANTS, PROTECTED_ROLE_FEATURES, SALES_ROLE_GRANTS, roleInputSchema, validateRoleGrants } from "@/lib/accessRolePolicy";
import { namedRoleApiFeature, namedRoleApiPermissions } from "@/lib/accessRoleRequests";

function feature(key: string, extra: Partial<FeatureAccessSnapshot> = {}): FeatureAccessSnapshot {
  return { ...FEATURE_DEFINITIONS.find(item => item.key === key)!, status: "enabled", rolePermissions: { student: [], instructor: [], admin: ["full"], "sub-admin": ["full"] }, pilotRoles: [], pilotUsers: [], pilotBatches: [], pilotCourses: [], userOverrides: [], ...extra };
}
const sales = { id: "staff-id", role: "sub-admin" as const, accessRoleId: "role-id", roleEnabled: true, roleGrants: SALES_ROLE_GRANTS };

describe("named role permission boundary", () => {
  it.each(FEATURE_DEFINITIONS.flatMap(item => item.permissions.map(permission => [item.key, permission.id])))('%s / %s follows only the saved role', (key, permission) => {
    const expected = Boolean(SALES_ROLE_GRANTS[key]?.includes(permission));
    expect(evaluateFeatureState({ feature: feature(key), user: sales, permission })).toBe(expected);
  });
  it("ignores stale per-user allows and denies from access templates", () => {
    expect(evaluateFeatureState({ feature: feature("fees", { userOverrides: [{ user: sales.id, access: "allow", permissions: [] }] }), user: sales })).toBe(false);
    expect(evaluateFeatureState({ feature: feature("salesCrm", { userOverrides: [{ user: sales.id, access: "deny", permissions: [] }] }), user: sales })).toBe(true);
  });
  it.each(["disabled", "coming_soon", "testing"] as const)("respects %s release state", status => {
    expect(evaluateFeatureState({ feature: feature("salesCrm", { status }), user: sales })).toBe(false);
  });
  it("allows explicit pilot membership but requires the role permission", () => {
    expect(evaluateFeatureState({ feature: feature("salesCrm", { status: "testing", pilotUsers: [sales.id] }), user: sales })).toBe(true);
    expect(evaluateFeatureState({ feature: feature("fees", { status: "testing", pilotUsers: [sales.id] }), user: sales })).toBe(false);
  });
  it("deactivation or a missing role never falls back to Sub Admin grants", () => {
    expect(evaluateFeatureState({ feature: feature("salesCrm"), user: { ...sales, roleEnabled: false } })).toBe(false);
    expect(evaluateFeatureState({ feature: feature("salesCrm"), user: { ...sales, roleGrants: {} } })).toBe(false);
    expect(evaluateFeatureState({ feature: feature("accountSettings"), user: { ...sales, roleEnabled: false }, permission: "security" })).toBe(true);
  });
  it("preserves built-in role behavior", () => {
    expect(evaluateFeatureState({ feature: feature("fees"), user: { id: "legacy", role: "sub-admin" } })).toBe(true);
    expect(evaluateFeatureState({ feature: feature("fees", { status: "disabled" }), user: { id: "owner", role: "admin", isSuperAdmin: true } })).toBe(true);
  });
});

describe("role input validation", () => {
  it("adds view dependencies and essential self-service permissions", () => {
    expect(validateRoleGrants({ classrooms: ["edit", "edit"] })).toEqual({ classrooms: ["view", "edit"], ...ESSENTIAL_ROLE_GRANTS });
  });
  it.each(PROTECTED_ROLE_FEATURES)("cannot delegate %s", key => expect(() => validateRoleGrants({ [key]: ["view"] })).toThrow(/Super Admin/));
  it("rejects unknown and invented permission IDs", () => {
    expect(() => validateRoleGrants({ unknown: ["view"] })).toThrow();
    expect(() => validateRoleGrants({ salesDirectory: ["export"] })).toThrow();
    expect(() => validateRoleGrants({ classrooms: ["full"] })).toThrow();
  });
  it("rejects blank, reserved names, and privilege fields", () => {
    for (const name of [" ", "a", "Admin", "SUPER ADMIN", "Student", "x".repeat(81)]) expect(roleInputSchema.safeParse({ name, permissions: {} }).success).toBe(false);
    expect(roleInputSchema.safeParse({ name: "Sales", permissions: {}, isSuperAdmin: true }).success).toBe(false);
  });
});

describe("API mapping", () => {
  it("uses the specific feature for finance and reports", () => {
    expect(namedRoleApiFeature("/api/fees/analytics")).toBe("feeDashboard");
    expect(namedRoleApiFeature("/api/fees/invoices/123/pdf")).toBe("invoices");
    expect(namedRoleApiFeature("/api/admin/activity-tracker/export")).toBe("activityTracker");
    expect(namedRoleApiFeature("/api/admin/reports")).toBe("reportsCenter");
    expect(namedRoleApiFeature("/api/admin/unregistered-tool")).toBeUndefined();
    expect(namedRoleApiFeature("/api/sales/directory-escape")).toBeUndefined();
  });
  it("blocks write and export routes for a view-only role", () => {
    expect(namedRoleApiPermissions("/api/admin/users", "POST")).toEqual(["create"]);
    expect(namedRoleApiPermissions("/api/admin/users/123", "DELETE")).toEqual(["delete"]);
    expect(namedRoleApiPermissions("/api/tournaments/123/games/export", "GET")).toEqual(["export"]);
    expect(namedRoleApiPermissions("/api/tournaments/123/start", "POST")).toEqual(["pairings"]);
    expect(namedRoleApiPermissions("/api/sales/crm/leads/123", "PATCH")).toEqual(["stage", "note"]);
    expect(namedRoleApiPermissions("/api/profile/password", "PATCH")).toEqual(["security"]);
    expect(namedRoleApiPermissions("/api/classrooms/123", "PATCH")).toEqual(["edit", "cancel", "assign", "create", "attendance"]);
    expect(namedRoleApiPermissions("/api/classrooms/123", "DELETE")).toEqual(["cancel"]);
    expect(namedRoleApiPermissions("/api/fees/reminders", "POST")).toEqual(["invoice", "credit"]);
  });
});
