import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthorizedChessStudent } from "@/lib/chess/access";
import { syncChessAccountNow } from "@/lib/chess/sync";

export const dynamic = "force-dynamic";

const syncSchema = z.object({
  accountId: z.string().min(1),
  studentId: z.string().optional(),
});

export async function POST(req: Request) {
  const body = syncSchema.parse(await req.json());
  const access = await resolveAuthorizedChessStudent(body.studentId, "sync");
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const job = await syncChessAccountNow(access.studentId, body.accountId);
    return NextResponse.json(job);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start chess sync." }, { status: 400 });
  }
}
