import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.enum(["student", "instructor"]).default("student"),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const addUserSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8).max(72).optional(), // auto-generated if omitted
  role: z.enum(["student", "instructor", "admin"]),
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

export const homeworkSchema = z.object({
  classroom: z.string(),
  title: z.string().min(2),
  description: z.string().optional(),
  dueAt: z.string().datetime().optional(),
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

export const bookingSchema = z.object({
  instructor: z.string(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
});

export const orderSchema = z.object({
  purpose: z.enum(["enrollment", "booking", "tournament", "other"]),
  refId: z.string().optional(),
  amount: z.number().int().min(100),
});
