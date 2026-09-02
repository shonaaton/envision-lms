import { z } from "zod";

const optionalText = (max: number) => z.preprocess((value) => (value == null || value === "" ? undefined : value), z.string().max(max).optional());

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  parentName: optionalText(80),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.enum(["student", "instructor"]).default("student"),
  countryCode: optionalText(8),
  phone: optionalText(40),
  city: optionalText(80),
  country: optionalText(80),
  level: z.preprocess((value) => (value == null || value === "" ? undefined : value), z.enum(["absolute_beginner", "beginner", "intermediate", "advanced", "federated"]).optional()),
  acceptedPrivacy: z.boolean().default(false),
  acceptedTerms: z.boolean().default(false),
  acceptedRefund: z.boolean().default(false),
  coachExperience: optionalText(3000),
  playingLevel: optionalText(120),
  fideId: optionalText(80),
  rating: z.number().int().min(0).max(3500).default(0),
  preferredStudents: optionalText(1000),
  availabilityNote: optionalText(1000),
  message: optionalText(3000),
});

export const loginSchema = z.object({
  email: z.string().min(2),
  password: z.string().min(1),
});

export const addUserSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  countryCode: optionalText(8),
  phone: optionalText(40),
  password: z.string().min(8).max(72).optional(), // auto-generated if omitted
  role: z.enum(["student", "instructor", "admin", "sub-admin"]),
  accountStatus: z.enum(["demo", "enrolled", "coach_applicant", "approved", "rejected"]).optional(),
  tags: z.array(z.string()).default([]),
  batches: z.array(z.string()).default([]),
  fideId: z.string().optional(),
  rating: z.number().int().min(0).max(3500).default(0),
  notes: z.string().optional(),
});

export const batchSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().optional(),
  coach: z.string().optional(),
  students: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
});

export const classroomSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  feePerMonth: z.number().int().min(0).default(0),
  meetingProvider: z.enum(["chessplay", "lichess", "zoom", "meet", "other"]).default("chessplay"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  frequency: z.enum(["weekly", "biweekly", "custom"]).default("weekly"),
  repeatEvery: z.number().int().min(1).default(1),
  daysOfWeek: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        slots: z
          .array(
            z.object({
              startTime: z.string(),
              durationMinutes: z.number().int().min(15).default(60),
            })
          )
          .default([]),
      })
    )
    .default([]),
  endCondition: z.enum(["on_date", "after_n_sessions", "never"]).default("on_date"),
  endAfterSessions: z.number().int().min(1).optional(),
  coach: z.string().optional(),
  students: z.array(z.string()).default([]),
  batches: z.array(z.string()).default([]),
});

const assignmentActivityTypeSchema = z.enum([
  "solve_position",
  "quiz",
  "written_answer",
  "play_computer",
  "find_best_move",
  "find_combination",
  "study_pgn",
  "analyze_position",
  "endgame_practice",
  "opening_practice",
]);

const assignmentQuizOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  correct: z.boolean().default(false),
});

const assignmentActivityItemSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  question: z.string().optional(),
  positionFen: z.string().optional(),
  options: z.array(assignmentQuizOptionSchema).default([]),
  multipleCorrect: z.boolean().default(false),
  explanation: z.string().optional(),
  expectedAnswer: z.string().optional(),
  answerText: z.string().optional(),
  fen: z.string().optional(),
  solution: z.array(z.string()).default([]),
  pgn: z.string().optional(),
  pgnTitle: z.string().optional(),
  pgnSourceId: z.string().optional(),
  source: z.any().optional(),
  correctAnswers: z.array(z.number().int().min(0)).default([]),
  points: z.number().int().min(0).default(1),
});

