import { ZodError } from "zod";

/** The first validation message, or the thrown message, for a 400 response. */
export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ZodError) return error.issues[0]?.message || fallback;
  return error instanceof Error && error.message ? error.message : fallback;
}
