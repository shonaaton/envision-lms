import "server-only";

import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { FeatureAccess, PermissionAudit, PermissionTemplate } from "@/models/FeatureAccess";
import { User } from "@/models/User";
import {
  FEATURE_DEFINITIONS,
  PORTAL_ROLES,
  findFeatureByApiPath,
  findFeatureByPath,
  type FeatureDefinition,
  type FeatureStatus,
  type PortalRole,
} from "@/lib/featureRegistry";

export type FeatureAccessState = {
  key: string;
  status: FeatureStatus;
  rolePermissions: Record<PortalRole, string[]>;
  pilotRoles: PortalRole[];
  pilotUsers: string[];
  pilotBatches: string[];
  pilotCourses: string[];
  userOverrides: Array<{
    user: string;
    access: "role_default" | "allow" | "deny";
    permissions: string[];
    expiresAt?: string;
    note?: string;
  }>;
  releaseNote?: string;
  updatedAt?: string;
};

export type FeatureAccessSnapshot = FeatureDefinition & FeatureAccessState;

export type SessionUser = {
  id?: string;
  role?: PortalRole;
  isSuperAdmin?: boolean;
  accountStatus?: string;
};

function rolePermissionsFor(feature: FeatureDefinition): Record<PortalRole, string[]> {
  return {
    student: [...(feature.defaultRolePermissions?.student || [])],
    instructor: [...(feature.defaultRolePermissions?.instructor || [])],
    admin: [...(feature.defaultRolePermissions?.admin || [])],
    "sub-admin": [...(feature.defaultRolePermissions?.["sub-admin"] || [])],
  };
}

function defaultState(feature: FeatureDefinition): FeatureAccessState {
  return {
    key: feature.key,
    status: feature.defaultStatus || "disabled",
    rolePermissions: rolePermissionsFor(feature),
    pilotRoles: [],
    pilotUsers: [],
    pilotBatches: [],
    pilotCourses: [],
    userOverrides: [],
  };
}

function ids(values: any[] | undefined) {
  return (values || []).map((value) => value?.toString?.() || String(value)).filter(Boolean);
}

