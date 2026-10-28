import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { commitBranchImport, previewBranchImport, type ImportFiles } from "@/lib/branch/import";
import { BranchError } from "@/lib/branch/service";

export const dynamic = "force-dynamic";

const MAX_UPLOAD = 5 * 1024 * 1024;

async function fileFrom(form: FormData, field: string, label: string) {
  const file = form.get(field);
  if (!file || typeof file === "string") throw new BranchError(`Choose the ${label}.`);
  if (file.size > MAX_UPLOAD) throw new BranchError(`The ${label} is over 5 MB.`);
  return { buffer: Buffer.from(await file.arrayBuffer()), name: file.name || field };
}

/**
 * The centre's old student list and fees report: `action=preview` reads them
 * and says what would happen; `action=commit` does it. A route, not a server
 * action, because server actions stop at 1 MB.
 */
export async function POST(req: Request) {
  const access = await requireBranchAccess("students");
  if (!access || !access.can.has("fees")) return forbidden();
  try {
    const form = await req.formData();
    const files: ImportFiles = {
      students: await fileFrom(form, "students", "student list"),
      report: await fileFrom(form, "report", "fees report"),
    };
    if (form.get("action") === "commit") {
      const options = JSON.parse(String(form.get("options") || "{}"));
      return NextResponse.json(
        await commitBranchImport(
          access.branch,
          files,
          { mapping: options.mapping || {}, fees: options.fees || {}, raiseCurrentMonth: options.raiseCurrentMonth !== false },
          access.actorId
        )
      );
    }
    return NextResponse.json(await previewBranchImport(access.branch, files));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
