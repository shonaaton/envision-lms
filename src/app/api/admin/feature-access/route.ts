import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import {
  getFeatureAccessSnapshot,
  getPermissionAudit,
  getPermissionTemplates,
  isSuperAdminSession,
  sanitizeRolePermissions,
  seedPermissionTemplates,
  serializeForAudit,
} from "@/lib/featureAccess";
import { FEATURE_DEFINITIONS, PORTAL_ROLES, type FeatureStatus } from "@/lib/featureRegistry";
import { FeatureAccess, PermissionAudit } from "@/models/FeatureAccess";
import { PermissionTemplate } from "@/models/FeatureAccess";
import { User } from "@/models/User";
import { Batch } from "@/models/Batch";
import { Course } from "@/models/Course";

export const dynamic = "force-dynamic";

const STATUSES: FeatureStatus[] = ["enabled", "disabled", "testing", "coming_soon"];

function objectIds(values: unknown) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(String).filter((value) => Types.ObjectId.isValid(value)))).map((value) => new Types.ObjectId(value));
}

function cleanUserOverrides(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values
    .map((override: any) => ({
      user: String(override?.user || ""),
      access: ["role_default", "allow", "deny"].includes(override?.access) ? override.access : "role_default",
      permissions: Array.isArray(override?.permissions) ? Array.from(new Set(override.permissions.map(String))) : [],
      expiresAt: override?.expiresAt ? new Date(override.expiresAt) : undefined,
      note: String(override?.note || "").trim(),
    }))
    .filter((override) => Types.ObjectId.isValid(override.user))
    .map((override) => ({ ...override, user: new Types.ObjectId(override.user) }));
}

async function requireSuper() {
  const session = await auth();
  if (!(await isSuperAdminSession(session?.user as any))) return null;
  return session;
}

export async function GET() {
  const session = await requireSuper();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  await seedPermissionTemplates((session.user as any).id);
  const [features, audit, templates, users, batches, courses] = await Promise.all([
    getFeatureAccessSnapshot(),
    getPermissionAudit(50),
    getPermissionTemplates(),
    User.find({ isActive: { $ne: false } }, { name: 1, email: 1, username: 1, role: 1, accountStatus: 1 }).sort({ name: 1 }).limit(500).lean(),
    Batch.find({ isActive: { $ne: false } }, { name: 1, level: 1 }).sort({ name: 1 }).limit(200).lean(),
    Course.find({ isActive: { $ne: false } }, { name: 1, level: 1, category: 1 }).sort({ name: 1 }).limit(200).lean(),
  ]);
  return NextResponse.json(
    {
      roles: PORTAL_ROLES,
      features,
      audit,
      templates,
      users,
      batches,
      courses,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function PATCH(req: Request) {
  const session = await requireSuper();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session.user as any).id;
  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || "").trim();
  const updates = Array.isArray(body.features) ? body.features : [];
  await dbConnect();

  const definitions = new Map(FEATURE_DEFINITIONS.map((feature) => [feature.key, feature]));
  const existingSnapshot = new Map((await getFeatureAccessSnapshot()).map((feature) => [feature.key, feature]));
  const changedKeys: string[] = [];

  for (const input of updates) {
    const key = String(input?.key || "");
    const definition = definitions.get(key);
    if (!definition) continue;
    const status = STATUSES.includes(input.status) ? input.status : "disabled";
    if (status === "disabled" && !reason) {
      return NextResponse.json({ error: "A reason is required when disabling a feature globally." }, { status: 400 });
    }
    const rolePermissions = sanitizeRolePermissions(input.rolePermissions, definition);
    const pilotRoles = Array.isArray(input.pilotRoles) ? input.pilotRoles.filter((role: string) => PORTAL_ROLES.includes(role as any)) : [];
    const update = {
      status,
      rolePermissions,
      pilotRoles,
      pilotUsers: objectIds(input.pilotUsers),
      pilotBatches: objectIds(input.pilotBatches),
      pilotCourses: objectIds(input.pilotCourses),
      userOverrides: cleanUserOverrides(input.userOverrides),
      releaseNote: String(input.releaseNote || "").trim(),
      updatedBy: new Types.ObjectId(actorId),
    };
    const previous = existingSnapshot.get(key);
    const nextForAudit = serializeForAudit({ key, ...update });
    if (JSON.stringify(serializeForAudit(previous)) === JSON.stringify(nextForAudit)) continue;
    await FeatureAccess.findOneAndUpdate({ key }, update, { upsert: true, new: true });
    await PermissionAudit.create({
      featureKey: key,
      featureLabel: definition.label,
      actor: actorId,
      targetType: "feature",
      previousValue: serializeForAudit(previous),
      newValue: nextForAudit,
      reason,
    });
    changedKeys.push(key);
  }

  ["/dashboard", "/admin/feature-access", ...FEATURE_DEFINITIONS.flatMap((feature) => feature.routes)].forEach((path) => revalidatePath(path));
  return NextResponse.json({ ok: true, changedKeys, features: await getFeatureAccessSnapshot(), audit: await getPermissionAudit(50) });
}

export async function POST(req: Request) {
  const session = await requireSuper();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session.user as any).id;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const role = String(body.role || "") as (typeof PORTAL_ROLES)[number];
  const featureKeys = Array.isArray(body.featureKeys) ? Array.from(new Set(body.featureKeys.map(String))) : [];
  const inputFeatures = Array.isArray(body.features) ? body.features : [];

  if (!name) return NextResponse.json({ error: "Template name is required." }, { status: 400 });
  if (!PORTAL_ROLES.includes(role)) return NextResponse.json({ error: "Choose a role for this template." }, { status: 400 });
  if (!featureKeys.length) return NextResponse.json({ error: "Select at least one feature to save in the template." }, { status: 400 });

  await dbConnect();
  const definitions = new Map(FEATURE_DEFINITIONS.map((feature) => [feature.key, feature]));
  const permissions: Record<string, string[]> = {};
  for (const input of inputFeatures) {
    const key = String(input?.key || "");
    const definition = definitions.get(key);
    if (!definition || !featureKeys.includes(key)) continue;
    permissions[key] = sanitizeRolePermissions(input.rolePermissions, definition)[role] || [];
  }

  if (!Object.keys(permissions).length) return NextResponse.json({ error: "No matching feature permissions were found for this template." }, { status: 400 });

  const template = await PermissionTemplate.findOneAndUpdate(
    { name },
    {
      name,
      description,
      role,
      permissions,
      isSystem: false,
      updatedBy: new Types.ObjectId(actorId),
    },
    { upsert: true, new: true }
  ).lean();

  await PermissionAudit.create({
    featureKey: "featureAccess",
    featureLabel: "Feature Access & Permissions",
    actor: actorId,
    targetType: "template",
    targetLabel: name,
    newValue: { name, description, role, featureKeys: Object.keys(permissions) },
    reason: "Saved permission template",
  });

  return NextResponse.json({ ok: true, template, templates: await getPermissionTemplates(), audit: await getPermissionAudit(50) });
}
