import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { whatsappSession } from "@/lib/whatsappAccess";
import { WhatsAppTemplate } from "@/models/WhatsAppTemplate";
import { templateAccountFilter } from "@/lib/whatsappTemplateLibrary";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await whatsappSession("manage");
  if (!user || user.role === "instructor") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!Types.ObjectId.isValid(params.id)) return NextResponse.json({ error: "Invalid draft." }, { status: 400 });
  await dbConnect();
  const result = await WhatsAppTemplate.deleteOne({ _id: params.id, ...templateAccountFilter(), status: { $in: ["DRAFT", "SUBMISSION_FAILED"] } });
  return NextResponse.json(result.deletedCount ? { ok: true } : { error: "Only unsubmitted drafts can be deleted here." }, { status: result.deletedCount ? 200 : 409 });
}
