import { Schema, model, models, type InferSchemaType } from "mongoose";

const PgnFolderSchema = new Schema(
  {
    name: { type: String, required: true },
    path: { type: String, required: true, index: true },
    parentPath: { type: String, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    visibility: { type: String, enum: ["private", "shared"], default: "private", index: true },
  },
  { timestamps: true }
);

PgnFolderSchema.index({ path: 1, uploadedBy: 1, visibility: 1 }, { unique: true });

export type PgnFolderDoc = InferSchemaType<typeof PgnFolderSchema> & { _id: any };

export const PgnFolder = models.PgnFolder || model("PgnFolder", PgnFolderSchema);
