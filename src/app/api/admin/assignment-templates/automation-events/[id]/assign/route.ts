import { NextResponse } from "next/server";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { assignFromEvent, EventActionError, loadEventAssignContext } from "@/lib/homeworkAutomationEvents";
import { automationEventAccess } from "../../access";

export const dynamic = "force-dynamic";

function failure(error: any) {
  if (error instanceof EventActionError) return NextResponse.json({ error: error.message }, { status: error.status });
  // A template whose stored activities no longer pass the Homework schema.
  if (error?.name === "ValidationError") return NextResponse.json({ error: `This template could not be copied into homework: ${error.message}` }, { status: 400 });
  console.error("Automation event assign failed", error);
  return NextResponse.json({ error: error?.message || "Could not complete this." }, { status: 500 });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const access = await automationEventAccess();
  if (!access.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  try {
    return NextResponse.json(await loadEventAssignContext(params.id, new URL(req.url).searchParams.get("q") || ""));
  } catch (error) {
    return failure(error);
  }
}

const schema = z.object({
  templateId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a template"),
  dueAt: z.string().datetime(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await automationEventAccess();
  if (!access.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });
  await dbConnect();
  try {
    const result = await assignFromEvent({ eventId: params.id, templateId: parsed.data.templateId, dueAt: new Date(parsed.data.dueAt), actorId: access.actorId || "" });
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}
