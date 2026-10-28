import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { createStudent, listStudents } from "@/lib/branch/service";
import { sendWelcomeEmail } from "@/lib/welcomeEmail";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("view");
  if (!access) return forbidden();
  try {
    const students = await listStudents(access.branch);
    const seesFees = access.can.has("fees");
    return NextResponse.json({
      students: seesFees ? students : students.map((student) => ({ ...student, monthlyFee: 0, pendingAmount: 0, pendingMonths: [] })),
      canEdit: access.can.has("students"),
      seesFees,
    });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    const created = await createStudent(access.branch, body, access.actorId);
    let welcomeSent = false;
    if (body?.sendLogin !== false) {
      const result = await sendWelcomeEmail({
        name: created.user.name,
        email: created.user.email,
        phone: created.user.phone,
        countryCode: created.user.countryCode,
        username: created.username,
        role: "student",
        temporaryPassword: created.password,
        request: req,
      }).catch((error) => {
        console.error("Branch welcome message failed", error);
        return { delivered: false };
      });
      welcomeSent = Boolean(result?.delivered);
    }
    return NextResponse.json({ id: String(created.student._id), username: created.username, password: created.password, welcomeSent });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
