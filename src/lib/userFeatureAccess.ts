import "server-only";

import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { FEATURE_DEFINITIONS } from "@/lib/featureRegistry";
import { FeatureAccess } from "@/models/FeatureAccess";

/**
 * Per-person access, on top of the per-role matrix.
 *
 * The permission grid is keyed by role, so anything granted to "Sub admins" goes
 * to every sub admin. That breaks down the moment two people share a role but not
 * a job - an operations sub admin who needs everything, and a salesperson who
 * should see only their own workspace.
 *
 * `FeatureAccess.userOverrides` already solves this at the data layer, and
 * `evaluateFeatureState` already reads it ahead of the role defaults. What was
 * missing is a way to write one across every feature at once, instead of opening
 * forty Configure panels by hand. That is all this module does.
 *
 * Precedence, from `evaluateFeatureState`: super admin, then a per-user deny,
 * then a per-user allow, then feature status, then role permissions. So a deny
 * here beats any role grant, and an allow here works even while the role has
 * nothing.
 */

export type UserAccessMode = "restrict" | "add" | "clear";

/**
 * Never denied by "restrict".
 *
 * Taking these away leaves somebody signed in with no home screen and no way to
 * change their own password, which is never what "limit this person to sales"
 * is meant to mean.
 */
export const ALWAYS_ALLOWED_FEATURES = ["dashboard", "accountSettings", "notifications"];

export type UserAccessGrants = Record<string, string[]>;

export type UserAccessResult = {
  allowed: string[];
  denied: string[];
  cleared: string[];
};

function sameOverride(a: any, b: { access: string; permissions: string[]; note: string }) {
  const existingPermissions = [...(a?.permissions || [])].map(String).sort();
  return (
    String(a?.access || "") === b.access &&
    JSON.stringify(existingPermissions) === JSON.stringify([...b.permissions].sort()) &&
    String(a?.note || "") === b.note
  );
}

/**
 * Apply one person's access across every feature in a single pass.
 *
 * - `restrict`: allow the granted features, deny everything else. This is the
 *   least-privilege option and the one a sales account wants.
 * - `add`: allow the granted features and drop any other override for this
 *   person, so the rest of their access falls back to their role.
 * - `clear`: remove every override, returning them to plain role defaults.
 *
 * Returns which features ended up allowed, denied, or reset, so the caller can
 * write one audit entry describing the whole change rather than forty.
 */
export async function applyUserFeatureAccess(input: {
  userId: string;
  mode: UserAccessMode;
  grants?: UserAccessGrants;
  note?: string;
  expiresAt?: Date | null;
}): Promise<UserAccessResult> {
  if (!Types.ObjectId.isValid(input.userId)) throw new Error("A valid user is required.");
  await dbConnect();

  const userId = new Types.ObjectId(input.userId);
  const grants = input.grants || {};
  const note = String(input.note || "").trim();
  const result: UserAccessResult = { allowed: [], denied: [], cleared: [] };

  const documents = await FeatureAccess.find({ key: { $in: FEATURE_DEFINITIONS.map((feature) => feature.key) } });
  const byKey = new Map(documents.map((doc: any) => [String(doc.key), doc]));

  for (const feature of FEATURE_DEFINITIONS) {
    // A feature with no document yet is still governed by role defaults, so an
    // override has to be written against a real row - create it on demand.
    let document: any = byKey.get(feature.key);
    if (!document) {
      document = await FeatureAccess.findOneAndUpdate(
        { key: feature.key },
        { $setOnInsert: { key: feature.key, status: feature.defaultStatus || "disabled" } },
        { upsert: true, new: true },
      );
    }

    const others = (document.userOverrides || []).filter((override: any) => String(override.user) !== String(userId));
    const existing = (document.userOverrides || []).find((override: any) => String(override.user) === String(userId));

    let next: { access: "allow" | "deny"; permissions: string[]; note: string } | null = null;

    if (input.mode === "clear") {
      next = null;
    } else if (grants[feature.key]) {
      // Only permissions the feature actually defines; a template written before a
      // permission was renamed must not smuggle in an unknown id.
      const valid = new Set(feature.permissions.map((permission) => permission.id));
      const permissions = Array.from(new Set(grants[feature.key].map(String).filter((value) => valid.has(value))));
      next = { access: "allow", permissions: permissions.length ? permissions : ["view"], note };
    } else if (input.mode === "restrict" && !ALWAYS_ALLOWED_FEATURES.includes(feature.key)) {
      next = { access: "deny", permissions: [], note };
    }

    if (!next) {
      if (existing) result.cleared.push(feature.key);
      // `add` and `clear` both drop a stale override rather than leaving a deny
      // behind that would silently outlive the decision that created it.
      if (!existing) continue;
      document.userOverrides = others;
      await document.save();
      continue;
    }

    if (next.access === "allow") result.allowed.push(feature.key);
    else result.denied.push(feature.key);

    if (existing && sameOverride(existing, next) && !input.expiresAt) continue;

    document.userOverrides = [
      ...others,
      {
        user: userId,
        access: next.access,
        permissions: next.permissions,
        note: next.note,
        expiresAt: input.expiresAt || undefined,
      },
    ];
    await document.save();
  }

  return result;
}

/** What a person currently has overridden, for showing before a change is made. */
export async function getUserFeatureAccess(userId: string) {
  if (!Types.ObjectId.isValid(userId)) return { allowed: [], denied: [] };
  await dbConnect();
  const documents = await FeatureAccess.find({ "userOverrides.user": new Types.ObjectId(userId) })
    .select("key userOverrides")
    .lean();

  const allowed: string[] = [];
  const denied: string[] = [];
  const now = Date.now();
  for (const document of documents as any[]) {
    const override = (document.userOverrides || []).find((entry: any) => String(entry.user) === String(userId));
    if (!override) continue;
    if (override.expiresAt && new Date(override.expiresAt).getTime() <= now) continue;
    if (override.access === "allow") allowed.push(String(document.key));
    else if (override.access === "deny") denied.push(String(document.key));
  }
  return { allowed, denied };
}
