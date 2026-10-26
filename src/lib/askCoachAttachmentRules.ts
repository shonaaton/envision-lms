/**
 * What an Ask Coach message may carry besides its text: images, documents and
 * links. Coaches and admins can attach them; students can only receive them,
 * because a picture or a file is a way round the contact-detail check that
 * every typed message goes through.
 *
 * No filesystem here, so the chat client uses the same limits the API
 * enforces; storage is lib/askCoachAttachments.ts.
 */

export type AskCoachAttachmentKind = "image" | "document" | "link";

export const ASK_COACH_MAX_FILES = 5;
export const ASK_COACH_MAX_LINKS = 5;
export const ASK_COACH_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ASK_COACH_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_URL_LENGTH = 2048;
const MAX_LABEL_LENGTH = 120;

type FileRule = { kind: "image" | "document"; mimeType: string; signature: "jpeg" | "png" | "webp" | "gif" | "pdf" | "zip" | "ole" | "text" };

/** Keyed by extension: the stored type always comes from here, never from the browser. */
const FILE_RULES: Record<string, FileRule> = {
  ".jpg": { kind: "image", mimeType: "image/jpeg", signature: "jpeg" },
  ".jpeg": { kind: "image", mimeType: "image/jpeg", signature: "jpeg" },
  ".png": { kind: "image", mimeType: "image/png", signature: "png" },
  ".webp": { kind: "image", mimeType: "image/webp", signature: "webp" },
  ".gif": { kind: "image", mimeType: "image/gif", signature: "gif" },
  ".pdf": { kind: "document", mimeType: "application/pdf", signature: "pdf" },
  ".doc": { kind: "document", mimeType: "application/msword", signature: "ole" },
  ".docx": { kind: "document", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", signature: "zip" },
  ".xls": { kind: "document", mimeType: "application/vnd.ms-excel", signature: "ole" },
  ".xlsx": { kind: "document", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", signature: "zip" },
  ".ppt": { kind: "document", mimeType: "application/vnd.ms-powerpoint", signature: "ole" },
  ".pptx": { kind: "document", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", signature: "zip" },
  ".txt": { kind: "document", mimeType: "text/plain; charset=utf-8", signature: "text" },
  ".csv": { kind: "document", mimeType: "text/csv; charset=utf-8", signature: "text" },
  ".pgn": { kind: "document", mimeType: "application/x-chess-pgn", signature: "text" },
};

/** For the file picker's `accept` attribute. */
export const ASK_COACH_ACCEPT = Object.keys(FILE_RULES).join(",");

export function canAttachToAskCoach(role: unknown) {
  return role === "instructor" || role === "admin" || role === "sub-admin";
}

export function fileExtension(name: string) {
  const match = /\.[a-z0-9]{1,8}$/i.exec(String(name || "").trim());
  return match ? match[0].toLowerCase() : "";
}

export function fileRuleFor(name: string) {
  return FILE_RULES[fileExtension(name)] || null;
}

/** The display name kept on the message: no path, no control characters, a sane length. */
export function cleanFileName(name: string) {
  const base = String(name || "").split(/[\\/]/).pop() || "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 120) return cleaned || "file";
  const extension = fileExtension(cleaned);
  return `${cleaned.slice(0, 120 - extension.length)}${extension}`;
}

/** True when the first bytes are what the extension says the file is. */
export function matchesSignature(signature: FileRule["signature"], bytes: Uint8Array) {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  switch (signature) {
    case "jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "png":
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "gif":
      return starts(0x47, 0x49, 0x46, 0x38);
    case "webp":
      return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    case "pdf":
      return starts(0x25, 0x50, 0x44, 0x46);
    case "zip":
      return starts(0x50, 0x4b, 0x03, 0x04);
    case "ole":
      return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    case "text":
      return bytes.length > 0 && !bytes.subarray(0, 4096).includes(0);
  }
}

export type IncomingFile = { name: string; size: number };

/** Checks the picked files against the limits; the first problem, or null. */
export function fileListProblem(files: IncomingFile[]) {
  if (files.length > ASK_COACH_MAX_FILES) return `You can attach up to ${ASK_COACH_MAX_FILES} files to one message.`;
  let total = 0;
  for (const file of files) {
    if (!fileRuleFor(file.name)) return `${cleanFileName(file.name)} is not a supported file. Send images, PDF, Word, Excel, PowerPoint, text, CSV or PGN files.`;
    if (!file.size) return `${cleanFileName(file.name)} is empty.`;
    if (file.size > ASK_COACH_MAX_FILE_BYTES) return `${cleanFileName(file.name)} is larger than 10 MB.`;
    total += file.size;
  }
  if (total > ASK_COACH_MAX_TOTAL_BYTES) return "Attachments on one message must add up to 25 MB or less.";
  return null;
}

/**
 * A typed link as a safe http(s) URL, or null. A bare domain gets https://;
 * javascript:, data: and anything else with a scheme of its own are refused.
 */
export function normalizeLinkUrl(value: unknown) {
  let text = String(value || "").trim();
  if (!text || text.length > MAX_URL_LENGTH || /\s/.test(text)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || !url.hostname.includes(".") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export type LinkAttachmentInput = { url: string; label: string };

/** Validates the links sent with a message; throws a user-facing message on the first bad one. */
export function parseLinkAttachments(value: unknown): LinkAttachmentInput[] {
  const items = Array.isArray(value) ? value : [];
  if (items.length > ASK_COACH_MAX_LINKS) throw new Error(`You can add up to ${ASK_COACH_MAX_LINKS} links to one message.`);
  return items.map((item) => {
    const url = normalizeLinkUrl((item as { url?: unknown })?.url);
    if (!url) throw new Error("One of the links is not a valid web address.");
    const label = String((item as { label?: unknown })?.label || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_LABEL_LENGTH);
    return { url, label };
  });
}

export type BodySegment = { type: "text"; text: string } | { type: "link"; text: string; href: string };

const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

/** Splits message text so web addresses in it can be shown as links. */
export function linkifySegments(text: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let last = 0;
  for (const match of String(text || "").matchAll(URL_IN_TEXT)) {
    let raw = match[0];
    // Sentence punctuation after a link is not part of it; a closing bracket is
    // only kept when the link opened one (Wikipedia-style URLs).
    while (/[.,!?;:'"]$/.test(raw) || (raw.endsWith(")") && (raw.match(/\(/g) || []).length < (raw.match(/\)/g) || []).length)) {
      raw = raw.slice(0, -1);
    }
    const href = normalizeLinkUrl(raw);
    const start = match.index ?? 0;
    if (!href) continue;
    if (start > last) segments.push({ type: "text", text: text.slice(last, start) });
    segments.push({ type: "link", text: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments;
}

export type AttachmentSummaryInput = { kind: AskCoachAttachmentKind; name?: string; label?: string; url?: string };

/** One line standing in for the attachments where only text fits (previews, emails). */
export function attachmentSummary(attachments: AttachmentSummaryInput[]) {
  if (!attachments.length) return "";
  const images = attachments.filter((item) => item.kind === "image").length;
  const documents = attachments.filter((item) => item.kind === "document");
  const links = attachments.filter((item) => item.kind === "link");
  const parts: string[] = [];
  if (images) parts.push(images === 1 ? "an image" : `${images} images`);
  if (documents.length) parts.push(documents.length === 1 ? `a document (${documents[0].name || "file"})` : `${documents.length} documents`);
  if (links.length) parts.push(links.length === 1 ? `a link (${links[0].label || links[0].url || "link"})` : `${links.length} links`);
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `Shared ${joined}`;
}

export function formatFileSize(bytes: number) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
