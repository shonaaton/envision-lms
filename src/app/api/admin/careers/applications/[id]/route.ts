import { NextResponse } from "next/server";
import { errorMessage, forbidden, getCareersActor } from "@/lib/careers/careersAccess";
import {
  addApplicationNote,
  deleteApplication,
  getApplication,
  hireApplicant,
  rateApplication,
  scheduleInterview,
  setApplicationStage,
} from "@/lib/careers/careersService";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const actor = await getCareersActor("view");
  if (!actor) return forbidden();
  const application = await getApplication(params.id);
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ application });
}

/**
 * One action per call:
 * - `{ action: "stage", stage, notify }`
 * - `{ action: "interview", at, link, note, notify }`
 * - `{ action: "note", text }` / `{ action: "rating", rating }`
 * - `{ action: "hire", accountRole, accessRole, email, notify }` (needs Approve)
 */
export async function PATCH(req: Request, { params }: Params) {
  const body = await req.json().catch(() => ({}));
  const actor = await getCareersActor(body?.action === "hire" ? "approve" : "edit");
  if (!actor) return forbidden();
  try {
    switch (body?.action) {
      case "stage":
        await setApplicationStage(params.id, body.stage, actor, { notify: body.notify !== false });
        break;
      case "interview":
        await scheduleInterview(params.id, { at: new Date(body.at), link: body.link, note: body.note, notify: body.notify !== false }, actor);
        break;
      case "note":
        await addApplicationNote(params.id, body.text, actor);
        break;
      case "rating":
        await rateApplication(params.id, body.rating);
        break;
      case "hire": {
        const accountRole = ["instructor", "sub-admin", "none"].includes(body.accountRole) ? body.accountRole : "instructor";
        const result = await hireApplicant(params.id, { accountRole, accessRole: body.accessRole || null, email: body.email, notify: body.notify !== false }, actor);
        return NextResponse.json({ ok: true, ...result, application: await getApplication(params.id) });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, application: await getApplication(params.id) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const actor = await getCareersActor("delete");
  if (!actor) return forbidden();
  await deleteApplication(params.id, actor);
  return NextResponse.json({ ok: true });
}
