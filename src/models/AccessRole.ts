import { Schema, model, models } from "mongoose";

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

export const AccessRole = models.AccessRole || model("AccessRole", schema);
