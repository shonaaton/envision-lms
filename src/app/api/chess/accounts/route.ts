import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthorizedChessStudent } from "@/lib/chess/access";
import { ChessAccount } from "@/models/Chess";
import { dbConnect } from "@/lib/db";
import { disconnectChessAccount, linkChessAccount } from "@/lib/chess/sync";

export const dynamic = "force-dynamic";

const linkSchema = z.object({
  platform: z.enum(["CHESS_COM", "LICHESS"]),
  username: z.string().trim().min(1).max(80),
  studentId: z.string().optional(),
});

export async function POST(req: Request) {
  const body = linkSchema.parse(await req.json());
  const access = await resolveAuthorizedChessStudent(body.studentId, "manage_accounts");
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const account = await linkChessAccount(access.studentId, body.platform, body.username);
    return NextResponse.json({ id: account._id.toString(), platform: account.platform, username: account.username, syncStatus: account.syncStatus });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not link chess account." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  const requestedStudentId = url.searchParams.get("studentId");
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });
  await dbConnect();
  const account: any = await ChessAccount.findById(accountId, { student: 1 }).lean();
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const access = await resolveAuthorizedChessStudent(requestedStudentId || account.student?.toString?.(), "manage_accounts");
  if (!access || account.student?.toString?.() !== access.studentId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await disconnectChessAccount(access.studentId, accountId);
  return NextResponse.json({ ok: true });
}
