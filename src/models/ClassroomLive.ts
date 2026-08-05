import { Schema, model, models, type InferSchemaType } from "mongoose";

const ClassroomSessionSchema = new Schema(
  {
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    scheduledSessionId: { type: String, required: true, index: true },
    sessionKey: { type: String, required: true, unique: true, index: true },
    coach: { type: Schema.Types.ObjectId, ref: "User", index: true },
    topic: { type: String, default: "" },
    mode: {
      type: String,
      enum: ["teaching", "student_move", "one_move_challenge", "puzzle"],
      default: "teaching",
      index: true,
    },
    fen: { type: String, default: "start" },
    pgn: { type: String, default: "" },
    pgnTitle: { type: String, default: "" },
    pgnMoves: [{ type: String }],
    pgnMoveIndex: { type: Number, default: 0 },
    moveHistory: [{ type: String }],
    orientation: { type: String, enum: ["white", "black"], default: "white" },
    showCoordinates: { type: Boolean, default: true },
    studentMovesEnabled: { type: Boolean, default: false },
    illegalMovesEnabled: { type: Boolean, default: false },
    arrowsEnabled: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    setupMode: { type: Boolean, default: false },
    engineEnabled: { type: Boolean, default: true },
    selectedStudents: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    boardControlStudents: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    challenge: {
      student: { type: Schema.Types.ObjectId, ref: "User" },
      side: { type: String, enum: ["white", "black"] },
      active: { type: Boolean, default: false },
      currentIndex: { type: Number, default: 0 },
      pgnCollection: [
        {
          id: String,
          title: String,
          pgn: String,
          fen: String,
          sideToMove: String,
        },
      ],
    },
    drawings: [
      {
        type: { type: String, enum: ["arrow", "highlight"], default: "highlight" },
        from: String,
        to: String,
        color: { type: String, default: "#7c1fa2" },
      },
    ],
    gamifiedObjects: { type: Schema.Types.Mixed, default: {} },
    usedResources: { type: Schema.Types.Mixed, default: [] },
    locked: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    status: { type: String, enum: ["live", "ended"], default: "live", index: true },
    participants: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        role: { type: String, enum: ["student", "instructor", "admin"], default: "student" },
        firstSeenAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
      },
    ],
    activeQuestion: { type: Schema.Types.ObjectId, ref: "LiveQuestion" },
  },
  { timestamps: true }
);

const ClassroomChatMessageSchema = new Schema(
  {
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    scheduledSessionId: { type: String, required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipient: { type: Schema.Types.ObjectId, ref: "User", index: true },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

const LiveQuestionSchema = new Schema(
  {
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    scheduledSessionId: { type: String, required: true, index: true },
    session: { type: Schema.Types.ObjectId, ref: "ClassroomSession", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["ask_everyone", "best_move", "move_sequence", "mate_in_x", "multiple_choice", "tactical_theme"],
      default: "ask_everyone",
      index: true,
    },
    title: { type: String, required: true },
    topic: String,
    difficulty: String,
    instructions: String,
    fen: { type: String, required: true },
    pgn: String,
    moveHistory: [String],
    sideToMove: String,
    solution: [String],
    options: [String],
    items: [
      {
        id: String,
        title: String,
        pgn: String,
        pgnTitle: String,
        fen: String,
        solution: [String],
        points: { type: Number, default: 5 },
        timerSeconds: Number,
      },
    ],
    progressionMode: { type: String, enum: ["auto", "manual"], default: "auto" },
    currentItemIndex: { type: Number, default: 0 },
    timer: {
      overallSeconds: Number,
      perQuestionSeconds: Number,
    },
    scoring: {
      correct: { type: Number, default: 5 },
      wrongPenalty: { type: Number, default: 0 },
      hintPenalty: { type: Number, default: 0 },
      speedBonus: { type: Number, default: 0 },
      attemptPenalty: { type: Number, default: 0 },
    },
    attempts: { type: String, enum: ["single", "multiple", "unlimited"], default: "single" },
    hintsEnabled: { type: Boolean, default: false },
    status: { type: String, enum: ["draft", "live", "closed"], default: "live", index: true },
    launchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const LiveQuestionResponseSchema = new Schema(
  {
    question: { type: Schema.Types.ObjectId, ref: "LiveQuestion", required: true, index: true },
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    scheduledSessionId: { type: String, required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    submittedMove: String,
    submittedSequence: [String],
    itemResults: { type: Schema.Types.Mixed, default: {} },
    timeTakenSeconds: { type: Number, default: 0 },
    attemptsUsed: { type: Number, default: 1 },
    hintsUsed: { type: Number, default: 0 },
    completedItems: { type: Number, default: 0 },
    totalItems: { type: Number, default: 0 },
    correct: { type: Boolean, default: false },
    score: { type: Number, default: 0 },
    feedback: String,
    finalSubmitted: { type: Boolean, default: false, index: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
LiveQuestionResponseSchema.index({ question: 1, student: 1 }, { unique: true });
ClassroomSessionSchema.index({ classroom: 1, scheduledSessionId: 1 }, { unique: true });

const StudentRewardSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sourceType: { type: String, required: true, index: true },
    sourceId: { type: Schema.Types.ObjectId, index: true },
    xp: { type: Number, default: 0 },
    coins: { type: Number, default: 0 },
    badge: String,
    reason: String,
  },
  { timestamps: true }
);

export type ClassroomSessionDoc = InferSchemaType<typeof ClassroomSessionSchema> & { _id: any };
export type LiveQuestionDoc = InferSchemaType<typeof LiveQuestionSchema> & { _id: any };
export type LiveQuestionResponseDoc = InferSchemaType<typeof LiveQuestionResponseSchema> & { _id: any };
export type StudentRewardDoc = InferSchemaType<typeof StudentRewardSchema> & { _id: any };
export type ClassroomChatMessageDoc = InferSchemaType<typeof ClassroomChatMessageSchema> & { _id: any };

export const ClassroomSession = models.ClassroomSession || model("ClassroomSession", ClassroomSessionSchema);
export const LiveQuestion = models.LiveQuestion || model("LiveQuestion", LiveQuestionSchema);
export const LiveQuestionResponse = models.LiveQuestionResponse || model("LiveQuestionResponse", LiveQuestionResponseSchema);
export const StudentReward = models.StudentReward || model("StudentReward", StudentRewardSchema);
export const ClassroomChatMessage = models.ClassroomChatMessage || model("ClassroomChatMessage", ClassroomChatMessageSchema);
