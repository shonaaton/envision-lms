import { NextResponse } from "next/server";
import { familyView } from "@/lib/retention/familyCallService";
import { requireRetentionAccess } from "@/lib/retention/retentionAccess";
import { errorMessage } from "@/lib/retention/routeErrors";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { studentId: string } }) {
  const session = await requireRetentionAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await familyView(params.studentId));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load this family.") }, { status: 404 });
  }
}
