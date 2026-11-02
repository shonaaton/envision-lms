import "server-only";

import { Types } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { FAMILY_QUESTION_TYPES, FamilyCallQuestion } from "@/models/FamilyCall";

/** The questions the bank starts with. Edit them on the Questions tab, not here. */
const STARTER_QUESTIONS = [
  { seedKey: "enjoying", text: "Is your child enjoying the classes?", type: "choice", options: ["Loves it", "It's fine", "Not really"], perStudent: true },
  { seedKey: "timing", text: "Is the class timing working for you?", type: "yesno", options: [], perStudent: false },
  { seedKey: "homework", text: "Is homework getting done at home? If not, what gets in the way?", type: "text", options: [], perStudent: true },
  { seedKey: "portal", text: "Does your child practise on the online portal between classes?", type: "choice", options: ["Regularly", "Sometimes", "Rarely", "Didn't know about it"], perStudent: true },
  { seedKey: "coach", text: "Anything about the coach or the class we should know?", type: "text", options: [], perStudent: false },
] as const;

export const questionSchema = z.object({
  text: z.string().trim().min(5, "Write the question.").max(300),
  type: z.enum(FAMILY_QUESTION_TYPES),
  options: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  perStudent: z.boolean().default(false),
  active: z.boolean().optional(),
  order: z.coerce.number().int().min(0).max(1000).optional(),
}).superRefine((value, ctx) => {
  if (value.type === "choice" && value.options.length < 2) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "A choice question needs at least two options." });
});

let seeded = false;

/** Adds the starter questions once. Seed keys are unique, so two instances racing add them once. */
export async function ensureStarterQuestions() {
  if (seeded) return;
  await dbConnect();
  await Promise.all(STARTER_QUESTIONS.map((question, index) => FamilyCallQuestion.updateOne(
    { seedKey: question.seedKey },
    { $setOnInsert: { ...question, options: [...question.options], order: (index + 1) * 10, active: true } },
    { upsert: true }
  ).catch((error: any) => {
    if (error?.code !== 11000) throw error;
  })));
  seeded = true;
}

export async function listQuestions(options: { includeInactive?: boolean } = {}) {
  await ensureStarterQuestions();
  const rows: any[] = await FamilyCallQuestion.find(options.includeInactive ? {} : { active: true }).sort({ active: -1, order: 1, createdAt: 1 }).lean();
  return rows.map(shapeQuestion);
}

export async function createQuestion(raw: unknown, actorId: string) {
  const input = questionSchema.parse(raw);
  await dbConnect();
  const last: any = await FamilyCallQuestion.findOne().sort({ order: -1 }).select("order").lean();
  const created = await FamilyCallQuestion.create({
    ...input,
    options: input.type === "choice" ? input.options : [],
    order: input.order ?? (Number(last?.order) || 0) + 10,
    active: input.active ?? true,
    updatedBy: Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : undefined,
  });
  return shapeQuestion(created.toObject());
}

/** Old calls keep the text they were asked with, so editing a question is safe. */
export async function updateQuestion(id: string, raw: unknown, actorId: string) {
  if (!Types.ObjectId.isValid(id)) throw new Error("Unknown question.");
  const input = questionSchema.parse(raw);
  await dbConnect();
  const updated: any = await FamilyCallQuestion.findByIdAndUpdate(
    id,
    {
      $set: {
        text: input.text,
        type: input.type,
        options: input.type === "choice" ? input.options : [],
        perStudent: input.perStudent,
        ...(input.active === undefined ? {} : { active: input.active }),
        ...(input.order === undefined ? {} : { order: input.order }),
        updatedBy: Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : undefined,
      },
    },
    { new: true }
  ).lean();
  if (!updated) throw new Error("Unknown question.");
  return shapeQuestion(updated);
}

function shapeQuestion(row: any) {
  return {
    _id: String(row._id),
    text: String(row.text || ""),
    type: String(row.type || "text") as (typeof FAMILY_QUESTION_TYPES)[number],
    options: (row.options || []).map(String),
    perStudent: Boolean(row.perStudent),
    order: Number(row.order) || 0,
    active: row.active !== false,
  };
}

export type FamilyQuestion = ReturnType<typeof shapeQuestion>;
