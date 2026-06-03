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
    title: { type: String, required: true },
    description: String,
    puzzles: [PuzzleSchema],
    dueAt: Date,
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
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
SubmissionSchema.index({ homework: 1, student: 1 }, { unique: true });

export type HomeworkDoc = InferSchemaType<typeof HomeworkSchema> & { _id: any };
export type SubmissionDoc = InferSchemaType<typeof SubmissionSchema> & { _id: any };
export const Homework = models.Homework || model("Homework", HomeworkSchema);
export const Submission = models.Submission || model("Submission", SubmissionSchema);
