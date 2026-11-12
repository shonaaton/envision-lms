import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * One class, checked by the class monitor (lib/classMonitor). Raised by the
 * sweep for every real class from the start date on, filled in once, and kept
 * for the daily and monthly reports.
 *
 * The class details (name, coach, roster, timing) are snapshots: they keep
 * following the live class while the form is unfilled, and freeze once it is
 * submitted, so a later coach change or roster move never rewrites what the
 * monitor saw.
 */
const JoinTimeSchema = new Schema(
  {
    /** What the live room recorded (first time seen), or null. */
    autoAt: { type: Date, default: null },
    /** The time that counts: the recorded one unless someone changed it. */
    at: { type: Date, default: null },
    edited: { type: Boolean, default: false },
  },
  { _id: false }
);

const StudentJoinSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: "" },
    autoAt: { type: Date, default: null },
    at: { type: Date, default: null },
    edited: { type: Boolean, default: false },
  },
  { _id: false }
);

const ClassMonitorReportSchema = new Schema(
  {
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    /** The scheduled session's `_id` (or `<classroom>-single` for a one-off class). */
    sessionId: { type: String, required: true },
    /** Academy (IST) day of the class, "YYYY-MM-DD". */
    dateKey: { type: String, required: true, index: true },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    durationMinutes: { type: Number, default: 60 },

    className: { type: String, default: "" },
    /** A free demo class (Classroom.classroomType "demo") rather than a regular one. */
    isDemo: { type: Boolean, default: false, index: true },
    courseName: { type: String, default: "" },
    lessonPlanned: { type: String, default: "" },
    sessionNumber: { type: Number, default: 0 },
    sessionStatus: { type: String, default: "scheduled" },
    coach: { type: Schema.Types.ObjectId, ref: "User", index: true },
    coachName: { type: String, default: "" },
    meetingUrl: { type: String, default: "" },
    actualStartedAt: { type: Date, default: null },
    actualEndedAt: { type: Date, default: null },

    status: { type: String, enum: ["pending", "submitted", "cancelled"], default: "pending", index: true },
    cancelReason: { type: String, default: "" },
    /** The sweep withdrew this class's task (class cancelled or moved); bring it back if the class returns. */
    taskWithdrawn: { type: Boolean, default: false },
    taskRaisedAt: { type: Date, default: null },

    classFormat: { type: String, enum: ["group", "individual", null], default: null },
    studentVideo: { type: String, enum: ["on", "off", null], default: null },
    teacherVideo: { type: String, enum: ["30_plus", "under_30", "never", null], default: null },
    correctLesson: { type: String, enum: ["yes", "no", null], default: null },
    classEnd: { type: String, enum: ["on_time", "early", "late", null], default: null },
    teacherJoin: { type: JoinTimeSchema, default: () => ({}) },
    studentJoins: { type: [StudentJoinSchema], default: [] },
    remarks: { type: String, default: "" },

    submittedAt: { type: Date, default: null },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    submittedByName: { type: String, default: "" },
    lastEditedAt: { type: Date, default: null },
    lastEditedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lastEditedByName: { type: String, default: "" },
    editCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ClassMonitorReportSchema.index({ classroom: 1, sessionId: 1 }, { unique: true });
ClassMonitorReportSchema.index({ dateKey: 1, startAt: 1 });
ClassMonitorReportSchema.index({ status: 1, startAt: 1 });

/** Claims the once-a-day summary email, so a restart or a second app instance cannot send it twice. */
const ClassMonitorDigestSchema = new Schema(
  {
    dateKey: { type: String, required: true, unique: true },
    sentAt: { type: Date, default: Date.now },
    recipients: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type ClassMonitorReportDoc = InferSchemaType<typeof ClassMonitorReportSchema> & { _id: any };
export const ClassMonitorReport = models.ClassMonitorReport || model("ClassMonitorReport", ClassMonitorReportSchema);
export const ClassMonitorDigest = models.ClassMonitorDigest || model("ClassMonitorDigest", ClassMonitorDigestSchema);