function normalizeState(feature: FeatureDefinition, doc?: any): FeatureAccessState {
  const base = defaultState(feature);
  if (!doc) return base;
  const rolePermissions = doc.rolePermissions || {};
  const normalizedRolePermissions = (role: PortalRole) => {
    const configured = Array.isArray(rolePermissions[role]) ? rolePermissions[role].map(String) : [];
    if (feature.key !== "analysisBoard") return configured;
    return Array.from(new Set([...(base.rolePermissions[role] || []), ...configured]));
  };
  return {
    key: feature.key,
    status: (doc.status || base.status) as FeatureStatus,
    rolePermissions: {
      student: normalizedRolePermissions("student"),
      instructor: normalizedRolePermissions("instructor"),
      admin: normalizedRolePermissions("admin"),
      "sub-admin": normalizedRolePermissions("sub-admin"),
    },
    pilotRoles: [...(doc.pilotRoles || [])],
    pilotUsers: ids(doc.pilotUsers),
    pilotBatches: ids(doc.pilotBatches),
    pilotCourses: ids(doc.pilotCourses),
    userOverrides: (doc.userOverrides || []).map((override: any) => ({
      user: override.user?.toString?.() || String(override.user),
      access: override.access || "role_default",
      permissions: [...(override.permissions || [])],
      expiresAt: override.expiresAt ? new Date(override.expiresAt).toISOString() : undefined,
      note: override.note || undefined,
    })),
    releaseNote: doc.releaseNote || undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}

export async function ensureFeatureAccessDocuments() {
  await dbConnect();
  await Promise.all(
    FEATURE_DEFINITIONS.map((feature) =>
      FeatureAccess.updateOne(
        { key: feature.key },
        {
          $setOnInsert: {
            key: feature.key,
            status: feature.defaultStatus || "disabled",
            rolePermissions: rolePermissionsFor(feature),
          },
        },
        { upsert: true }
      )
    )
  );
}

export async function seedPermissionTemplates(actorId?: string) {
  await dbConnect();
  const templates = [
    { name: "Standard Student", role: "student", description: "Core student learning, classes, training, tournaments, and billing visibility." },
    { name: "Demo Student", role: "student", description: "Limited demo account access for booking and practice trials." },
    { name: "Trial Student", role: "student", description: "Student access for trials before full enrollment." },
    { name: "Standard Coach", role: "instructor", description: "Coach teaching tools, classroom access, PGNs, homework, and communication." },
    { name: "Senior Coach", role: "instructor", description: "Coach access with broader classroom and homework management." },
    { name: "Branch Admin", role: "admin", description: "Operations admin access without Super Admin controls." },
    { name: "Finance Admin", role: "admin", description: "Payments, invoices, credits, and finance reports." },
    { name: "Tournament Admin", role: "admin", description: "Tournament creation, pairings, participant control, and exports." },
    { name: "Content Admin", role: "admin", description: "Courses, PGNs, homework, announcements, and learning content." },
    { name: "Super Admin", role: "admin", description: "Full portal administration and protected feature access controls." },
    { name: "Standard Sub Admin", role: "sub-admin", description: "Starts with no access. Super Admins can grant selected modules from Feature Access." },
  ] as const;

  const featureDefaults = FEATURE_DEFINITIONS.reduce<Record<string, string[]>>((acc, feature) => {
    acc[feature.key] = feature.defaultRolePermissions?.admin || [];
    return acc;
  }, {});

  await Promise.all(
    templates.map((template) =>
      PermissionTemplate.updateOne(
        { name: template.name },
        {
          $setOnInsert: {
            ...template,
            permissions:
              template.name === "Finance Admin"
                ? { fees: featureDefaults.fees || [], reports: ["view", "export"] }
                : template.name === "Tournament Admin"
                  ? { tournaments: featureDefaults.tournaments || [], leaderboards: ["view", "export"] }
                  : template.name === "Content Admin"
                    ? { homework: featureDefaults.homework || [], pgnLibrary: featureDefaults.pgnLibrary || [], courseManagement: ["view", "create", "edit", "assign"] }
                    : {},
            isSystem: true,
            updatedBy: actorId ? new Types.ObjectId(actorId) : undefined,
          },
        },
        { upsert: true }
      )
    )
  );
}

export async function getFeatureAccessSnapshot(): Promise<FeatureAccessSnapshot[]> {
  await dbConnect();
  const featureKeys = FEATURE_DEFINITIONS.map((feature) => feature.key);
  let docs = await FeatureAccess.find({ key: { $in: featureKeys } }).lean();
  const existingKeys = new Set(docs.map((doc: any) => String(doc.key)));
  const missingFeatures = FEATURE_DEFINITIONS.filter((feature) => !existingKeys.has(feature.key));

  if (missingFeatures.length) {
    await Promise.all(
      missingFeatures.map((feature) =>
        FeatureAccess.updateOne(
          { key: feature.key },
          {
            $setOnInsert: {
              key: feature.key,
              status: feature.defaultStatus || "disabled",
              rolePermissions: rolePermissionsFor(feature),
            },
          },
          { upsert: true },
        ),
      ),
    );
    docs = await FeatureAccess.find({ key: { $in: featureKeys } }).lean();
  }
  const byKey = new Map(docs.map((doc: any) => [doc.key, doc]));
  return FEATURE_DEFINITIONS.map((feature) => ({ ...feature, ...normalizeState(feature, byKey.get(feature.key)) }));
}

export async function getFeatureAccessMap() {
  const snapshot = await getFeatureAccessSnapshot();
  return new Map(snapshot.map((feature) => [feature.key, feature]));
}

export async function isSuperAdminSession(user?: SessionUser | null) {
  if (!user?.id || user.role !== "admin") return false;
  if (user.isSuperAdmin) return true;
  await dbConnect();
  const explicitSuperAdminExists = await User.exists({ role: "admin", isSuperAdmin: true, isActive: { $ne: false } });
  if (explicitSuperAdminExists) return false;
  return Boolean(await User.exists({ _id: user.id, role: "admin", isActive: { $ne: false } }));
}

export async function requireSuperAdmin() {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!(await isSuperAdminSession(user))) return null;
  return session;
}

function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(permissions?.includes("full") || permissions?.includes(permission));
}