const assignmentActivitySchema = z.object({
  type: assignmentActivityTypeSchema,
  title: z.string().min(1).default("Untitled activity"),
  instructions: z.string().optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  points: z.number().int().min(0).default(1),
  timeLimitMinutes: z.number().int().min(0).default(0),
  topic: z.string().optional(),
  opening: z.string().optional(),
  endgame: z.string().optional(),
  tacticalTheme: z.string().optional(),
  tags: z.array(z.string()).default([]),
  fen: z.string().optional(),
  solution: z.array(z.string()).default([]),
  pgn: z.string().optional(),
  pgnTitle: z.string().optional(),
  pgnSourceId: z.string().optional(),
  source: z.any().optional(),
  items: z.array(assignmentActivityItemSchema).default([]),
  quiz: z
    .object({
      question: z.string().optional(),
      options: z.array(assignmentQuizOptionSchema).default([]),
      correctAnswers: z.array(z.number().int().min(0)).default([]),
      multipleCorrect: z.boolean().default(false),
      explanation: z.string().optional(),
      positionFen: z.string().optional(),
      expectedAnswer: z.string().optional(),
    })
    .optional(),
  computer: z
    .object({
      strength: z.string().default("beginner"),
      rating: z.number().int().min(0).max(3500).optional(),
      side: z.enum(["white", "black", "random"]).default("white"),
      objective: z.string().optional(),
      timeControl: z
        .object({
          type: z.enum(["untimed", "fixed", "increment"]).default("untimed"),
          minutes: z.number().int().min(0).default(0),
          increment: z.number().int().min(0).default(0),
        })
        .optional(),
      completion: z.string().optional(),
      requiredMoves: z.number().int().min(0).optional(),
    })
    .optional(),
});

export const homeworkSchema = z.object({
  classroom: z.string(),
  title: z.string().min(2),
  description: z.string().optional(),
  instructions: z.string().optional(),
  assignedStudents: z.array(z.string()).default([]),
  assignedBatches: z.array(z.string()).default([]),
  assignAllStudents: z.boolean().default(false),
  dueAt: z.string().datetime().optional(),
  numberOfAttempts: z.number().int().min(1).default(1),
  timeLimitMinutes: z.number().int().min(0).default(0),
  activities: z.array(assignmentActivitySchema).default([]),
  puzzles: z
    .array(
      z.object({
        fen: z.string(),
        solution: z.array(z.string()).default([]),
        prompt: z.string().optional(),
        points: z.number().int().min(1).default(1),
      })
    )
    .default([]),
});

export const assignmentTemplateSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().optional(),
  instructions: z.string().optional(),
  course: z.string().optional(),
  courseName: z.string().optional(),
  level: z.enum(["beginner", "intermediate", "advanced", "mixed", ""]).default(""),
  levelName: z.string().optional(),
  topicName: z.string().min(1).max(160),
  activities: z.array(assignmentActivitySchema).default([]),
  puzzles: z
    .array(
      z.object({
        fen: z.string(),
        solution: z.array(z.string()).default([]),
        prompt: z.string().optional(),
        points: z.number().int().min(1).default(1),
      })
    )
    .default([]),
  numberOfAttempts: z.number().int().min(1).default(1),
  timeLimitMinutes: z.number().int().min(0).default(0),
  targetMode: z.enum(["classroom_batches", "all_class_students", "specific_batches", "specific_students"]).default("classroom_batches"),
  defaultBatches: z.array(z.string()).default([]),
  defaultStudents: z.array(z.string()).default([]),
  duePolicy: z
    .object({
      type: z.enum(["before_next_class", "days_after_class"]).default("before_next_class"),
      minutesBefore: z.number().int().min(0).default(1),
      daysAfterClass: z.number().int().min(1).default(7),
      noNextClassBehavior: z.enum(["assign_without_due", "skip"]).default("assign_without_due"),
    })
    .default({ type: "before_next_class", minutesBefore: 1, daysAfterClass: 7, noNextClassBehavior: "assign_without_due" }),
  autoAssign: z.boolean().default(true),
  isActive: z.boolean().default(true),
  linkStatus: z.enum(["linked", "needs_review", "unlinked"]).default("unlinked"),
  source: z
    .object({
      kind: z.enum(["manual", "pgn_import", "mcq_import"]).default("manual"),
      pgnIds: z.array(z.string()).default([]),
      fileNames: z.array(z.string()).default([]),
      importBatchId: z.string().optional(),
    })
    .optional(),
});

export const bookingSchema = z.object({
  instructor: z.string().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
  timezone: z.string().optional(),
  idempotencyKey: z.string().max(120).optional(),
  bookingType: z.enum(["demo", "credit_class", "regular"]).default("regular"),
  notes: z.string().max(1000).optional(),
});

export const orderSchema = z.object({
  purpose: z.enum(["enrollment", "booking", "tournament", "invoice", "other"]),
  refId: z.string().optional(),
  amount: z.number().int().min(100),
});
