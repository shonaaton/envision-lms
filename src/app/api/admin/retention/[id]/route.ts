import { NextResponse } from "next/server";
import { requireRetentionAccess, retentionActor } from "@/lib/retention/retentionAccess";
import { logContact, resolveFlag } from "@/lib/retention/retentionService";

export const dynamic = "force-dynamic";

/** `{ action: "contact", channel, note }` logs a call; `{ action: "resolve", outcome, note }` settles the flag and its task. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireRetentionAccess("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const actor = retentionActor(session);
  try {
    if (body.action === "contact") return NextResponse.json(await logContact(params.id, body, actor));
    if (body.action === "resolve") return NextResponse.json(await resolveFlag(params.id, body, actor));
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not update this flag." }, { status: 400 });
  }
}
