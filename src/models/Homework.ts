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

const ActivitySchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "solve_position",
        "quiz",
        "play_computer",
        "find_best_move",
        "find_combination",
        "study_pgn",
        "analyze_position",
        "endgame_practice",
        "opening_practice",
      ],
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    instructions: String,
    difficulty: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
    points: { type: Number, default: 1 },
    timeLimitMinutes: { type: Number, default: 0 },
    topic: String,
    opening: String,
    endgame: String,
    tacticalTheme: String,
    tags: [String],
    fen: String,
    solution: [String],
    pgn: String,
    pgnTitle: String,
    pgnSourceId: String,
    source: {
      kind: String,
      pgnId: { type: Schema.Types.ObjectId, ref: "PGN" },
      folder: String,
      moveNumber: Number,
      chapter: String,
      variation: String,
      san: String,
    },
    items: [
      {
        id: String,
        title: String,
        question: String,
        positionFen: String,
        options: [
          {
            id: String,
            text: String,
            correct: { type: Boolean, default: false },
          },
        ],
        multipleCorrect: { type: Boolean, default: false },
        explanation: String,
        fen: String,
        solution: [String],
        pgn: String,
        pgnTitle: String,
        pgnSourceId: String,
        source: Schema.Types.Mixed,
        correctAnswers: [Number],
        points: { type: Number, default: 1 },
      },
    ],
    quiz: {
      question: String,
      options: [
        {
          id: String,
          text: String,
          correct: { type: Boolean, default: false },
        },
      ],
      correctAnswers: [Number],
      explanation: String,
      multipleCorrect: { type: Boolean, default: false },
      positionFen: String,
    },
    computer: {
      strength: { type: String, default: "beginner" },
      rating: Number,
      side: { type: String, enum: ["white", "black", "random"], default: "white" },
      objective: String,
      timeControl: {
        type: { type: String, default: "untimed" },
        minutes: { type: Number, default: 0 },
        increment: { type: Number, default: 0 },
      },
      completion: String,
      requiredMoves: Number,
    },
  },
  { _id: true, strict: false }
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
    activities: [ActivitySchema],
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
    sourceTemplate: { type: Schema.Types.ObjectId, ref: "AssignmentTemplate", index: true },
    sourceSessionId: { type: String, index: true },
    autoAssigned: { type: Boolean, default: false, index: true },
    automationStatus: { type: String, index: true },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

HomeworkSchema.index(
  { classroom: 1, sourceSessionId: 1, sourceTemplate: 1 },
  { unique: true, partialFilterExpression: { autoAssigned: true, sourceSessionId: { $exists: true }, sourceTemplate: { $exists: true } } }
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
    activityResults: Schema.Types.Mixed,
    quizAnswers: Schema.Types.Mixed,
    metrics: {
      mistakes: { type: Number, default: 0 },
      hintsUsed: { type: Number, default: 0 },
      solvedBoards: { type: Number, default: 0 },
      totalBoards: { type: Number, default: 0 },
      correctMcq: { type: Number, default: 0 },
      totalMcq: { type: Number, default: 0 },
    },
    attemptsUsed: { type: Number, default: 1 },
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
