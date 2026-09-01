import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthorizedChessStudent } from "@/lib/chess/access";
import { startChessSync } from "@/lib/chess/sync";

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
    const job: any = await startChessSync(access.studentId, body.accountId);
    return NextResponse.json({ id: job._id?.toString?.() || job.toString(), status: job.status || "PENDING" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start chess sync." }, { status: 400 });
  }
}