function activeOverride(state: FeatureAccessState, userId?: string) {
  if (!userId) return null;
  const now = Date.now();
  return (
    state.userOverrides.find((override) => {
      if (override.user !== userId) return false;
      if (!override.expiresAt) return true;
      return new Date(override.expiresAt).getTime() > now;
    }) || null
  );
}

export function evaluateFeatureState({
  feature,
  user,
  permission = "view",
  allowComingSoonView = false,
}: {
  feature: FeatureAccessSnapshot;
  user: SessionUser;
  permission?: string;
  allowComingSoonView?: boolean;
}) {
  if (user.isSuperAdmin && user.role === "admin") return true;
  const role = user.role;
  if (!role) return false;
  const override = activeOverride(feature, user.id);
  if (override?.access === "deny") return false;
  if (override?.access === "allow" && (override.permissions.length === 0 || hasPermission(override.permissions, permission))) return true;
  if (feature.status === "disabled") return false;
  if (feature.status === "coming_soon") return allowComingSoonView && permission === "view";
  if (feature.status === "testing" && !feature.pilotRoles.includes(role) && !feature.pilotUsers.includes(user.id || "")) return false;
  return hasPermission(feature.rolePermissions[role], permission);
}

export async function canAccessFeature(featureKey: string, user: SessionUser, permission = "view") {
  const features = await getFeatureAccessMap();
  const feature = features.get(featureKey);
  if (!feature) return false;
  const isSuperAdmin = await isSuperAdminSession(user);
  return evaluateFeatureState({ feature, user: { ...user, isSuperAdmin }, permission });
}

export async function getFeaturePermissionState(featureKey: string, user: SessionUser, permissions: readonly string[]) {
  const features = await getFeatureAccessMap();
  const feature = features.get(featureKey);
  const result: Record<string, boolean> = {};
  if (!feature) {
    permissions.forEach((permission) => { result[permission] = false; });
    return result;
  }

  const isSuperAdmin = await isSuperAdminSession(user);
  const effectiveUser = { ...user, isSuperAdmin };
  permissions.forEach((permission) => {
    result[permission] = evaluateFeatureState({ feature, user: effectiveUser, permission });
  });
  return result;
}

export async function canAccessPath(pathname: string, user: SessionUser, permission = "view") {
  const definition = findFeatureByPath(pathname);
  if (!definition) return true;
  return canAccessFeature(definition.key, user, permission);
}

export async function canAccessApiPath(pathname: string, user: SessionUser, permission = "view") {
  const definition = findFeatureByApiPath(pathname);
  if (!definition) return true;
  return canAccessFeature(definition.key, user, permission);
}

export async function getNavigationFeatureState(user: SessionUser) {
  const snapshot = await getFeatureAccessSnapshot();
  const isSuperAdmin = await isSuperAdminSession(user);
  const effectiveUser = { ...user, isSuperAdmin };
  return snapshot.reduce<Record<string, { visible: boolean; status: FeatureStatus; permissions: string[] }>>((acc, feature) => {
    acc[feature.key] = {
      visible: evaluateFeatureState({ feature, user: effectiveUser, permission: "view", allowComingSoonView: true }),
      status: feature.status,
      permissions: feature.permissions
        .filter((permission) => evaluateFeatureState({ feature, user: effectiveUser, permission: permission.id }))
        .map((permission) => permission.id),
    };
    return acc;
  }, {});
}

export async function getPermissionAudit(limit = 40) {
  await dbConnect();
  return PermissionAudit.find({})
    .populate("actor", "name email username")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

export async function getPermissionTemplates() {
  await seedPermissionTemplates();
  return PermissionTemplate.find({}).sort({ isSystem: -1, role: 1, name: 1 }).lean();
}

export function sanitizeRolePermissions(input: any, feature: FeatureDefinition): Record<PortalRole, string[]> {
  const allowed = new Set(feature.permissions.map((permission) => permission.id));
  return PORTAL_ROLES.reduce<Record<PortalRole, string[]>>((acc, role) => {
    const values = Array.isArray(input?.[role]) ? input[role] : [];
    acc[role] = Array.from(new Set(values.map(String).filter((value: string) => allowed.has(value))));
    return acc;
  }, { student: [], instructor: [], admin: [], "sub-admin": [] });
}

export function serializeForAudit(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}
