import { z } from "zod";
import { FEATURE_DEFINITIONS } from "@/lib/featureRegistry";

export type RoleGrants = Record<string, string[]>;
export type NamedRole = { _id: string; name: string; description: string; permissions: RoleGrants; isActive: boolean; updatedAt: string; memberCount: number };
export const PROTECTED_ROLE_FEATURES = ["featureAccess", "roleManagement"];
// Kept to built-in Admins and Sub Admins. A named role can never carry them,
// whatever an older saved role document still lists.
export const ADMIN_ONLY_ROLE_FEATURES = ["salesPerformance", "salesDirectory", "salesCrm", "studentPause", "onboarding", "retention"];
export const ESSENTIAL_ROLE_GRANTS: RoleGrants = {
  dashboard: ["view"], accountSettings: ["view", "edit", "security"], notifications: ["view"],
  taskManager: ["view", "create", "edit"],
  leaveManagement: ["view", "create", "edit"],
};
/**
 * Features a named role never gets, whatever its grants or the essentials say:
 * marketing staff are outside the staff leave system (user, 2026-10-01).
 * Keyed by the role's nameKey (its lowercased name).
 */
export const NAMED_ROLE_EXCLUDED_FEATURES: Record<string, string[]> = {
  marketing: ["leaveManagement"],
};
export function isFeatureExcludedForRole(roleName: unknown, featureKey: string) {
  return Boolean(NAMED_ROLE_EXCLUDED_FEATURES[String(roleName || "").trim().toLowerCase()]?.includes(featureKey));
}
export const SALES_ROLE_GRANTS: RoleGrants = {
  ...ESSENTIAL_ROLE_GRANTS, batchVacancy: ["view"],
  contactEnquiries: ["view", "manage"],
  staffInvoices: ["view"],
};
export const MARKETING_ROLE_GRANTS: RoleGrants = {
  ...SALES_ROLE_GRANTS, demoCenter: ["view", "edit", "approve", "export"], marketingAnalytics: ["view"],
};
export const roleInputSchema = z.object({
  name: z.string().trim().min(2).max(80).refine(value => !["admin", "super admin", "super-admin", "sub admin", "sub-admin", "student", "instructor", "coach"].includes(value.toLowerCase()), "Choose a name different from a built-in role."),
  description: z.string().trim().max(500).default(""),
  permissions: z.record(z.array(z.string())),
  isActive: z.boolean().default(true),
  updatedAt: z.string().optional(),
}).strict();

export function validateRoleGrants(input: RoleGrants): RoleGrants {
  const output: RoleGrants = {};
  for (const [key, values] of Object.entries(input)) {
    const feature = FEATURE_DEFINITIONS.find(item => item.key === key);
    if (!feature || values.some(value => !feature.permissions.some(permission => permission.id === value))) throw new Error(`Invalid feature or permission: ${key}`);
    if (PROTECTED_ROLE_FEATURES.includes(key) && values.length) throw new Error("Security administration is reserved for Super Admins.");
    if (ADMIN_ONLY_ROLE_FEATURES.includes(key)) continue;
    if (values.length) output[key] = Array.from(new Set(["view", ...values]));
  }
  for (const [key, values] of Object.entries(ESSENTIAL_ROLE_GRANTS)) output[key] = Array.from(new Set([...(output[key] || []), ...values]));
  return output;
}

export function roleHasPermission(grants: RoleGrants | undefined, key: string, permission: string) {
  if (PROTECTED_ROLE_FEATURES.includes(key) || ADMIN_ONLY_ROLE_FEATURES.includes(key)) return false;
  // Essentials are merged in on save, but roles saved before an essential was
  // added would otherwise lack it until someone re-saved them.
  if (ESSENTIAL_ROLE_GRANTS[key]?.includes(permission)) return true;
  return Boolean(grants?.[key]?.includes(permission) || grants?.[key]?.includes("full"));
}
