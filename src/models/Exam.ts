import { Schema, model, models } from "mongoose";

/**
 * Exam Center. One paper per level (Beginner L1 – Intermediate L3), drawn from
 * that level's homework and reviewed by an admin. Each student's sitting is an
 * ExamAssignment holding its own copy of the paper, so editing a paper never
 * changes an exam that was already handed out.
 *
 * Answers (`options.correct`, `solution`, `pgn`) live only here and in the
 * staff views. `serializeForStudent` in examService.ts is the only way an
 * assignment leaves the server for a student.
 */

const SourceSchema = new Schema(
  {
    template: { type: Schema.Types.ObjectId, ref: "AssignmentTemplate" },
    templateTitle: String,
    activityId: String,
    itemId: String,
  },
  { _id: false }
);

export const ExamMcqSchema = new Schema(
  {
    id: { type: String, required: true },
    /** Identifies the bank question, so a paper never holds it twice. */
    bankKey: { type: String, required: true },
    question: { type: String, required: true },
    positionFen: String,
    options: [new Schema({ id: String, text: String, correct: Boolean }, { _id: false })],
    explanation: String,
    topicName: String,
    source: SourceSchema,
    /** A "what is the best move?" question made from one of the level's positions. */
    generated: Boolean,
  },
  { _id: false }
);

export const ExamPositionSchema = new Schema(
  {
    id: { type: String, required: true },
    bankKey: { type: String, required: true },
    topicName: String,
    title: String,
    /** Shown to the student above the board. Admins can rewrite it on the paper. */
    question: String,
    pgn: { type: String, required: true },
    startFen: { type: String, required: true },
    solution: [String],
    studentColor: { type: String, enum: ["white", "black"], default: "white" },
    source: SourceSchema,
  },
  { _id: false }
);

const ExamPaperSchema = new Schema(
  {
    tier: { type: String, required: true },
    levelNumber: { type: Number, required: true },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    /** Raised by every change after the paper was first published. */
    version: { type: Number, default: 1 },
    mcqs: [ExamMcqSchema],
    positions: [ExamPositionSchema],
    generatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    publishedAt: Date,
    publishedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ExamPaperSchema.index({ tier: 1, levelNumber: 1 }, { unique: true });

export const EXAM_ASSIGNMENT_STATUSES = ["assigned", "in_progress", "submitted", "expired", "cancelled"] as const;

const ExamAssignmentSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tier: { type: String, required: true },
    levelNumber: { type: Number, required: true },
    paper: { type: Schema.Types.ObjectId, ref: "ExamPaper", required: true },
    paperVersion: { type: Number, default: 1 },
    mcqs: [ExamMcqSchema],
    positions: [ExamPositionSchema],

    source: { type: String, enum: ["auto_completion", "manual"], required: true },
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom" },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User" },
    assignedAt: { type: Date, required: true },
    availableUntil: { type: Date, required: true, index: true },

    status: { type: String, enum: EXAM_ASSIGNMENT_STATUSES, default: "assigned", index: true },
    /**
     * `${student}:${tier}:${level}` while the exam is assigned or in progress,
     * removed when it closes. The unique sparse index stops a student holding
     * two open copies of one level without a partial index.
     */
    openKey: { type: String },
    /** `${classroom}:${student}` for automatic assignments: a classroom can assign its exam once. */
    autoKey: { type: String },

    startedAt: Date,
    endsAt: { type: Date, index: true },
    lastHeartbeatAt: Date,
    violations: [new Schema({ type: { type: String, required: true }, at: { type: Date, required: true } }, { _id: false })],
    submittedAt: Date,
    submitReason: { type: String, enum: ["completed", "time_up", "tab_switch", "app_closed", "disconnected"] },
    cancelledAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },

    mcqAnswers: [
      new Schema(
        { questionId: String, selected: String, correct: Boolean, marks: Number, at: Date },
        { _id: false }
      ),
    ],
    positionProgress: [
      new Schema(
        {
          questionId: String,
          ply: { type: Number, default: 0 },
          wrongMoves: { type: Number, default: 0 },
          hintsUsed: { type: Number, default: 0 },
          /** The ply the last hint was bought for: asking again on the same move is free. */
          hintPly: { type: Number, default: -1 },
          solved: { type: Boolean, default: false },
          marks: { type: Number, default: 0 },
        },
        { _id: false }
      ),
    ],

    score: {
      mcq: Number,
      positions: Number,
      total: Number,
      max: Number,
      percent: Number,
    },

    reminders: {
      threeDayAt: Date,
      lastDayAt: Date,
      threeDaySentAt: Date,
      lastDaySentAt: Date,
    },

    certificateNumber: String,
    certificate: {
      status: { type: String, enum: ["none", "pending", "sent", "failed", "issued"], default: "none" },
      attempts: { type: Number, default: 0 },
      nextAttemptAt: Date,
      lastError: String,
      sentAt: Date,
      url: String,
      issuedAt: Date,
    },
  },
  { timestamps: true, optimisticConcurrency: true }
);

ExamAssignmentSchema.index({ openKey: 1 }, { unique: true, sparse: true });
ExamAssignmentSchema.index({ autoKey: 1 }, { unique: true, sparse: true });
ExamAssignmentSchema.index({ status: 1, availableUntil: 1 });
ExamAssignmentSchema.index({ status: 1, lastHeartbeatAt: 1 });
ExamAssignmentSchema.index({ "certificate.status": 1, "certificate.nextAttemptAt": 1 });
ExamAssignmentSchema.index({ tier: 1, levelNumber: 1, createdAt: -1 });

/**
 * Classrooms the auto-assign sweep has dealt with. A classroom that is
 * reopened and completed again is not assigned a second time.
 */
const ExamClassroomRunSchema = new Schema(
  {
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, unique: true },
    tier: String,
    levelNumber: Number,
    result: { type: String, enum: ["assigned", "not_an_exam_level"], required: true },
    assignedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const ExamPaper = models.ExamPaper || model("ExamPaper", ExamPaperSchema);
export const ExamAssignment = models.ExamAssignment || model("ExamAssignment", ExamAssignmentSchema);
export const ExamClassroomRun = models.ExamClassroomRun || model("ExamClassroomRun", ExamClassroomRunSchema);
