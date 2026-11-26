import { NextResponse } from "next/server";
import { errorMessage, forbidden, getCareersActor } from "@/lib/careers/careersAccess";
import { cancelInvite, deleteInvite, resendInvite, restoreInvite } from "@/lib/careers/inviteService";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** `{ action: "resend" | "cancel" | "restore" }` */
export async function PATCH(req: Request, { params }: Params) {
  const actor = await getCareersActor("edit");
  if (!actor) return forbidden();
  const body = await req.json().catch(() => ({}));
  try {
    if (body?.action === "resend") return NextResponse.json(await resendInvite(params.id, actor));
    if (body?.action === "cancel") return NextResponse.json({ invite: await cancelInvite(params.id, actor) });
    if (body?.action === "restore") return NextResponse.json({ invite: await restoreInvite(params.id) });
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const actor = await getCareersActor("delete");
  if (!actor) return forbidden();
  await deleteInvite(params.id);
  return NextResponse.json({ ok: true });
}
