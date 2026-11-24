import { NextResponse } from "next/server";
import { errorMessage, forbidden, getCareersActor } from "@/lib/careers/careersAccess";
import { listPostingsForAdmin, savePosting } from "@/lib/careers/careersService";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getCareersActor("view");
  if (!actor) return forbidden();
  return NextResponse.json({ postings: await listPostingsForAdmin() });
}

/** Creates an opening. */
export async function POST(req: Request) {
  const actor = await getCareersActor("create");
  if (!actor) return forbidden();
  try {
    const posting = await savePosting(null, await req.json(), actor);
    return NextResponse.json({ ok: true, posting });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save the opening.") }, { status: 400 });
  }
}
