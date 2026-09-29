import { Schema, model, models, type InferSchemaType } from "mongoose";
import { WRITE_QUERY_MIDDLEWARE, invalidateFeatureAccessCache } from "@/lib/permissionCache";

const rolePermissionSchema = new Schema(
  {
    student: { type: [String], default: [] },
    instructor: { type: [String], default: [] },
    admin: { type: [String], default: [] },
    "sub-admin": { type: [String], default: [] },
  },
  { _id: false }
);

const userOverrideSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    access: { type: String, enum: ["role_default", "allow", "deny"], default: "role_default" },
    permissions: { type: [String], default: [] },
    expiresAt: Date,
    note: String,
  },
  { _id: false }
);

const FeatureAccessSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["enabled", "disabled", "testing", "coming_soon"], default: "disabled", index: true },
    rolePermissions: { type: rolePermissionSchema, default: () => ({}) },
    pilotRoles: { type: [String], enum: ["student", "instructor", "admin", "sub-admin"], default: [] },
    pilotUsers: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    pilotBatches: [{ type: Schema.Types.ObjectId, ref: "Batch", index: true }],
    pilotCourses: [{ type: Schema.Types.ObjectId, ref: "Course", index: true }],
    userOverrides: { type: [userOverrideSchema], default: [] },
    releaseNote: String,
    /** One-off data fixes already applied to this feature's settings, so each runs exactly once. */
    appliedMigrations: { type: [String], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Feature settings are cached for 30 seconds (lib/permissionCache.ts); any write
// here clears them, so a Feature Access change applies on the next request.
FeatureAccessSchema.post([...WRITE_QUERY_MIDDLEWARE], function clearFeatureCacheAfterQuery() {
  invalidateFeatureAccessCache();
});
FeatureAccessSchema.post("save", function clearFeatureCacheAfterSave() {
  invalidateFeatureAccessCache();
});
FeatureAccessSchema.post("deleteOne", { document: true, query: false }, function clearFeatureCacheAfterDocumentDelete() {
  invalidateFeatureAccessCache();
});
FeatureAccessSchema.post("insertMany", function clearFeatureCacheAfterInsertMany() {
  invalidateFeatureAccessCache();
});

const PermissionTemplateSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    description: String,
    role: { type: String, enum: ["student", "instructor", "admin", "sub-admin"], required: true, index: true },
    permissions: {
      type: Map,
      of: [String],
      default: {},
    },
    isSystem: { type: Boolean, default: false, index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const PermissionAuditSchema = new Schema(
  {
    featureKey: { type: String, required: true, index: true },
    featureLabel: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetType: { type: String, enum: ["feature", "role", "user", "batch", "course", "template", "bulk"], default: "feature", index: true },
    targetId: String,
    targetLabel: String,
    previousValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed,
    reason: String,
  },
  { timestamps: true }
);

PermissionAuditSchema.index({ featureKey: 1, createdAt: -1 });

export type FeatureAccessDoc = InferSchemaType<typeof FeatureAccessSchema> & { _id: any };
export type PermissionTemplateDoc = InferSchemaType<typeof PermissionTemplateSchema> & { _id: any };
export type PermissionAuditDoc = InferSchemaType<typeof PermissionAuditSchema> & { _id: any };

export const FeatureAccess = models.FeatureAccess || model("FeatureAccess", FeatureAccessSchema);
export const PermissionTemplate = models.PermissionTemplate || model("PermissionTemplate", PermissionTemplateSchema);
export const PermissionAudit = models.PermissionAudit || model("PermissionAudit", PermissionAuditSchema);
