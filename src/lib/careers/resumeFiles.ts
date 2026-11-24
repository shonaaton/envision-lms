import "server-only";

import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { uploadsRoot } from "@/lib/uploads";
import { cleanFileName, fileExtension, matchesSignature } from "@/lib/askCoachAttachmentRules";
import { RESUME_MAX_BYTES } from "@/lib/careers/careersConfig";

/**
 * Resumes sent with a careers application. Stored under UPLOADS_DIR in an area
 * the public `/uploads` route does not serve; they are only handed out by
 * /api/admin/careers/applications/[id]/resume, which checks for an admin.
 * Same pattern as Ask Coach attachments (lib/askCoachAttachments.ts).
 */
const AREA = "careers-resumes";
const STORED_NAME = /^[a-f0-9-]{36}\.[a-z0-9]{1,8}$/;

export const RESUME_RULES: Record<string, { mimeType: string; signature: "pdf" | "zip" | "ole" }> = {
  ".pdf": { mimeType: "application/pdf", signature: "pdf" },
  ".doc": { mimeType: "application/msword", signature: "ole" },
  ".docx": { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", signature: "zip" },
};

export type StoredResume = { storedName: string; name: string; mimeType: string; size: number };

function filePath(storedName: string) {
  if (!STORED_NAME.test(storedName)) throw new Error("Invalid file name.");
  return path.join(uploadsRoot(), AREA, storedName);
}

/** Why this file can't be a resume, or "" when it can. */
export function resumeProblem(name: string, size: number, bytes?: Uint8Array) {
  const rule = RESUME_RULES[fileExtension(name)];
  if (!rule) return "Please upload your resume as a PDF or Word file.";
  if (!size) return "The resume file is empty.";
  if (size > RESUME_MAX_BYTES) return "The resume must be 10 MB or smaller.";
  if (bytes && !matchesSignature(rule.signature, bytes)) return "That file does not look like a real PDF or Word document.";
  return "";
}

export async function saveResume(file: File): Promise<StoredResume> {
  const data = Buffer.from(await file.arrayBuffer());
  const problem = resumeProblem(file.name, data.length, data);
  if (problem) throw new Error(problem);
  const extension = fileExtension(file.name);
  const rule = RESUME_RULES[extension];
  await mkdir(path.join(uploadsRoot(), AREA), { recursive: true });
  const storedName = `${globalThis.crypto.randomUUID()}${extension}`;
  await writeFile(filePath(storedName), data);
  return { storedName, name: cleanFileName(file.name), mimeType: rule.mimeType, size: data.length };
}

export async function readResume(storedName: string) {
  try {
    return await readFile(filePath(storedName));
  } catch {
    return null;
  }
}

export async function removeResume(storedName?: string | null) {
  if (!storedName) return;
  await unlink(filePath(storedName)).catch(() => undefined);
}
