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

export const classroomSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  feePerMonth: z.number().int().min(0).default(0),
  schedule: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string(),
        endTime: z.string(),
        meetingUrl: z.string().url().optional(),
      })
    )
    .default([]),
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
  amount: z.number().int().min(100), // min ₹1
});
