import { Schema, model, models, type InferSchemaType } from "mongoose";

const DuePolicySchema = new Schema(
  {
    type: { type: String, enum: ["before_next_class", "days_after_class"], default: "before_next_class" },
    minutesBefore: { type: Number, default: 1, min: 0 },
    daysAfterClass: { type: Number, default: 7, min: 1 },
    noNextClassBehavior: { type: String, enum: ["assign_without_due", "skip"], default: "assign_without_due" },
  },
  { _id: false }
);

const AssignmentTemplateSchema = new Schema(
  {
    title: { type: String, required: true, index: true },
    description: String,
    instructions: String,
    course: { type: Schema.Types.ObjectId, ref: "Course", index: true },
    courseName: { type: String, index: true },
    level: { type: String, enum: ["beginner", "intermediate", "advanced", "mixed", ""], default: "", index: true },
    levelName: { type: String, index: true },
    topicName: { type: String, required: true, index: true },
    topicKey: { type: String, required: true, index: true },
    activities: [{ type: Schema.Types.Mixed }],
    puzzles: [{ type: Schema.Types.Mixed }],
    numberOfAttempts: { type: Number, default: 1, min: 1 },
    timeLimitMinutes: { type: Number, default: 0, min: 0 },
    scoring: { type: Schema.Types.Mixed, default: {} },
    targetMode: {
      type: String,
      enum: ["classroom_batches", "all_class_students", "specific_batches", "specific_students"],
      default: "classroom_batches",
      index: true,
    },
    defaultBatches: [{ type: Schema.Types.ObjectId, ref: "Batch", index: true }],
    defaultStudents: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    duePolicy: { type: DuePolicySchema, default: () => ({}) },
    autoAssign: { type: Boolean, default: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    linkStatus: { type: String, enum: ["linked", "needs_review", "unlinked"], default: "unlinked", index: true },
    source: {
      kind: { type: String, enum: ["manual", "pgn_import", "mcq_import"], default: "manual", index: true },
      pgnIds: [{ type: Schema.Types.ObjectId, ref: "PGN" }],
      fileNames: [String],
      importBatchId: String,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
  },
  { timestamps: true }
);

AssignmentTemplateSchema.index({ topicKey: 1, course: 1, levelName: 1, isActive: 1, autoAssign: 1 });

const AssignmentAutomationLogSchema = new Schema(
  {
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", index: true },
    scheduledSessionId: { type: String, index: true },
    sourceTemplate: { type: Schema.Types.ObjectId, ref: "AssignmentTemplate", index: true },
    homework: { type: Schema.Types.ObjectId, ref: "Homework", index: true },
    topicName: { type: String, index: true },
    topicKey: { type: String, index: true },
    status: {
      type: String,
      enum: [
        "assigned",
        "assigned_without_due",
        "already_assigned",
        "missing_template",
        "ambiguous_template",
        "skipped_no_batch",
        "skipped_no_next_class",
        "error",
      ],
      required: true,
      index: true,
    },
    message: String,
    dueAt: Date,
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

AssignmentAutomationLogSchema.index({ classroom: 1, scheduledSessionId: 1, sourceTemplate: 1, status: 1 });

export type AssignmentTemplateDoc = InferSchemaType<typeof AssignmentTemplateSchema> & { _id: any };
export type AssignmentAutomationLogDoc = InferSchemaType<typeof AssignmentAutomationLogSchema> & { _id: any };
export const AssignmentTemplate = models.AssignmentTemplate || model("AssignmentTemplate", AssignmentTemplateSchema);
export const AssignmentAutomationLog = models.AssignmentAutomationLog || model("AssignmentAutomationLog", AssignmentAutomationLogSchema);
