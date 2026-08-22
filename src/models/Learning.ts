import { Schema, model, models, type InferSchemaType } from "mongoose";

const learningSectionSchema = new Schema(
  {
    stableKey: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: String,
    order: { type: Number, default: 0, index: true },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
  },
  { timestamps: true }
);

const learningLessonSchema = new Schema(
  {
    sectionId: { type: Schema.Types.ObjectId, ref: "LearningSection", required: true, index: true },
    stableKey: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: String,
    introContent: String,
    order: { type: Number, default: 0, index: true },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
    icon: String,
  },
  { timestamps: true }
);

const solutionSchema = new Schema(
  {
    moves: { type: [String], default: [] },
  },
  { _id: false }
);

const scriptMoveSchema = new Schema(
  {
    actor: { type: String, enum: ["student", "opponent"], required: true },
    move: String,
    acceptedMoves: { type: [String], default: [] },
  },
  { _id: false }
);

const hintSchema = new Schema(
  {
    text: String,
    arrows: {
      type: [
        new Schema(
          {
            from: { type: String, required: true },
            to: { type: String, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    highlightSquares: { type: [String], default: [] },
    showAfterErrors: { type: Number, default: 0 },
  },
  { _id: false }
);

const learningExerciseSchema = new Schema(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: "LearningLesson", required: true, index: true },
    stableKey: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: String,
    order: { type: Number, default: 0, index: true },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
    interactionMode: {
      type: String,
      enum: ["BOARD_MOVE", "BOARD_SEQUENCE", "COLLECT_TARGETS", "MULTIPLE_CHOICE", "SELECT_SQUARE", "INFORMATION"],
      required: true,
    },
    rulesMode: {
      type: String,
      enum: ["MOVEMENT_TRAINER", "LEGAL_CHESS", "QUESTION"],
      required: true,
    },
    startingPosition: String,
    orientation: { type: String, enum: ["white", "black"], default: "white" },
    sideToMove: { type: String, enum: ["white", "black"] },
    goalType: { type: String, required: true, index: true },
    goalConfig: { type: Schema.Types.Mixed, default: {} },
    acceptedSolutions: { type: [solutionSchema], default: [] },
    opponentScript: { type: [scriptMoveSchema], default: [] },
    targets: { type: [String], default: [] },
    obstacles: { type: [String], default: [] },
    hints: { type: [hintSchema], default: [] },
    idealMoves: Number,
    maxMoves: Number,
    explanation: String,
    successMessage: String,
    failureMessage: String,
    difficulty: { type: Number, enum: [1, 2, 3], default: 1 },
    version: { type: Number, default: 1 },
    createdBy: String,
  },
  { timestamps: true }
);

learningLessonSchema.index({ sectionId: 1, order: 1 });
learningExerciseSchema.index({ lessonId: 1, order: 1 });
learningExerciseSchema.index({ lessonId: 1, status: 1, order: 1 });

const learningAttemptSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    exerciseId: { type: Schema.Types.ObjectId, ref: "LearningExercise", required: true, index: true },
    exerciseVersion: { type: Number, default: 1 },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    completed: { type: Boolean, default: false, index: true },
    stars: { type: Number, min: 0, max: 3, default: 0 },
    acceptedMoves: { type: [String], default: [] },
    eventLog: { type: [Schema.Types.Mixed], default: [] },
    incorrectMoves: { type: Number, default: 0 },
    hintsUsed: { type: Number, default: 0 },
    resetCount: { type: Number, default: 0 },
    moveCount: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
  },
  { timestamps: true }
);

learningAttemptSchema.index({ studentId: 1, exerciseId: 1, createdAt: -1 });

const learningExerciseProgressSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    exerciseId: { type: Schema.Types.ObjectId, ref: "LearningExercise", required: true, index: true },
    completed: { type: Boolean, default: false, index: true },
    bestStars: { type: Number, min: 0, max: 3, default: 0 },
    bestMoveCount: Number,
    attemptCount: { type: Number, default: 0 },
    totalIncorrectMoves: { type: Number, default: 0 },
    totalHintsUsed: { type: Number, default: 0 },
    firstCompletedAt: Date,
    lastCompletedAt: Date,
    lastAttemptedAt: Date,
  },
  { timestamps: true }
);

learningExerciseProgressSchema.index({ studentId: 1, exerciseId: 1 }, { unique: true });
learningExerciseProgressSchema.index({ studentId: 1, lastAttemptedAt: -1 });

export type LearningSectionDoc = InferSchemaType<typeof learningSectionSchema> & { _id: any };
export type LearningLessonDoc = InferSchemaType<typeof learningLessonSchema> & { _id: any };
export type LearningExerciseDoc = InferSchemaType<typeof learningExerciseSchema> & { _id: any };
export type LearningAttemptDoc = InferSchemaType<typeof learningAttemptSchema> & { _id: any };
export type LearningExerciseProgressDoc = InferSchemaType<typeof learningExerciseProgressSchema> & { _id: any };

export const LearningSection = models.LearningSection || model("LearningSection", learningSectionSchema);
export const LearningLesson = models.LearningLesson || model("LearningLesson", learningLessonSchema);
export const LearningExercise = models.LearningExercise || model("LearningExercise", learningExerciseSchema);
export const LearningAttempt = models.LearningAttempt || model("LearningAttempt", learningAttemptSchema);
export const LearningExerciseProgress =
  models.LearningExerciseProgress || model("LearningExerciseProgress", learningExerciseProgressSchema);
