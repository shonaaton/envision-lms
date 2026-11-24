import { NextResponse } from "next/server";
import { errorMessage, forbidden, getCareersActor } from "@/lib/careers/careersAccess";
import { deletePosting, duplicatePosting, getPostingForAdmin, savePosting, setPostingStatus } from "@/lib/careers/careersService";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const actor = await getCareersActor("view");
  if (!actor) return forbidden();
  const posting = await getPostingForAdmin(params.id);
  if (!posting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ posting });
}

/** Saves the whole opening from the editor. */
export async function PUT(req: Request, { params }: Params) {
  const actor = await getCareersActor("edit");
  if (!actor) return forbidden();
  try {
    const posting = await savePosting(params.id, await req.json(), actor);
    return NextResponse.json({ ok: true, posting });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save the opening.") }, { status: 400 });
  }
}

/** `{ action: "status", status }` or `{ action: "duplicate" }`. */
export async function PATCH(req: Request, { params }: Params) {
  const body = await req.json().catch(() => ({}));
  const actor = await getCareersActor(body?.action === "duplicate" ? "create" : "edit");
  if (!actor) return forbidden();
  try {
    if (body?.action === "duplicate") return NextResponse.json({ ok: true, id: await duplicatePosting(params.id, actor) });
    if (body?.action === "status") {
      await setPostingStatus(params.id, body.status, actor);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const actor = await getCareersActor("delete");
  if (!actor) return forbidden();
  try {
    await deletePosting(params.id, actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
