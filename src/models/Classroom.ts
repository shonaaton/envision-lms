import { Schema, model, models, type InferSchemaType } from "mongoose";

const SlotSchema = new Schema(
  {
    startTime: { type: String, required: true }, // "17:00"
    durationMinutes: { type: Number, default: 60 },
  },
  { _id: false }
);

const DayScheduleSchema = new Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true }, // 0=Sun
    slots: [SlotSchema],
  },
  { _id: false }
);

const SessionPlanSchema = new Schema(
  {
    sessionNumber: { type: Number, required: true },
    topicName: { type: String, required: true },
    topicOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const ScheduledSessionSchema = new Schema(
  {
    sessionNumber: { type: Number, required: true },
    topicName: { type: String, required: true },
    topicOrder: { type: Number, default: 0 },
    topicLocked: { type: Boolean, default: false },
    topicOverrideReason: String,
    scheduledFor: { type: Date, required: true },
    startTime: { type: String, required: true },
    durationMinutes: { type: Number, default: 60 },
    status: {
      type: String,
      enum: ["scheduled", "ongoing", "in_progress", "completed", "cancelled", "rescheduled", "missed", "abandoned", "absent", "coach_no_show", "student_no_show", "technical_issue"],
      default: "scheduled",
      index: true,
    },
    isExtra: { type: Boolean, default: false },
    notes: String,
    originalDate: Date,
    substituteCoach: { type: Schema.Types.ObjectId, ref: "User" },
    actualStartedAt: Date,
    actualEndedAt: Date,
    conductedBy: { type: Schema.Types.ObjectId, ref: "User" },
    coachAttendanceStatus: {
      type: String,
      enum: ["pending", "present", "absent", "late", "rescheduled", "cancelled", "coach_no_show", "student_no_show", "technical_issue"],
      default: "pending",
    },
    teachingMinutes: { type: Number, default: 0 },
    actualTeachingMinutes: { type: Number, default: 0 },
    punctualityScore: { type: Number, default: 0 },
    attendanceMarkedAt: Date,
    summary: { type: Schema.Types.Mixed, default: {} },
    students: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    // Which lifecycle notifications have already gone out for this class, e.g.
    // "starting_t30" or "coach_missing". The reminder sweep claims a kind here
    // before it sends, so two app instances running the sweep at the same
    // minute cannot both message the family.
    notifiedKinds: [{ type: String }],
  },
  { _id: true }
);

const ClassroomSchema = new Schema(
  {
    title: { type: String, required: true, index: true },
    description: { type: String },
    classroomType: { type: String, enum: ["single", "series", "demo"], default: "single", index: true },
    demoBooking: { type: Schema.Types.ObjectId, ref: "Booking", index: true },
    status: {
      type: String,
      enum: ["scheduled", "ongoing", "completed", "cancelled"],
      default: "scheduled",
      index: true,
    },
    level: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
    levelName: { type: String, index: true },
    topicName: { type: String, index: true },
    topicOrder: { type: Number, default: 0 },
    course: { type: Schema.Types.ObjectId, ref: "Course", index: true },
    courseName: { type: String, index: true },
    useCustomTopic: { type: Boolean, default: false },
    meetingProvider: {
      type: String,
      enum: ["meet"],
      default: "meet",
    },
    meetingUrl: { type: String },

    // Assignment
    coach: { type: Schema.Types.ObjectId, ref: "User", index: true },
    instructor: { type: Schema.Types.ObjectId, ref: "User", index: true }, // legacy alias
    students: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    batches: [{ type: Schema.Types.ObjectId, ref: "Batch", index: true }],

    // Single class
    classDate: Date,
    startTime: String,
    durationMinutes: { type: Number, default: 60 },

    // Series schedule
    startDate: Date,
    endDate: Date,
    seriesTopicMode: { type: String, enum: ["all", "selected", "none"], default: "all" },
    frequency: { type: String, enum: ["weekly", "custom"], default: "weekly" },
    sessionsPerWeek: { type: Number, default: 1 },
    repeatEvery: { type: Number, default: 1 },
    daysOfWeek: [DayScheduleSchema],
    endCondition: { type: String, enum: ["on_date", "after_n_sessions", "course_complete", "never"], default: "on_date" },
    endAfterSessions: { type: Number },
    sessionPlan: [SessionPlanSchema],
    generatedSessions: [ScheduledSessionSchema],

    feePerMonth: { type: Number, default: 0 }, // paise
    isActive: { type: Boolean, default: true, index: true },
    isSessionInstance: { type: Boolean, default: false, index: true },
    parentClassroom: { type: Schema.Types.ObjectId, ref: "Classroom", index: true },
    sourceSessionId: { type: String, index: true },
    sessionDate: { type: Date, index: true },
    isTestClassroom: { type: Boolean, default: false, index: true },
    testOwner: { type: Schema.Types.ObjectId, ref: "User", index: true },

    // Closure trail. A classroom is switched off when the last active student
    // leaves it - today that only happens through account deactivation - and
    // these fields say when, why, and for whom, so the close can be reversed
    // and so coaches can be shown what was closed on them.
    closedAt: { type: Date, index: true },
    closedReason: { type: String, index: true },
    closedBy: { type: Schema.Types.ObjectId, ref: "User" },
    closedForStudents: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    previousStatus: { type: String },
    // Classes removed when the classroom was closed - they were never taught, so
    // they are taken off the calendar rather than left showing as missed. Kept
    // here so reactivating the student can put them back.
    removedSessions: [{ type: Schema.Types.Mixed }],

    // Pause trail. Unlike a closure this is temporary: the classroom comes back
    // when the student does, and its remaining classes are re-dated from the
    // restart day rather than being cancelled.
    isPaused: { type: Boolean, default: false, index: true },
    pausedAt: { type: Date, index: true },
    pausedFrom: { type: Date },
    pausedUntil: { type: Date },
    pausedForStudents: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
  },
  { timestamps: true }
);

export type ClassroomDoc = InferSchemaType<typeof ClassroomSchema> & { _id: any };
export const Classroom = models.Classroom || model("Classroom", ClassroomSchema);
