import { NextResponse } from "next/server";
import { admissionFile } from "@/lib/branch/admissions";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** The photo or identity document from an admission form, to branch staff who manage students only. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    const kind = new URL(req.url).searchParams.get("kind") === "photo" ? "photo" : "idDocument";
    const file = await admissionFile(access.branch, params.id, kind);
    if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // A PDF opens in the browser's viewer; nothing in it may run scripts here.
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
