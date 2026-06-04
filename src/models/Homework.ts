import { Schema, model, models, type InferSchemaType } from "mongoose";

const PuzzleSchema = new Schema(
  {
    fen: { type: String, required: true }, // starting position
    solution: [String],                    // moves in SAN
    prompt: String,
    points: { type: Number, default: 1 },
  },
  { _id: true }
);

const HomeworkSchema = new Schema(
  {
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    instructor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["quiz", "pgn_study", "puzzle_set", "position_study"], default: "puzzle_set", index: true },
    title: { type: String, required: true },
    description: String,
    instructions: String,
    assignedStudents: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    assignedBatches: [{ type: Schema.Types.ObjectId, ref: "Batch", index: true }],
    assignAllStudents: { type: Boolean, default: false },
    puzzles: [PuzzleSchema],
    dueAt: Date,
    numberOfAttempts: { type: Number, default: 1 },
    timeLimitMinutes: { type: Number, default: 0 },
    scoring: {
      correct: { type: Number, default: 5 },
      wrongPenalty: { type: Number, default: 0 },
      hintPenalty: { type: Number, default: 0 },
      attemptPenalty: { type: Number, default: 0 },
      latePenalty: { type: Number, default: 0 },
    },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const SubmissionSchema = new Schema(
  {
    homework: { type: Schema.Types.ObjectId, ref: "Homework", required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    answers: [
      {
        puzzleId: Schema.Types.ObjectId,
        moves: [String],
        correct: Boolean,
        pointsAwarded: Number,
      },
    ],
    totalScore: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    timeTakenSeconds: { type: Number, default: 0 },
    status: { type: String, enum: ["in_progress", "submitted", "late", "completed"], default: "submitted", index: true },
    feedback: String,
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
SubmissionSchema.index({ homework: 1, student: 1 }, { unique: true });

export type HomeworkDoc = InferSchemaType<typeof HomeworkSchema> & { _id: any };
export type SubmissionDoc = InferSchemaType<typeof SubmissionSchema> & { _id: any };
export const Homework = models.Homework || model("Homework", HomeworkSchema);
export const Submission = models.Submission || model("Submission", SubmissionSchema);
