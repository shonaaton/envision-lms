import { Schema, model, models } from "mongoose";
import { WRITE_QUERY_MIDDLEWARE, invalidateAccessRoleCache } from "@/lib/permissionCache";

// Named roles own their grants. User.role remains the legacy portal/workflow
// classification; it must never supply grants to an account with accessRole.
const schema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  nameKey: { type: String, required: true, unique: true },
  description: { type: String, default: "", maxlength: 500 },
  permissions: { type: Map, of: [String], default: {} },
  isActive: { type: Boolean, default: true },
  archivedAt: { type: Date, default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

// Resolved roles are cached for 30 seconds (lib/permissionCache.ts); any write
// here clears them, so a grant or revocation applies on the next request.
schema.post([...WRITE_QUERY_MIDDLEWARE], function clearRoleCacheAfterQuery() {
  invalidateAccessRoleCache();
});
schema.post("save", function clearRoleCacheAfterSave() {
  invalidateAccessRoleCache();
});
schema.post("deleteOne", { document: true, query: false }, function clearRoleCacheAfterDocumentDelete() {
  invalidateAccessRoleCache();
});
schema.post("insertMany", function clearRoleCacheAfterInsertMany() {
  invalidateAccessRoleCache();
});

export const AccessRole = models.AccessRole || model("AccessRole", schema);
