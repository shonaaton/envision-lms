import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { canAccessConversation } from "@/lib/askCoach";
import { readAskCoachFile } from "@/lib/askCoachAttachments";
import { AskCoachConversation, AskCoachMessage } from "@/models/AskCoach";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

/** RFC 5987 so names with spaces or non-ASCII letters survive the download. */
function contentDisposition(type: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Hands out a file sent in Ask Coach, to the people in that conversation only.
 * Images and PDFs open in the browser; everything else downloads, and nothing
 * is ever served as a page that could run script.
 */
export async function GET(req: Request, { params }: { params: { messageId: string; attachmentId: string } }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const { messageId, attachmentId } = params;
  if (!Types.ObjectId.isValid(messageId) || !Types.ObjectId.isValid(attachmentId)) return notFound();

  await dbConnect();
  const message: any = await AskCoachMessage.findById(messageId).select("conversation status attachments").lean();
  if (!message) return notFound();
  const user = session.user as { id: string; role?: string };
  // Hidden and deleted messages are admin-only, attachments included.
  if (user.role !== "admin" && message.status !== "sent") return notFound();
  const conversation = await AskCoachConversation.findById(message.conversation).select("type participants coach batch").lean();
  if (!(await canAccessConversation(user, conversation))) return notFound();

  const attachment = (message.attachments || []).find((item: any) => item._id?.toString() === attachmentId);
  if (!attachment?.storedName || attachment.kind === "link") return notFound();
  const data = await readAskCoachFile(attachment.storedName);
  if (!data) return notFound();

  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";
  const opensInline = !wantsDownload && (attachment.kind === "image" || attachment.mimeType === "application/pdf");
  const headers: Record<string, string> = {
    "Content-Type": attachment.mimeType || "application/octet-stream",
    "Content-Length": String(data.length),
    "Content-Disposition": contentDisposition(opensInline ? "inline" : "attachment", attachment.name || "file"),
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };
  // Chrome's PDF viewer does not load under a sandboxing CSP; images and
  // downloads get the strictest one.
  if (attachment.mimeType !== "application/pdf") headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
  return new Response(new Uint8Array(data), { headers });
}
