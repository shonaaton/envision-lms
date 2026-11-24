import { Types } from "mongoose";
import { getCareersActor } from "@/lib/careers/careersAccess";
import { readResume } from "@/lib/careers/resumeFiles";
import { dbConnect } from "@/lib/db";
import { JobApplication } from "@/models/Careers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

function contentDisposition(type: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** An applicant's resume, to admins only. PDFs open in the browser; Word files download. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const actor = await getCareersActor("view");
  if (!actor) return new Response("Forbidden", { status: 403 });
  if (!Types.ObjectId.isValid(params.id)) return notFound();
  await dbConnect();
  const application: any = await JobApplication.findById(params.id).select("resume").lean();
  const resume = application?.resume;
  if (!resume?.storedName) return notFound();
  const data = await readResume(resume.storedName);
  if (!data) return notFound();
  const isPdf = resume.mimeType === "application/pdf";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": resume.mimeType || "application/octet-stream",
      "Content-Length": String(data.length),
      "Content-Disposition": contentDisposition(isPdf ? "inline" : "attachment", resume.name || "resume"),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    },
  });
}
